-- ========================================
-- Migration: Remove duration_hours (Opcional)
-- Date: 2025-01-XX
-- Description: Remove coluna duration_hours se não houver dependências
-- ========================================

-- NOTA: Esta migration está desabilitada porque ainda há dependências:
-- 1. backend/src/controllers/demandsController.ts - método createDemand (deprecated)
-- 2. frontend/src/pages/DemandDetailPage.tsx - exibe duration_hours
--
-- Quando essas dependências forem removidas, descomente a linha abaixo:
-- ALTER TABLE demands DROP COLUMN IF EXISTS duration_hours;

-- Verificação: verificar se coluna existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'demands' AND column_name = 'duration_hours'
    ) THEN 'Coluna duration_hours ainda existe (não removida devido a dependências)'
    ELSE 'Coluna duration_hours não existe'
  END as status;

-- Mensagem de sucesso
SELECT 'Migration v2_remove_duration_hours.sql concluída (coluna mantida devido a dependências)' as status;

