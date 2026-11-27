-- PetMi Hub — cobrança de Leva e Traz em visita multi-pet (por visita vs por pet).
-- Pré-requisitos: `016_create_hub_clinic_settings.sql`.

ALTER TABLE public.hub_clinic_settings
  ADD COLUMN IF NOT EXISTS multipet_pickup_billing text NOT NULL DEFAULT 'per_visit';

COMMENT ON COLUMN public.hub_clinic_settings.multipet_pickup_billing IS
  'Como cobrar L&T em lote multi-pet: per_visit (default, uma vez por dia da visita) ou per_pet. Dias de calendário diferentes no lote sempre cobram por pet.';

ALTER TABLE public.hub_clinic_settings
  DROP CONSTRAINT IF EXISTS hub_clinic_settings_multipet_pickup_billing_check;

ALTER TABLE public.hub_clinic_settings
  ADD CONSTRAINT hub_clinic_settings_multipet_pickup_billing_check
  CHECK (multipet_pickup_billing IN ('per_visit', 'per_pet'));
