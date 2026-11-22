-- PetMi Hub — taxas da maquininha (crédito/débito) por faixa de parcelas.
-- Pré-requisitos: 056 (accepted_payment_methods), 035 (hub_payments).

ALTER TABLE public.hub_clinic_settings
  ADD COLUMN IF NOT EXISTS card_machine_fees jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.hub_clinic_settings.card_machine_fees IS
  'Taxas da maquininha por método: { debit_card: [{min_installments,max_installments,rate_percent}], credit_card: [...] }. Usado para estimar valor líquido no checkout e gravar snapshot no pagamento.';

ALTER TABLE public.hub_payments
  ADD COLUMN IF NOT EXISTS card_fee_rate_percent numeric(7, 4),
  ADD COLUMN IF NOT EXISTS card_fee_amount numeric(14, 2),
  ADD COLUMN IF NOT EXISTS net_amount numeric(14, 2);

COMMENT ON COLUMN public.hub_payments.card_fee_rate_percent IS
  'Snapshot da taxa (%) da maquininha no momento do pagamento (crédito/débito). Null se não cartão ou sem taxa configurada.';
COMMENT ON COLUMN public.hub_payments.card_fee_amount IS
  'Snapshot do valor estimado da taxa da maquininha (amount * rate / 100).';
COMMENT ON COLUMN public.hub_payments.net_amount IS
  'Valor líquido estimado (amount - card_fee_amount). Null se sem taxa.';

ALTER TABLE public.hub_payments
  DROP CONSTRAINT IF EXISTS hub_payments_card_fee_rate_check;
ALTER TABLE public.hub_payments
  ADD CONSTRAINT hub_payments_card_fee_rate_check
  CHECK (card_fee_rate_percent IS NULL OR (card_fee_rate_percent >= 0 AND card_fee_rate_percent <= 100));

ALTER TABLE public.hub_payments
  DROP CONSTRAINT IF EXISTS hub_payments_card_fee_amount_check;
ALTER TABLE public.hub_payments
  ADD CONSTRAINT hub_payments_card_fee_amount_check
  CHECK (card_fee_amount IS NULL OR card_fee_amount >= 0);

ALTER TABLE public.hub_payments
  DROP CONSTRAINT IF EXISTS hub_payments_net_amount_check;
ALTER TABLE public.hub_payments
  ADD CONSTRAINT hub_payments_net_amount_check
  CHECK (net_amount IS NULL OR net_amount >= 0);
