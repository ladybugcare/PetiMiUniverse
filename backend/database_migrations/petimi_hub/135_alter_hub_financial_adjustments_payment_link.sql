-- Liga adjustments ao pagamento e distingue anulação vs reembolso efetivo.
-- Pré-requisitos: 035_create_hub_financial_core.sql, 134_alter_hub_payments_reversal_status.sql

ALTER TABLE public.hub_financial_adjustments
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.hub_payments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS refund_method text,
  ADD COLUMN IF NOT EXISTS refund_effective_date date;

ALTER TABLE public.hub_financial_adjustments
  DROP CONSTRAINT IF EXISTS hub_financial_adjustments_adjustment_type_check;

ALTER TABLE public.hub_financial_adjustments
  ADD CONSTRAINT hub_financial_adjustments_adjustment_type_check
  CHECK (adjustment_type IN (
    'discount',
    'credit',
    'write_off',
    'refund',
    'manual_adjustment',
    'payment_reversal'
  ));

ALTER TABLE public.hub_financial_adjustments
  DROP CONSTRAINT IF EXISTS hub_financial_adjustments_refund_method_check;

ALTER TABLE public.hub_financial_adjustments
  ADD CONSTRAINT hub_financial_adjustments_refund_method_check
  CHECK (
    refund_method IS NULL
    OR refund_method IN (
      'pix', 'cash', 'credit_card', 'debit_card', 'transfer',
      'payment_link', 'customer_credit', 'other'
    )
  );

CREATE INDEX IF NOT EXISTS idx_hub_financial_adjustments_payment
  ON public.hub_financial_adjustments (payment_id)
  WHERE payment_id IS NOT NULL;

-- Um pagamento só pode ter um acerto de reverse/refund ligado.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_financial_adjustments_payment_reverse
  ON public.hub_financial_adjustments (payment_id)
  WHERE payment_id IS NOT NULL
    AND adjustment_type IN ('payment_reversal', 'refund');

-- FK do pagamento para o adjustment (após a coluna existir em ambos os lados).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hub_payments_reversal_adjustment_id_fkey'
  ) THEN
    ALTER TABLE public.hub_payments
      ADD CONSTRAINT hub_payments_reversal_adjustment_id_fkey
      FOREIGN KEY (reversal_adjustment_id)
      REFERENCES public.hub_financial_adjustments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.hub_financial_adjustments.payment_id IS
  'Pagamento de origem quando o adjustment é payment_reversal ou refund.';

COMMENT ON COLUMN public.hub_financial_adjustments.adjustment_type IS
  'payment_reversal = anulação de lançamento; refund = devolução real ao cliente.';

NOTIFY pgrst, 'reload schema';
