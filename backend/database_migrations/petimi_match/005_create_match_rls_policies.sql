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
