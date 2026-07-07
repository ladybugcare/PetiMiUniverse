-- PetMi Hub — cobertura de pacote em linha de comanda de atendimento.
-- Pré-requisitos: 076_alter_hub_customer_package_balances_v2.sql.

ALTER TABLE public.hub_comanda_items
  ADD COLUMN IF NOT EXISTS package_balance_id uuid
    REFERENCES public.hub_customer_package_balances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_comanda_items_package_balance
  ON public.hub_comanda_items (package_balance_id)
  WHERE package_balance_id IS NOT NULL;

COMMENT ON COLUMN public.hub_comanda_items.package_balance_id IS 'Quando preenchido, linha coberta por pacote (unit_amount = 0).';

NOTIFY pgrst, 'reload schema';
