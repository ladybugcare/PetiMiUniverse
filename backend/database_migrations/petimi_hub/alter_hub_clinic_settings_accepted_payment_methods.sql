-- PetMi Hub — formas de pagamento aceitas por clínica (checkout e recebíveis).
-- Pré-requisitos: `create_hub_clinic_settings.sql`.

ALTER TABLE public.hub_clinic_settings
  ADD COLUMN IF NOT EXISTS accepted_payment_methods text[] NOT NULL
  DEFAULT ARRAY['pix','cash','credit_card','debit_card','transfer','payment_link','customer_credit']::text[];

COMMENT ON COLUMN public.hub_clinic_settings.accepted_payment_methods IS
  'Formas de pagamento habilitadas para recebimento (checkout e registro de pagamentos).';

ALTER TABLE public.hub_clinic_settings
  DROP CONSTRAINT IF EXISTS hub_clinic_settings_accepted_payment_methods_check;

ALTER TABLE public.hub_clinic_settings
  ADD CONSTRAINT hub_clinic_settings_accepted_payment_methods_check
  CHECK (
    cardinality(accepted_payment_methods) >= 1
    AND accepted_payment_methods <@ ARRAY['pix','cash','credit_card','debit_card','transfer','payment_link','customer_credit']::text[]
  );
