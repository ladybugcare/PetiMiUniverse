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
