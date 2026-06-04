-- ========================================
-- Migration: Adicionar campos de onboarding à tabela freelancers
-- Date: 2025-01-30
-- Description: Adiciona campos necessários para o fluxo de onboarding de freelancers
-- ========================================

-- Adicionar coluna specialties se não existir
ALTER TABLE freelancers
ADD COLUMN IF NOT EXISTS specialties text[] DEFAULT '{}'::text[];

-- Adicionar coluna service_regions se não existir
ALTER TABLE freelancers
ADD COLUMN IF NOT EXISTS service_regions text[] DEFAULT '{}'::text[];

-- Adicionar coluna experience_year se não existir
ALTER TABLE freelancers
ADD COLUMN IF NOT EXISTS experience_year integer;

-- Adicionar coluna certifications se não existir (array de URLs dos arquivos)
ALTER TABLE freelancers
ADD COLUMN IF NOT EXISTS certifications text[] DEFAULT '{}'::text[];

-- Adicionar constraint para experience_year (entre 1980 e ano atual)
ALTER TABLE freelancers
DROP CONSTRAINT IF EXISTS freelancers_experience_year_check;

ALTER TABLE freelancers
ADD CONSTRAINT freelancers_experience_year_check 
CHECK (experience_year IS NULL OR (experience_year >= 1980 AND experience_year <= EXTRACT(YEAR FROM CURRENT_DATE)));

-- Criar índices para melhor performance em consultas com arrays (GIN index)
CREATE INDEX IF NOT EXISTS idx_freelancers_specialties ON freelancers USING GIN (specialties);
CREATE INDEX IF NOT EXISTS idx_freelancers_service_regions ON freelancers USING GIN (service_regions);
CREATE INDEX IF NOT EXISTS idx_freelancers_certifications ON freelancers USING GIN (certifications);

-- Comentários nas colunas
COMMENT ON COLUMN freelancers.specialties IS 'Array de especialidades do freelancer';
COMMENT ON COLUMN freelancers.service_regions IS 'Array de regiões/cidades onde o freelancer atende';
COMMENT ON COLUMN freelancers.experience_year IS 'Ano de início da experiência profissional (1980-ano atual)';
COMMENT ON COLUMN freelancers.certifications IS 'Array de URLs dos arquivos de certificação no Supabase Storage';

-- Verificação de sucesso
SELECT 'Migration add_freelancer_onboarding_fields.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'specialties') as specialties_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'service_regions') as service_regions_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'experience_year') as experience_year_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'freelancers' AND column_name = 'certifications') as certifications_exists;

