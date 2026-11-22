-- PetMi Hub — largura do cupom térmico (58mm ou 80mm) por clínica.
-- Pré-requisitos: `016_create_hub_clinic_settings.sql`.

ALTER TABLE public.hub_clinic_settings
  ADD COLUMN IF NOT EXISTS cupom_width_mm smallint NOT NULL DEFAULT 80;

COMMENT ON COLUMN public.hub_clinic_settings.cupom_width_mm IS
  'Largura do cupom térmico de venda (58 ou 80 mm). Usado na impressão no caixa.';

ALTER TABLE public.hub_clinic_settings
  DROP CONSTRAINT IF EXISTS hub_clinic_settings_cupom_width_mm_check;

ALTER TABLE public.hub_clinic_settings
  ADD CONSTRAINT hub_clinic_settings_cupom_width_mm_check
  CHECK (cupom_width_mm IN (58, 80));
