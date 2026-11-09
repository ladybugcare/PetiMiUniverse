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
