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
