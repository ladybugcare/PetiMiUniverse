-- ========================================
-- Migration: Populate required_specialties
-- Date: 2025-01-XX
-- Description: Preenche required_specialties em demandas compostas baseado em position_specialties
-- ========================================

-- ========================================
-- PARTE 1: Popular required_specialties para demandas compostas
-- ========================================

UPDATE demands d
SET required_specialties = (
  SELECT ARRAY_AGG(DISTINCT ps.specialty_name)
  FROM demand_positions dp
  JOIN position_specialties ps ON dp.id = ps.position_id
  WHERE dp.master_demand_id = d.id
)
WHERE d.is_composite = true
AND (
  d.required_specialties IS NULL 
  OR array_length(d.required_specialties, 1) IS NULL
)
AND EXISTS (
  SELECT 1 
  FROM demand_positions dp
  JOIN position_specialties ps ON dp.id = ps.position_id
  WHERE dp.master_demand_id = d.id
);

-- ========================================
-- VERIFICAÇÃO
-- ========================================

-- Verificar demandas compostas têm required_specialties preenchido
SELECT 
  d.id,
  d.title,
  d.is_composite,
  d.required_specialties,
  array_length(d.required_specialties, 1) as specialties_count,
  CASE 
    WHEN d.required_specialties IS NOT NULL 
      AND array_length(d.required_specialties, 1) > 0 
    THEN 'OK'
    ELSE 'MISSING'
  END as status
FROM demands d
WHERE d.is_composite = true
ORDER BY d.created_at DESC
LIMIT 10;

-- Verificar especialidades são únicas
SELECT 
  d.id,
  d.title,
  d.required_specialties,
  array_length(d.required_specialties, 1) as total_specialties,
  (
    SELECT COUNT(DISTINCT ps.specialty_name)
    FROM demand_positions dp
    JOIN position_specialties ps ON dp.id = ps.position_id
    WHERE dp.master_demand_id = d.id
  ) as unique_specialties_in_positions
FROM demands d
WHERE d.is_composite = true
AND d.required_specialties IS NOT NULL
AND array_length(d.required_specialties, 1) != (
  SELECT COUNT(DISTINCT ps.specialty_name)
  FROM demand_positions dp
  JOIN position_specialties ps ON dp.id = ps.position_id
  WHERE dp.master_demand_id = d.id
);

-- Verificar demandas simples não são afetadas
SELECT 
  COUNT(*) as total_simple_demands,
  COUNT(required_specialties) as simple_demands_with_specialties,
  COUNT(*) - COUNT(required_specialties) as simple_demands_without_specialties
FROM demands
WHERE is_composite = false OR is_composite IS NULL;

-- Mensagem de sucesso
SELECT 'Migration v2_populate_required_specialties.sql concluída com sucesso!' as status;

