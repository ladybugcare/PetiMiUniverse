-- PetMi Hub — desconto percentual na fatura mensal da série.
-- Pré-requisitos: `100_create_hub_series_invoices.sql` (colunas de billing em hub_appointment_series).

ALTER TABLE public.hub_appointment_series
  ADD COLUMN IF NOT EXISTS invoice_discount_percent numeric(5, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hub_appointment_series.invoice_discount_percent IS
  'Desconto de cabeçalho (%) aplicado sobre o subtotal na emissão da fatura periódica (0–100). Default 0.';

ALTER TABLE public.hub_appointment_series
  DROP CONSTRAINT IF EXISTS hub_appointment_series_invoice_discount_percent_check;

ALTER TABLE public.hub_appointment_series
  ADD CONSTRAINT hub_appointment_series_invoice_discount_percent_check
  CHECK (invoice_discount_percent >= 0 AND invoice_discount_percent <= 100);
