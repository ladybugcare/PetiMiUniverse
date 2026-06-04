-- ========================================
-- Migration: Remover índices de photo_url
-- Date: 2025-10-29
-- Description: Remove índices de photo_url que causam erro de tamanho
--              (PostgreSQL tem limite de 8KB por entrada de índice, mas base64 pode ter MBs)
-- ========================================

-- Dropar índices se existirem
DROP INDEX IF EXISTS idx_clinics_photo_url;
DROP INDEX IF EXISTS idx_vets_photo_url;

-- Mensagem de sucesso
SELECT 'Migration drop_photo_url_indexes.sql concluída com sucesso!' as status;
SELECT 'Índices removidos. Agora você pode fazer upload de fotos sem erros.' as message;

