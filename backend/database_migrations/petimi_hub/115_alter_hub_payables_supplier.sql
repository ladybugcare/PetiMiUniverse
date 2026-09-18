-- PetMi Hub — contas a pagar: vínculo opcional com fornecedor (hub_suppliers).
-- Pré-requisitos: 113_create_hub_payables.sql, 008_create_hub_inventory.sql.

ALTER TABLE public.hub_payables
  ADD COLUMN IF NOT EXISTS payee_supplier_id uuid REFERENCES public.hub_suppliers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hub_payables.payee_supplier_id IS
  'Fornecedor credor (estoque). Mutuamente exclusivo com payee_staff_member_id na prática da UI; payee_name continua sendo o rótulo exibido.';

CREATE INDEX IF NOT EXISTS idx_hub_payables_clinic_supplier
  ON public.hub_payables (clinic_id, payee_supplier_id)
  WHERE deleted_at IS NULL AND payee_supplier_id IS NOT NULL;

-- Evita staff + fornecedor no mesmo título.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hub_payables_payee_staff_xor_supplier'
  ) THEN
    ALTER TABLE public.hub_payables
      ADD CONSTRAINT hub_payables_payee_staff_xor_supplier
      CHECK (
        payee_staff_member_id IS NULL
        OR payee_supplier_id IS NULL
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
