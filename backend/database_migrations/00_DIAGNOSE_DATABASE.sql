-- ========================================
-- DIAGNÓSTICO DO BANCO DE DADOS
-- ========================================
-- Execute este script no SQL Editor do Supabase para verificar
-- o estado atual do seu banco de dados e quais migrations precisam ser executadas.
-- ========================================

-- ========================================
-- 1. VERIFICAR TABELA DEMANDS
-- ========================================
SELECT 
  '📋 TABELA DEMANDS' as section,
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'demands'
AND column_name IN ('end_time', 'duration_hours', 'is_composite', 'demand_date', 'start_time')
ORDER BY column_name;

-- ========================================
-- 2. VERIFICAR SE TABELA POSITION_APPLICATIONS EXISTE
-- ========================================
SELECT 
  '🎯 TABELA POSITION_APPLICATIONS' as section,
  CASE 
    WHEN EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'position_applications'
    ) THEN '✅ EXISTE'
    ELSE '❌ NÃO EXISTE'
  END as status;

-- ========================================
-- 3. SE EXISTE, VERIFICAR OS TIPOS DAS COLUNAS
-- ========================================
SELECT 
  '🔍 COLUNAS DE POSITION_APPLICATIONS' as section,
  column_name, 
  data_type,
  CASE 
    WHEN column_name IN ('id', 'position_id', 'vet_id') AND data_type = 'uuid' THEN '✅ CORRETO'
    WHEN column_name IN ('id', 'position_id', 'vet_id') AND data_type = 'bigint' THEN '❌ ERRADO (bigint)'
    ELSE '⚠️ VERIFICAR'
  END as diagnostic
FROM information_schema.columns
WHERE table_name = 'position_applications'
AND column_name IN ('id', 'position_id', 'vet_id')
ORDER BY column_name;

-- ========================================
-- 4. VERIFICAR SE TABELA DEMAND_POSITIONS EXISTE
-- ========================================
SELECT 
  '🎯 TABELA DEMAND_POSITIONS' as section,
  CASE 
    WHEN EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'demand_positions'
    ) THEN '✅ EXISTE'
    ELSE '❌ NÃO EXISTE'
  END as status;

-- ========================================
-- 5. VERIFICAR SE TABELA POSITION_SPECIALTIES EXISTE
-- ========================================
SELECT 
  '🎯 TABELA POSITION_SPECIALTIES' as section,
  CASE 
    WHEN EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'position_specialties'
    ) THEN '✅ EXISTE'
    ELSE '❌ NÃO EXISTE'
  END as status;

-- ========================================
-- RESUMO E RECOMENDAÇÕES
-- ========================================
SELECT 
  '📊 RESUMO E PRÓXIMOS PASSOS' as section,
  CASE
    -- Caso 1: demands não tem end_time
    WHEN NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'demands' AND column_name = 'end_time'
    ) THEN '❌ EXECUTAR: create_demand_positions_system.sql (PRIORIDADE ALTA)'
    
    -- Caso 2: position_applications existe mas com tipos errados
    WHEN EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'position_applications' AND column_name = 'id' AND data_type = 'bigint'
    ) THEN '❌ EXECUTAR: fix_position_applications_types.sql (PRIORIDADE ALTA)'
    
    -- Caso 3: Tudo OK
    WHEN EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'demands' AND column_name = 'end_time'
    ) AND EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'position_applications' AND column_name = 'id' AND data_type = 'uuid'
    ) THEN '✅ BANCO DE DADOS OK! Nenhuma migration necessária.'
    
    ELSE '⚠️ ESTADO DESCONHECIDO - Verifique os resultados acima'
  END as recommendation;

