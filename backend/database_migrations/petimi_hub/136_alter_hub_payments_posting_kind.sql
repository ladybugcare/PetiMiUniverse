-- Correção histórica em dinheiro e idempotência.
-- Pré-requisitos: 134_alter_hub_payments_reversal_status.sql

ALTER TABLE public.hub_payments
  ADD COLUMN IF NOT EXISTS posting_kind text NOT NULL DEFAULT 'operational',
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS corrected_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS effective_payment_date timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

ALTER TABLE public.hub_payments
  DROP CONSTRAINT IF EXISTS hub_payments_posting_kind_check;

ALTER TABLE public.hub_payments
  ADD CONSTRAINT hub_payments_posting_kind_check
  CHECK (posting_kind IN ('operational', 'historical_correction'));

ALTER TABLE public.hub_payments
  DROP CONSTRAINT IF EXISTS hub_payments_historical_correction_check;

ALTER TABLE public.hub_payments
  ADD CONSTRAINT hub_payments_historical_correction_check
  CHECK (
    posting_kind <> 'historical_correction'
    OR (
      correction_reason IS NOT NULL
      AND length(trim(correction_reason)) >= 3
      AND corrected_by_user_id IS NOT NULL
      AND cash_session_id IS NULL
      AND payment_method = 'cash'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_payments_clinic_idempotency
  ON public.hub_payments (clinic_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.hub_payments.posting_kind IS
  'operational = balcão/dia; historical_correction = correção auditável sem sessão de caixa.';

COMMENT ON COLUMN public.hub_payments.effective_payment_date IS
  'Data efetiva do recebimento (histórico); payment_date espelha a efetiva; created_at é o registro.';

NOTIFY pgrst, 'reload schema';
