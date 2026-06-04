-- PetMi Hub — foto do pet (cards Banho & Tosa Fase 4, agenda, etc.).
-- Pré-requisitos: hub_pets. Idempotente.

ALTER TABLE public.hub_pets
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.hub_pets.avatar_url IS 'URL pública da foto do pet (ex. Storage Hub); opcional.';

CREATE INDEX IF NOT EXISTS idx_hub_pets_avatar_present
  ON public.hub_pets (clinic_id)
  WHERE avatar_url IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
