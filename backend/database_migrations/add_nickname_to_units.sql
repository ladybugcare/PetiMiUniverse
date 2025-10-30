-- ========================================
-- Migration: Adicionar campo nickname às unidades
-- Date: 2025-10-29
-- Description: Adiciona coluna nickname para diferenciar unidades da mesma cidade
-- ========================================

-- Adicionar coluna nickname (text, nullable)
ALTER TABLE units 
ADD COLUMN IF NOT EXISTS nickname text;

-- Criar constraint UNIQUE para (clinic_id, nickname)
-- Isso garante que dentro de uma clínica, cada apelido seja único
CREATE UNIQUE INDEX IF NOT EXISTS idx_units_clinic_nickname 
ON units(clinic_id, nickname);

-- Migrar dados existentes: usar o name como nickname padrão
UPDATE units 
SET nickname = name 
WHERE nickname IS NULL;

-- Verificação
SELECT 'Migration add_nickname_to_units.sql concluída com sucesso!' as status;

-- Contar quantas unidades têm nickname agora
SELECT 
  COUNT(*) as total_units,
  COUNT(nickname) as units_with_nickname
FROM units;

-- ========================================
-- NOTAS:
-- ========================================
-- 1. O nickname é único por clinic_id (não globalmente)
-- 2. Clínicas diferentes podem ter unidades com o mesmo nickname
-- 3. Exemplo: "Cotia - Centro" pode existir em várias clínicas
-- 4. Recomendação: usar formato "Cidade - Bairro" ou "Cidade - Referência"
-- ========================================

