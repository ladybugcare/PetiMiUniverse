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
