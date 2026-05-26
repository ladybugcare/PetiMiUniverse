-- ========================================
-- Migration: Criar Storage Buckets
-- Date: 2025-01-30
-- Description: Cria buckets do Supabase Storage para documentos de veterinários e imagens do marketplace
-- ========================================

-- ========================================
-- 1. BUCKET: vet-documents
-- ========================================
-- Bucket para armazenar documentos CRMV dos veterinários
-- Privado: apenas o próprio vet e admins podem acessar

-- Criar bucket se não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vet-documents',
  'vet-documents',
  false, -- Bucket privado
  5242880, -- 5MB em bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

-- ========================================
-- 2. POLÍTICAS RLS PARA vet-documents
-- ========================================

-- Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "Vets can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Vets can read their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Vets can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Vets can delete their own documents" ON storage.objects;

-- Política: Permitir upload apenas para usuários autenticados (seus próprios arquivos)
-- A política verifica se o primeiro segmento do caminho (pasta) corresponde ao ID do usuário
CREATE POLICY "Vets can upload their own documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vet-documents' AND
  (
    -- Verificar se o primeiro segmento do caminho é o ID do usuário
    (storage.foldername(name))[1] = auth.uid()::text OR
    -- Fallback: verificar se o caminho começa com o ID do usuário seguido de /
    split_part(name, '/', 1) = auth.uid()::text
  )
);

-- Política: Permitir leitura apenas para o próprio usuário e admins
CREATE POLICY "Vets can read their own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vet-documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'admin'
    )
  )
);

-- Política: Permitir atualização apenas para o próprio usuário
CREATE POLICY "Vets can update their own documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vet-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'vet-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Política: Permitir deleção apenas para o próprio usuário e admins
CREATE POLICY "Vets can delete their own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vet-documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'admin'
    )
  )
);

-- ========================================
-- 3. BUCKET: marketplace-images
-- ========================================
-- Bucket para armazenar imagens do marketplace
-- Público: imagens podem ser acessadas publicamente

-- Criar bucket se não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketplace-images',
  'marketplace-images',
  true, -- Bucket público
  5242880, -- 5MB em bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- ========================================
-- 4. POLÍTICAS RLS PARA marketplace-images
-- ========================================

-- Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "Users can upload their own marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own marketplace images" ON storage.objects;

-- Política: Permitir upload apenas para usuários autenticados (seus próprios arquivos)
CREATE POLICY "Users can upload their own marketplace images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'marketplace-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Política: Permitir leitura pública (bucket é público)
CREATE POLICY "Public can read marketplace images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'marketplace-images');

-- Política: Permitir atualização apenas para o próprio usuário
CREATE POLICY "Users can update their own marketplace images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'marketplace-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'marketplace-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Política: Permitir deleção apenas para o próprio usuário
CREATE POLICY "Users can delete their own marketplace images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'marketplace-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- ========================================
-- VERIFICAÇÃO
-- ========================================
SELECT 
  'Migration create_storage_buckets.sql concluída com sucesso!' as status,
  (SELECT COUNT(*) FROM storage.buckets WHERE id IN ('vet-documents', 'marketplace-images')) as buckets_created;

