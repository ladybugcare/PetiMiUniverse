-- Soft-reverse de pagamentos: preserva o lançamento original (não DELETE).
-- Pré-requisitos: 035_create_hub_financial_core.sql

ALTER TABLE public.hub_payments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';

ALTER TABLE public.hub_payments
  DROP CONSTRAINT IF EXISTS hub_payments_status_check;

ALTER TABLE public.hub_payments
  ADD CONSTRAINT hub_payments_status_check
  CHECK (status IN ('posted', 'reversed'));

ALTER TABLE public.hub_payments
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversal_mode text,
  ADD COLUMN IF NOT EXISTS reversal_adjustment_id uuid;

ALTER TABLE public.hub_payments
  DROP CONSTRAINT IF EXISTS hub_payments_reversal_mode_check;

ALTER TABLE public.hub_payments
  ADD CONSTRAINT hub_payments_reversal_mode_check
  CHECK (reversal_mode IS NULL OR reversal_mode IN ('payment_reversal', 'refund'));

UPDATE public.hub_payments SET status = 'posted' WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS idx_hub_payments_receivable_posted
  ON public.hub_payments (receivable_id, payment_date DESC)
  WHERE status = 'posted';

CREATE INDEX IF NOT EXISTS idx_hub_payments_session_cash_posted
  ON public.hub_payments (clinic_id, cash_session_id)
  WHERE status = 'posted' AND payment_method = 'cash';

COMMENT ON COLUMN public.hub_payments.status IS
  'posted = conta no saldo; reversed = anulado ou reembolsado (histórico preservado).';

COMMENT ON COLUMN public.hub_payments.reversal_mode IS
  'payment_reversal = anulação de lançamento; refund = reembolso efetivo ao cliente.';

NOTIFY pgrst, 'reload schema';
