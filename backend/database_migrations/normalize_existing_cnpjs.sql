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

-- Normalizar CNPJs na tabela clinics
UPDATE clinics
SET cnpj = normalize_cnpj(cnpj)
WHERE cnpj IS NOT NULL 
  AND cnpj != normalize_cnpj(cnpj); -- Só atualiza se houver diferença

-- Normalizar CNPJs na tabela units (se existir)
UPDATE units
SET cnpj = normalize_cnpj(cnpj)
WHERE cnpj IS NOT NULL 
  AND cnpj != normalize_cnpj(cnpj); -- Só atualiza se houver diferença

-- Mensagem de sucesso
SELECT 
  'Migration normalize_existing_cnpjs.sql concluída com sucesso!' as status,
  COUNT(*) FILTER (WHERE cnpj IS NOT NULL) as total_cnpjs_normalizados
FROM clinics;

