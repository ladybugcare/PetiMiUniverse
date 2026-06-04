-- ========================================
-- Migration: Normalizar CNPJs existentes
-- Date: 2025-11-06
-- Description: Remove formatação de CNPJs já cadastrados para garantir consistência
-- ========================================
-- 
-- Esta migration normaliza CNPJs que possam ter sido salvos com formatação
-- (pontos, barras e traços) para o formato normalizado (apenas números)

-- Função para normalizar CNPJ (remove formatação)
CREATE OR REPLACE FUNCTION normalize_cnpj(cnpj_text TEXT)
RETURNS TEXT AS $$
BEGIN
  IF cnpj_text IS NULL THEN
    RETURN NULL;
  END IF;
  -- Remove tudo que não for dígito
  RETURN regexp_replace(cnpj_text, '[^0-9]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Verificar e criar coluna cnpj na tabela clinics se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'clinics' 
    AND column_name = 'cnpj'
  ) THEN
    ALTER TABLE clinics ADD COLUMN cnpj text UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_clinics_cnpj ON clinics(cnpj);
    RAISE NOTICE 'Coluna cnpj criada na tabela clinics';
  END IF;
END $$;

-- Normalizar CNPJs na tabela clinics (se a coluna existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'clinics' 
    AND column_name = 'cnpj'
  ) THEN
    UPDATE clinics
    SET cnpj = normalize_cnpj(cnpj)
    WHERE cnpj IS NOT NULL 
      AND cnpj != normalize_cnpj(cnpj); -- Só atualiza se houver diferença
    
    RAISE NOTICE 'CNPJs da tabela clinics normalizados';
  END IF;
END $$;

-- Verificar e criar coluna cnpj na tabela units se não existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'units'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'units' 
      AND column_name = 'cnpj'
    ) THEN
      ALTER TABLE units ADD COLUMN cnpj text;
      RAISE NOTICE 'Coluna cnpj criada na tabela units';
    END IF;
    
    -- Normalizar CNPJs na tabela units
    UPDATE units
    SET cnpj = normalize_cnpj(cnpj)
    WHERE cnpj IS NOT NULL 
      AND cnpj != normalize_cnpj(cnpj);
    
    RAISE NOTICE 'CNPJs da tabela units normalizados';
  END IF;
END $$;

-- Mensagem de sucesso
SELECT 
  'Migration normalize_existing_cnpjs.sql concluída com sucesso!' as status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'clinics' 
      AND column_name = 'cnpj'
    ) THEN (SELECT COUNT(*) FROM clinics WHERE cnpj IS NOT NULL)
    ELSE 0
  END as total_cnpjs_na_tabela_clinics;

