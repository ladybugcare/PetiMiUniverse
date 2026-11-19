-- PetMi Hub — microchip físico do pet (distinto de petmi_pet_id).
-- Idempotente. Executar depois de 002_create_hub_pets_and_pet_guardians.sql.

ALTER TABLE public.hub_pets
  ADD COLUMN IF NOT EXISTS external_microchip text;

COMMENT ON COLUMN public.hub_pets.external_microchip IS
  'Número alfanumérico do microchip físico implantado. Distinto de petmi_pet_id (identidade PetMi).';

CREATE INDEX IF NOT EXISTS idx_hub_pets_clinic_external_microchip
  ON public.hub_pets (clinic_id, lower(external_microchip))
  WHERE deleted_at IS NULL AND external_microchip IS NOT NULL AND btrim(external_microchip) <> '';
