-- PetMi Hub — ficha permanente de saúde (castrado) + auditoria de alterações.
-- Pré-requisitos: hub_pets (002), hub_pet_clinical_flags (025g).

ALTER TABLE public.hub_pets
  ADD COLUMN IF NOT EXISTS neutered boolean;

COMMENT ON COLUMN public.hub_pets.neutered IS
  'Castrado(a): true = sim, false = não, NULL = ainda não informado. Preenche se vazio; conflito não sobrescreve.';

CREATE TABLE IF NOT EXISTS public.hub_pet_profile_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  field text NOT NULL
    CHECK (field IN ('neutered', 'behavior_tags', 'clinical_flag')),
  old_value jsonb,
  new_value jsonb,
  source text NOT NULL
    CHECK (source IN ('wizard', 'clinic', 'grooming', 'boarding', 'pets_form')),
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_pet_profile_changes_pet
  ON public.hub_pet_profile_changes (pet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_pet_profile_changes_clinic
  ON public.hub_pet_profile_changes (clinic_id, created_at DESC);

COMMENT ON TABLE public.hub_pet_profile_changes IS
  'Auditoria da ficha permanente do pet (castrado, comportamento, alertas clínicos). Não é uma segunda fonte de verdade.';

NOTIFY pgrst, 'reload schema';
