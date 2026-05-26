-- ========================================
-- Migration: Fix Demand Vacancies
-- Date: 2025-01-XX
-- Description: Garante que todas as demandas têm vacancies e filled_positions preenchidos
-- ========================================

-- ========================================
-- PARTE 1: Atualizar demandas sem vacancies
-- ========================================

-- Para demandas compostas: calcular vacancies = SUM(demand_positions.total_slots)
UPDATE demands d
SET vacancies = (
  SELECT COALESCE(SUM(dp.total_slots), 1)
  FROM demand_positions dp
  WHERE dp.master_demand_id = d.id
)
WHERE d.vacancies IS NULL
AND d.is_composite = true
AND EXISTS (
  SELECT 1 FROM demand_positions dp WHERE dp.master_demand_id = d.id
);

-- Para demandas simples: usar vacancies = 1 (default)
UPDATE demands
SET vacancies = 1
WHERE vacancies IS NULL
AND (is_composite = false OR is_composite IS NULL);

-- ========================================
-- PARTE 2: Garantir filled_positions = 0 onde NULL
-- ========================================

UPDATE demands
SET filled_positions = 0
WHERE filled_positions IS NULL;

-- ========================================
-- PARTE 3: Adicionar constraint se necessário
-- ========================================

-- Verificar se demands_filled_positions_check existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'demands_filled_positions_check'
  ) THEN
    ALTER TABLE demands
    ADD CONSTRAINT demands_filled_positions_check 
    CHECK (filled_positions <= vacancies);
  END IF;
END $$;

-- ========================================
-- VERIFICAÇÃO
-- ========================================

-- Verificar que todas as demandas têm vacancies preenchido
SELECT 
  COUNT(*) as total_demands,
  COUNT(vacancies) as demands_with_vacancies,
  COUNT(*) - COUNT(vacancies) as demands_without_vacancies
FROM demands;

-- Verificar que todas as demandas têm filled_positions >= 0
SELECT 
  COUNT(*) as total_demands,
  COUNT(filled_positions) as demands_with_filled_positions,
  COUNT(*) - COUNT(filled_positions) as demands_without_filled_positions
FROM demands;

-- Verificar demandas compostas têm vacancies = soma de slots
SELECT 
  d.id,
  d.title,
  d.vacancies as demand_vacancies,
  COALESCE(SUM(dp.total_slots), 0) as calculated_vacancies,
  CASE 
    WHEN d.vacancies = COALESCE(SUM(dp.total_slots), 0) THEN 'OK'
    ELSE 'MISMATCH'
  END as status
FROM demands d
LEFT JOIN demand_positions dp ON dp.master_demand_id = d.id
WHERE d.is_composite = true
GROUP BY d.id, d.title, d.vacancies
HAVING d.vacancies != COALESCE(SUM(dp.total_slots), 0);

-- Mensagem de sucesso
SELECT 'Migration v2_fix_demand_vacancies.sql concluída com sucesso!' as status;

