-- PetMi Hub — pets e vínculo tutor–pet (Epic 2)
-- Pré-requisitos: `clinics`, `hub_guardians`, função `moddatetime` (ver create_moddatetime_function.sql).

CREATE TABLE IF NOT EXISTS public.hub_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  petmi_pet_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  species text NOT NULL,
  breed text,
  sex text CHECK (sex IS NULL OR sex IN ('M', 'F', 'U')),
  birth_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_pets_clinic_active
  ON public.hub_pets (clinic_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_pets IS 'Pets do Hub por clínica; petmi_pet_id = identidade estável (PetMi ID).';

CREATE TABLE IF NOT EXISTS public.hub_pet_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.hub_guardians(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('primary', 'secondary')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pet_id, guardian_id, role)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_pet_one_primary
  ON public.hub_pet_guardians (pet_id)
  WHERE role = 'primary';

COMMENT ON TABLE public.hub_pet_guardians IS 'N:N pet ↔ tutor; um primary por pet.';

DROP TRIGGER IF EXISTS update_hub_pets_updated_at ON public.hub_pets;
CREATE TRIGGER update_hub_pets_updated_at
  BEFORE UPDATE ON public.hub_pets
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
