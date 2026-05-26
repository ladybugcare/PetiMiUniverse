-- PetMi Hub — bucket público para fotos de profissionais (upload via backend com service role).
-- Executar no Supabase após `create_hub_staff.sql` se ainda não existir o bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hub-staff-photos',
  'hub-staff-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read hub staff photos" ON storage.objects;

CREATE POLICY "Public read hub staff photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'hub-staff-photos');
