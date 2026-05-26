-- ========================================
-- Migration: Adicionar campos de onboarding à tabela vets
-- Date: 2025-01-30
-- Description: Adiciona campos necessários para o fluxo de onboarding de veterinários
-- ========================================

-- Adicionar coluna onboarding_completed se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Adicionar coluna crmv_file_url se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS crmv_file_url text;

-- Adicionar coluna service_regions se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS service_regions text[] DEFAULT '{}'::text[];

-- Adicionar coluna experience_year se não existir
ALTER TABLE vets
ADD COLUMN IF NOT EXISTS experience_year integer;

-- Adicionar constraint para experience_year (entre 1980 e ano atual)
ALTER TABLE vets
DROP CONSTRAINT IF EXISTS vets_experience_year_check;

ALTER TABLE vets
ADD CONSTRAINT vets_experience_year_check 
CHECK (experience_year IS NULL OR (experience_year >= 1980 AND experience_year <= EXTRACT(YEAR FROM CURRENT_DATE)));

-- Criar índice para melhor performance em consultas filtradas por onboarding_completed
CREATE INDEX IF NOT EXISTS idx_vets_onboarding_completed ON vets(onboarding_completed) WHERE onboarding_completed = false;

-- Criar índice para service_regions (GIN index para arrays)
CREATE INDEX IF NOT EXISTS idx_vets_service_regions ON vets USING GIN (service_regions);

-- Comentários nas colunas
COMMENT ON COLUMN vets.onboarding_completed IS 'Indica se o veterinário completou o onboarding';
COMMENT ON COLUMN vets.crmv_file_url IS 'URL do arquivo CRMV no Supabase Storage';
COMMENT ON COLUMN vets.service_regions IS 'Array de regiões/cidades onde o veterinário atende';
COMMENT ON COLUMN vets.experience_year IS 'Ano de início da experiência profissional (1980-ano atual)';

-- Verificação de sucesso
SELECT 'Migration add_vet_onboarding_fields.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'onboarding_completed') as onboarding_completed_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'crmv_file_url') as crmv_file_url_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'service_regions') as service_regions_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'vets' AND column_name = 'experience_year') as experience_year_exists;

