-- PetMi Hub — contratos de contas a pagar recorrentes (aluguel, energia, folha fixa).
-- Pré-requisitos: 113_create_hub_payables.sql, 115_alter_hub_payables_supplier.sql.
-- Cada competência vira um hub_payables (source_type = recurrence). A geração
-- materializa só o mês atual e o próximo; este script não cria títulos.

ALTER TABLE public.hub_payables
  ADD COLUMN IF NOT EXISTS recurrence_detached boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hub_payables.recurrence_detached IS
  'Competência editada à mão: o contrato recorrente não sobrescreve este título.';

-- O CHECK inline de source_type não tem nome estável entre ambientes.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'hub_payables'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%source_type%'
    AND pg_get_constraintdef(con.oid) NOT ILIKE '%source_id%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.hub_payables DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.hub_payables
  DROP CONSTRAINT IF EXISTS hub_payables_source_type_check;

ALTER TABLE public.hub_payables
  ADD CONSTRAINT hub_payables_source_type_check
  CHECK (source_type IN ('surgery', 'manual', 'recurrence'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hub_payables_source_recurrence_has_id'
  ) THEN
    ALTER TABLE public.hub_payables
      ADD CONSTRAINT hub_payables_source_recurrence_has_id
      CHECK (source_type <> 'recurrence' OR source_id IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_payables_recurrence_due
  ON public.hub_payables (clinic_id, source_id, due_date)
  WHERE deleted_at IS NULL
    AND status <> 'cancelled'
    AND source_type = 'recurrence'
    AND due_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.hub_payable_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  category text NOT NULL CHECK (category IN (
    'professional_fee',
    'supplies',
    'services',
    'utilities',
    'payroll',
    'rent',
    'marketing',
    'other'
  )),
  description text NOT NULL,
  notes text,
  payee_staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  payee_supplier_id uuid REFERENCES public.hub_suppliers(id) ON DELETE SET NULL,
  payee_name text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  anchor_date date NOT NULL,
  until_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT hub_payable_schedules_payee_staff_xor_supplier CHECK (
    payee_staff_member_id IS NULL OR payee_supplier_id IS NULL
  ),
  CONSTRAINT hub_payable_schedules_until_on_or_after_anchor CHECK (
    until_date IS NULL OR until_date >= anchor_date
  )
);

COMMENT ON TABLE public.hub_payable_schedules IS
  'Contrato contínuo de conta a pagar. Gera títulos pending só no mês atual e no próximo.';
COMMENT ON COLUMN public.hub_payable_schedules.anchor_date IS
  'Primeiro vencimento. No mensal, o dia deste vencimento se repete (fim de mês encurta o dia).';
COMMENT ON COLUMN public.hub_payable_schedules.frequency IS
  'weekly | biweekly (14 dias) | monthly.';

CREATE INDEX IF NOT EXISTS idx_hub_payable_schedules_clinic_unit_status
  ON public.hub_payable_schedules (clinic_id, unit_id, status)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_hub_payable_schedules_updated_at ON public.hub_payable_schedules;
CREATE TRIGGER update_hub_payable_schedules_updated_at
  BEFORE UPDATE ON public.hub_payable_schedules
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
