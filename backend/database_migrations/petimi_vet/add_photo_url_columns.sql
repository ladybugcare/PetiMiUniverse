-- ========================================
-- Migration: Adicionar coluna photo_url
-- Date: 2025-10-29
-- Description: Adiciona coluna photo_url nas tabelas clinics e vets para armazenar URLs de fotos de perfil
-- ========================================

-- Adicionar photo_url na tabela clinics
ALTER TABLE clinics 
ADD COLUMN IF NOT EXISTS photo_url text;

-- Adicionar photo_url na tabela vets
ALTER TABLE vets 
ADD COLUMN IF NOT EXISTS photo_url text;

-- NOTA: Não criamos índices em photo_url porque:
-- 1. Armazenamos imagens em base64 (strings muito grandes - até 5MB)
-- 2. PostgreSQL tem limite de 8KB por entrada de índice
-- 3. Não fazemos queries que filtram por photo_url

-- Mensagem de sucesso
SELECT 'Migration add_photo_url_columns.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'clinics' AND column_name = 'photo_url') as clinics_photo_url_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'photo_url') as vets_photo_url_exists;

