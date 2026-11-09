-- PetMi Match (adoção) — anúncios de pets
-- Pré-requisito: 001_create_match_users.sql, moddatetime.
-- Separado de hub_pets; petmi_pet_id é gancho de ecossistema sem FK.

CREATE TABLE IF NOT EXISTS public.match_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  petmi_pet_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  owner_id uuid NOT NULL REFERENCES public.match_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  species text NOT NULL CHECK (species IN ('dog', 'cat')),
  breed text,
  age integer NOT NULL CHECK (age >= 0),
  age_category text CHECK (
    age_category IS NULL OR age_category IN ('puppy', 'young', 'adult', 'senior')
  ),
  gender text NOT NULL CHECK (gender IN ('male', 'female')),
  size_tier text NOT NULL CHECK (
    size_tier IN ('mini', 'pequeno', 'medio', 'grande', 'gigante')
  ),
  description text NOT NULL,
  photos text[] NOT NULL DEFAULT '{}',
  location text NOT NULL,
  is_vaccinated boolean NOT NULL DEFAULT false,
  is_castrated boolean NOT NULL DEFAULT false,
  is_dewormed boolean NOT NULL DEFAULT false,
  energy_level text CHECK (
    energy_level IS NULL OR energy_level IN ('baixa', 'media', 'alta')
  ),
  temperament text[],
  compatibilities text[],
  behaviors text[],
  special_needs text[],
  health text[],
  contact_whatsapp text,
  contact_instagram text,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'adopted', 'pending')),
  draft boolean NOT NULL DEFAULT false,
  location_latitude double precision,
  location_longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_pets_owner_id
  ON public.match_pets (owner_id);

CREATE INDEX IF NOT EXISTS idx_match_pets_species
  ON public.match_pets (species);

CREATE INDEX IF NOT EXISTS idx_match_pets_status
  ON public.match_pets (status);

CREATE INDEX IF NOT EXISTS idx_match_pets_size_tier
  ON public.match_pets (size_tier);

CREATE INDEX IF NOT EXISTS idx_match_pets_created_at
  ON public.match_pets (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_pets_search
  ON public.match_pets (species, status, location)
  WHERE status = 'available';

COMMENT ON TABLE public.match_pets IS
  'Anúncios de adoção (PetMi Match). Não é hub_pets; petmi_pet_id = identidade estável futura.';
COMMENT ON COLUMN public.match_pets.size_tier IS
  'Porte alinhado ao Hub: mini | pequeno | medio | grande | gigante.';
COMMENT ON COLUMN public.match_pets.petmi_pet_id IS
  'UUID estável de ecossistema; sem FK para hub_pets nesta etapa.';

DROP TRIGGER IF EXISTS update_match_pets_updated_at ON public.match_pets;
CREATE TRIGGER update_match_pets_updated_at
  BEFORE UPDATE ON public.match_pets
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.match_pets ENABLE ROW LEVEL SECURITY;
