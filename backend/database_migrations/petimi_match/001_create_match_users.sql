-- PetMi Match (adoção) — perfil de produto em cima de auth.users
-- Pré-requisito: função moddatetime (petimi_vet/create_moddatetime_function.sql).
-- NÃO cria trigger em auth.users (handle_new_user do Shift permanece exclusivo).

CREATE TABLE IF NOT EXISTS public.match_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  avatar_url text,
  is_ong boolean NOT NULL DEFAULT false,
  ong_name text,
  wants_to_adopt boolean NOT NULL DEFAULT false,
  wants_to_announce boolean NOT NULL DEFAULT false,
  role_type text CHECK (role_type IS NULL OR role_type IN ('adopter', 'announcer', 'ong')),
  onboarding_completed boolean NOT NULL DEFAULT false,
  preferences_incomplete boolean NOT NULL DEFAULT false,
  location_city text,
  location_state text,
  species_preference text[],
  preferred_size text[],
  preferred_age text[],
  preferred_behavior text[],
  preferred_energy_level text[],
  preferred_temperament text[],
  preferred_compatibilities text[],
  adopter_acceptances text[],
  location_latitude double precision,
  location_longitude double precision,
  search_radius_km numeric,
  birthdate date,
  cpf text,
  address_full text,
  housing_type text,
  pets_allowed text,
  has_other_pets text,
  cnpj text,
  ngo_responsible_name text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_users_preferred_size_chk CHECK (
    preferred_size IS NULL
    OR preferred_size <@ ARRAY['mini', 'pequeno', 'medio', 'grande', 'gigante']::text[]
  ),
  CONSTRAINT match_users_preferred_age_chk CHECK (
    preferred_age IS NULL
    OR preferred_age <@ ARRAY['puppy', 'young', 'adult', 'senior']::text[]
  ),
  CONSTRAINT match_users_preferred_energy_chk CHECK (
    preferred_energy_level IS NULL
    OR preferred_energy_level <@ ARRAY['baixa', 'media', 'alta']::text[]
  )
);

CREATE INDEX IF NOT EXISTS idx_match_users_is_ong
  ON public.match_users (is_ong);

CREATE INDEX IF NOT EXISTS idx_match_users_wants_to_adopt
  ON public.match_users (wants_to_adopt)
  WHERE wants_to_adopt = true;

CREATE INDEX IF NOT EXISTS idx_match_users_wants_to_announce
  ON public.match_users (wants_to_announce)
  WHERE wants_to_announce = true;

COMMENT ON TABLE public.match_users IS
  'Perfil PetMi Match (adoção). id = auth.users; role_type é UX de produto, não RBAC de clínica.';
COMMENT ON COLUMN public.match_users.role_type IS
  'adopter | announcer | ong — informativo; toggles wants_to_* controlam acesso.';

DROP TRIGGER IF EXISTS update_match_users_updated_at ON public.match_users;
CREATE TRIGGER update_match_users_updated_at
  BEFORE UPDATE ON public.match_users
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.match_users ENABLE ROW LEVEL SECURITY;
