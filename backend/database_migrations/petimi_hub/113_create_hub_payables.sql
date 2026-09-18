-- PetMi Hub — contas a pagar (honorários, serviços terceiros, etc.).
-- Pré-requisitos: clinics, units, hub_staff_members, hub_surgeries, moddatetime.
-- Despesas caixa (`hub_expenses`) continuam separadas; este ledger cobre obrigações pendentes/pagas.

CREATE TABLE IF NOT EXISTS public.hub_payables (
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
  payee_name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('surgery', 'manual')),
  source_id uuid,
  source_role text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  payment_method text CHECK (payment_method IS NULL OR payment_method IN (
    'pix',
    'cash',
    'credit_card',
    'debit_card',
    'transfer',
    'payment_link',
    'other'
  )),
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT hub_payables_source_surgery_has_id CHECK (
    source_type <> 'surgery' OR source_id IS NOT NULL
  ),
  CONSTRAINT hub_payables_paid_has_paid_at CHECK (
    status <> 'paid' OR paid_at IS NOT NULL
  )
);

COMMENT ON TABLE public.hub_payables IS
  'Contas a pagar da unidade (custo interno). Não entra na cobrança do tutor.';
COMMENT ON COLUMN public.hub_payables.category IS
  'professional_fee = honorário (ex.: anestesista); demais alinham-se a hub_expenses.';
COMMENT ON COLUMN public.hub_payables.source_role IS
  'Papel na origem (ex.: Anestesista) — usado na idempotência da equipe cirúrgica.';

-- Um título ativo por profissional + papel na mesma cirurgia.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_payables_active_surgery_payee_role
  ON public.hub_payables (clinic_id, source_type, source_id, payee_staff_member_id, source_role)
  WHERE deleted_at IS NULL
    AND status <> 'cancelled'
    AND source_type = 'surgery'
    AND payee_staff_member_id IS NOT NULL
    AND source_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_payables_clinic_unit_status
  ON public.hub_payables (clinic_id, unit_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_payables_clinic_unit_due
  ON public.hub_payables (clinic_id, unit_id, due_date)
  WHERE deleted_at IS NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_hub_payables_clinic_unit_paid_at
  ON public.hub_payables (clinic_id, unit_id, paid_at)
  WHERE deleted_at IS NULL AND status = 'paid';

CREATE INDEX IF NOT EXISTS idx_hub_payables_source
  ON public.hub_payables (clinic_id, source_type, source_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_hub_payables_updated_at ON public.hub_payables;
CREATE TRIGGER update_hub_payables_updated_at
  BEFORE UPDATE ON public.hub_payables
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
