-- ========================================
-- Migration: Adicionar campos certificates e experience à tabela vets
-- Date: 2025-10-31
-- Description: Adiciona campos certificates (array de textos) e experience (texto) 
--              para armazenar certificações e experiência do veterinário
-- ========================================

-- Adicionar coluna certificates se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS certificates text[] DEFAULT '{}'::text[];

-- Adicionar coluna experience se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS experience text;

-- Comentários nas colunas
COMMENT ON COLUMN vets.certificates IS 'Array de certificações do veterinário';
COMMENT ON COLUMN vets.experience IS 'Texto descritivo da experiência do veterinário';

-- Verificação de sucesso
SELECT 'Migration add_vet_certificates_experience.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'certificates') as certificates_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'experience') as experience_exists;







