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
-- PetMi Match (adoção) — swipes do Petinder
-- Pré-requisito: 001_create_match_users.sql, 002_create_match_pets.sql.

CREATE TABLE IF NOT EXISTS public.match_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.match_users(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.match_pets(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('like', 'pass', 'super_like')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pet_id)
);

CREATE INDEX IF NOT EXISTS idx_match_interactions_user_id
  ON public.match_interactions (user_id);

CREATE INDEX IF NOT EXISTS idx_match_interactions_pet_id
  ON public.match_interactions (pet_id);

CREATE INDEX IF NOT EXISTS idx_match_interactions_action
  ON public.match_interactions (action);

CREATE INDEX IF NOT EXISTS idx_match_interactions_created_at
  ON public.match_interactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_interactions_likes
  ON public.match_interactions (user_id, pet_id, action)
  WHERE action IN ('like', 'super_like');

CREATE INDEX IF NOT EXISTS idx_match_interactions_potential_matches
  ON public.match_interactions (pet_id, user_id, action)
  WHERE action IN ('like', 'super_like');

CREATE OR REPLACE FUNCTION public.match_validate_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.match_users
    WHERE id = NEW.user_id
      AND wants_to_adopt = true
  ) THEN
    RAISE EXCEPTION 'Usuário deve ter wants_to_adopt = true para interagir com pets';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_pets
    WHERE id = NEW.pet_id
      AND owner_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Usuário não pode interagir com seu próprio pet';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_match_validate_interaction ON public.match_interactions;
CREATE TRIGGER trigger_match_validate_interaction
  BEFORE INSERT OR UPDATE ON public.match_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.match_validate_interaction();

COMMENT ON TABLE public.match_interactions IS
  'Swipes Petinder (like / pass / super_like); um registro por usuário+pet.';
COMMENT ON FUNCTION public.match_validate_interaction() IS
  'Exige wants_to_adopt e impede swipe no próprio anúncio.';

ALTER TABLE public.match_interactions ENABLE ROW LEVEL SECURITY;
-- PetMi Match (adoção) — favoritos
-- Pré-requisito: 001_create_match_users.sql, 002_create_match_pets.sql.

CREATE TABLE IF NOT EXISTS public.match_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.match_users(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.match_pets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pet_id)
);

CREATE INDEX IF NOT EXISTS idx_match_favorites_user_id
  ON public.match_favorites (user_id);

CREATE INDEX IF NOT EXISTS idx_match_favorites_pet_id
  ON public.match_favorites (pet_id);

CREATE INDEX IF NOT EXISTS idx_match_favorites_created_at
  ON public.match_favorites (created_at DESC);

COMMENT ON TABLE public.match_favorites IS
  'Pets favoritados pelo usuário Match; um favorito por usuário+pet.';

ALTER TABLE public.match_favorites ENABLE ROW LEVEL SECURITY;
-- PetMi Match (adoção) — RLS policies (cliente Supabase direto)
-- Pré-requisito: 001–004.

-- match_users
DROP POLICY IF EXISTS "match_users_select_own" ON public.match_users;
CREATE POLICY "match_users_select_own"
  ON public.match_users
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "match_users_select_public" ON public.match_users;
CREATE POLICY "match_users_select_public"
  ON public.match_users
  FOR SELECT
  USING (is_ong = true OR id = auth.uid());

DROP POLICY IF EXISTS "match_users_insert_own" ON public.match_users;
CREATE POLICY "match_users_insert_own"
  ON public.match_users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "match_users_update_own" ON public.match_users;
CREATE POLICY "match_users_update_own"
  ON public.match_users
  FOR UPDATE
  USING (auth.uid() = id);

-- match_pets
DROP POLICY IF EXISTS "match_pets_select_available" ON public.match_pets;
CREATE POLICY "match_pets_select_available"
  ON public.match_pets
  FOR SELECT
  USING (status = 'available' OR owner_id = auth.uid());

DROP POLICY IF EXISTS "match_pets_insert_own" ON public.match_pets;
CREATE POLICY "match_pets_insert_own"
  ON public.match_pets
  FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.match_users
      WHERE id = auth.uid()
        AND wants_to_announce = true
    )
  );

DROP POLICY IF EXISTS "match_pets_update_own" ON public.match_pets;
CREATE POLICY "match_pets_update_own"
  ON public.match_pets
  FOR UPDATE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "match_pets_delete_own" ON public.match_pets;
CREATE POLICY "match_pets_delete_own"
  ON public.match_pets
  FOR DELETE
  USING (auth.uid() = owner_id);

-- match_interactions
-- Próprias + likes em pets do owner atual (check de match bidirecional no app)
DROP POLICY IF EXISTS "match_interactions_select_own_or_owner" ON public.match_interactions;
CREATE POLICY "match_interactions_select_own_or_owner"
  ON public.match_interactions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.match_pets p
      WHERE p.id = pet_id
        AND p.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "match_interactions_insert_own" ON public.match_interactions;
CREATE POLICY "match_interactions_insert_own"
  ON public.match_interactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "match_interactions_update_own" ON public.match_interactions;
CREATE POLICY "match_interactions_update_own"
  ON public.match_interactions
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "match_interactions_delete_own" ON public.match_interactions;
CREATE POLICY "match_interactions_delete_own"
  ON public.match_interactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- match_favorites
DROP POLICY IF EXISTS "match_favorites_select_own" ON public.match_favorites;
CREATE POLICY "match_favorites_select_own"
  ON public.match_favorites
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "match_favorites_insert_own" ON public.match_favorites;
CREATE POLICY "match_favorites_insert_own"
  ON public.match_favorites
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.match_users
      WHERE id = auth.uid()
        AND wants_to_adopt = true
    )
  );

DROP POLICY IF EXISTS "match_favorites_delete_own" ON public.match_favorites;
CREATE POLICY "match_favorites_delete_own"
  ON public.match_favorites
  FOR DELETE
  USING (auth.uid() = user_id);
-- PetMi Match (adoção) — e-mail via função SECURITY DEFINER + view security_invoker
-- Pré-requisito: 001_create_match_users.sql, 005 (RLS ativo em match_users).

CREATE OR REPLACE FUNCTION public.match_auth_email(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
BEGIN
  -- Só devolve e-mail do próprio usuário autenticado, ou de perfil ONG público
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.match_users mu
      WHERE mu.id = p_user_id
        AND mu.is_ong = true
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT au.email
  INTO v_email
  FROM auth.users au
  WHERE au.id = p_user_id;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.match_auth_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_auth_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_auth_email(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.match_auth_created_at(p_user_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_created timestamptz;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.match_users mu
      WHERE mu.id = p_user_id
        AND mu.is_ong = true
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT au.created_at
  INTO v_created
  FROM auth.users au
  WHERE au.id = p_user_id;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.match_auth_created_at(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_auth_created_at(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_auth_created_at(uuid) TO service_role;

DROP VIEW IF EXISTS public.match_users_with_email;
CREATE VIEW public.match_users_with_email
WITH (security_invoker = true)
AS
SELECT
  mu.*,
  public.match_auth_email(mu.id) AS email,
  public.match_auth_created_at(mu.id) AS auth_created_at
FROM public.match_users mu;

COMMENT ON VIEW public.match_users_with_email IS
  'match_users + email/auth_created_at; RLS da tabela base via security_invoker.';
COMMENT ON FUNCTION public.match_auth_email(uuid) IS
  'Retorna email de auth.users só para o próprio usuário ou ONG pública.';
-- PetMi Match (adoção) — buckets de storage
-- Separados de hub-staff-photos e demais buckets do ecossistema.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'match-photos',
  'match-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'match-avatars',
  'match-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id IN ('match-photos', 'match-avatars');
-- PetMi Match (adoção) — policies de storage
-- Pré-requisito: 001, 002, 007.
-- Se o SQL Editor retornar "must be owner of relation objects", criar as mesmas
-- policies no Dashboard → Storage → bucket → Policies.

-- match-photos
DROP POLICY IF EXISTS "match_photos_public_read" ON storage.objects;
CREATE POLICY "match_photos_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'match-photos');

DROP POLICY IF EXISTS "match_photos_authenticated_upload" ON storage.objects;
CREATE POLICY "match_photos_authenticated_upload"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'match-photos'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM public.match_users
      WHERE id = auth.uid()
        AND wants_to_announce = true
    )
    AND EXISTS (
      SELECT 1
      FROM public.match_pets
      WHERE id::text = (storage.foldername(name))[2]
        AND owner_id = auth.uid()
    )
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "match_photos_temp_upload" ON storage.objects;
CREATE POLICY "match_photos_temp_upload"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'match-photos'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM public.match_users
      WHERE id = auth.uid()
        AND wants_to_announce = true
    )
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] = 'temp'
  );

DROP POLICY IF EXISTS "match_photos_owner_update" ON storage.objects;
CREATE POLICY "match_photos_owner_update"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'match-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "match_photos_temp_update" ON storage.objects;
CREATE POLICY "match_photos_temp_update"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'match-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (storage.foldername(name))[2] = 'temp'
  );

DROP POLICY IF EXISTS "match_photos_owner_delete" ON storage.objects;
CREATE POLICY "match_photos_owner_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'match-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- match-avatars
DROP POLICY IF EXISTS "match_avatars_public_read" ON storage.objects;
CREATE POLICY "match_avatars_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'match-avatars');

DROP POLICY IF EXISTS "match_avatars_own_upload" ON storage.objects;
CREATE POLICY "match_avatars_own_upload"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'match-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "match_avatars_own_update" ON storage.objects;
CREATE POLICY "match_avatars_own_update"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'match-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "match_avatars_own_delete" ON storage.objects;
CREATE POLICY "match_avatars_own_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'match-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
