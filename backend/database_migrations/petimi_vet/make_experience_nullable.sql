-- ========================================
-- Migration: Tornar coluna experience nullable na tabela vets
-- Date: 2025-01-30
-- Description: Remove a constraint NOT NULL da coluna experience, tornando-a opcional
--              pois o campo foi removido do formulário de cadastro de veterinários
-- ========================================

-- Remover constraint NOT NULL da coluna experience
ALTER TABLE vets
ALTER COLUMN experience DROP NOT NULL;

-- Comentário atualizado
COMMENT ON COLUMN vets.experience IS 'Texto descritivo da experiência do veterinário (opcional)';

-- Verificação de sucesso
SELECT 'Migration make_experience_nullable.sql concluída com sucesso!' as status;
SELECT 
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns 
WHERE table_name = 'vets' 
  AND column_name = 'experience';

