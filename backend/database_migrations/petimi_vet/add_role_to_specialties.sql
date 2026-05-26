-- ========================================
-- Migration: Adicionar campo role à tabela specialties
-- Date: 2025-01-XX
-- Description: Adiciona campo role para mapear especialidades para tipos de profissionais
-- ========================================

-- Adicionar coluna role se não existir
ALTER TABLE specialties
ADD COLUMN IF NOT EXISTS role text;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_specialties_role ON specialties(role);

-- Atualizar especialidades existentes baseado na category atual
-- Mapeamento:
-- - category = 'Freelancer' ou 'Estética' → role = 'freelancer'
-- - Todo o resto → role = 'vet'
UPDATE specialties 
SET role = CASE 
  WHEN LOWER(TRIM(category)) IN ('freelancer', 'estética', 'estetica') 
    THEN 'freelancer'
  ELSE 'vet'
END
WHERE role IS NULL;

-- Adicionar constraint para garantir valores válidos
ALTER TABLE specialties
DROP CONSTRAINT IF EXISTS specialties_role_check;

ALTER TABLE specialties
ADD CONSTRAINT specialties_role_check 
CHECK (role IN ('vet', 'freelancer', 'clinic', 'other'));

-- Tornar role NOT NULL após popular os dados
ALTER TABLE specialties
ALTER COLUMN role SET NOT NULL;

-- Adicionar valor default para novas inserções
ALTER TABLE specialties
ALTER COLUMN role SET DEFAULT 'vet';

-- Comentário na coluna
COMMENT ON COLUMN specialties.role IS 'Tipo de profissional: vet (veterinário), freelancer, clinic, other';

-- Verificação
SELECT 
  role,
  COUNT(*) as total,
  STRING_AGG(DISTINCT category, ', ') as categorias
FROM specialties
GROUP BY role
ORDER BY role;

-- Mensagem de sucesso
SELECT 'Migration add_role_to_specialties.sql concluída com sucesso!' as status;

