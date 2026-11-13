-- PetMi Hub P0.5 — cancelamento comercial de saldo de pacote ≠ estorno financeiro.
-- cancelled = restante invalidado; consumo (redemptions) preservado.
-- voided = anulação sem uso (recebível cancelado sem redemption).

ALTER TABLE public.hub_customer_package_balances
  DROP CONSTRAINT IF EXISTS hub_customer_package_balances_status_check;

ALTER TABLE public.hub_customer_package_balances
  ADD CONSTRAINT hub_customer_package_balances_status_check
  CHECK (status IN ('pending', 'active', 'cancelled', 'voided'));

ALTER TABLE public.hub_customer_package_balances
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason text NULL,
  ADD COLUMN IF NOT EXISTS sessions_remaining_at_cancel integer NULL;

COMMENT ON COLUMN public.hub_customer_package_balances.status IS
  'pending = aguarda quitação; active = usável; cancelled = cancel comercial (restante morto); voided = compra anulada sem uso.';
COMMENT ON COLUMN public.hub_customer_package_balances.sessions_remaining_at_cancel IS
  'Snapshot dos restantes no cancelamento comercial (auditoria).';
