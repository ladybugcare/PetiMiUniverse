-- Alertas clínicos persistentes por pet (Fase 2 Clínica).

CREATE TABLE IF NOT EXISTS public.hub_pet_clinical_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  flag_key text NOT NULL CHECK (flag_key IN (
    'allergy',
    'cardiac',
    'aggressive',
    'diabetic',
    'epileptic',
    'other'
  )),
  label text NOT NULL,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_pet_clinical_flags_pet_key_active
  ON public.hub_pet_clinical_flags (pet_id, flag_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_pet_clinical_flags_clinic_pet
  ON public.hub_pet_clinical_flags (clinic_id, pet_id)
  WHERE deleted_at IS NULL AND active = true;

DROP TRIGGER IF EXISTS update_hub_pet_clinical_flags_updated_at ON public.hub_pet_clinical_flags;
CREATE TRIGGER update_hub_pet_clinical_flags_updated_at
  BEFORE UPDATE ON public.hub_pet_clinical_flags
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
