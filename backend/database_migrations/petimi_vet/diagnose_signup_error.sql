-- ========================================
-- DIAGNÓSTICO: Erro ao cadastrar novo usuário
-- ========================================

-- 1. Verificar estrutura da tabela clinics
SELECT 
  '📋 ESTRUTURA DA TABELA CLINICS' as info,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'clinics'
ORDER BY ordinal_position;

-- 2. Verificar se coluna 'status' existe em clinics
SELECT 
  '🔍 COLUNA STATUS EM CLINICS' as info,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'clinics' AND column_name = 'status'
    ) THEN '✅ Coluna status EXISTE'
    ELSE '❌ Coluna status NÃO EXISTE (PROBLEMA!)'
  END as status_column_check;

-- 3. Verificar constraints da tabela clinics
SELECT 
  '⚠️  CONSTRAINTS EM CLINICS' as info,
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'clinics';

-- 4. Verificar se o trigger está ativo
SELECT 
  '🔧 TRIGGER handle_new_user' as info,
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'auth' 
  AND trigger_name = 'on_auth_user_created';

-- 5. Testar a função handle_new_user() manualmente
-- (sem realmente criar um usuário)
SELECT 
  '🧪 TESTE DA FUNÇÃO' as info,
  proname as function_name,
  pg_get_functiondef(oid) as function_definition
FROM pg_proc 
WHERE proname = 'handle_new_user';

-- ========================================
-- DIAGNÓSTICO FINAL
-- ========================================
SELECT 
  '📊 RESUMO DO DIAGNÓSTICO' as info,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'clinics' AND column_name = 'status') as has_status_column,
  (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name = 'on_auth_user_created') as has_trigger,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'handle_new_user') as has_function;

-- ========================================
-- POSSÍVEIS PROBLEMAS:
-- ========================================
-- 
-- Se has_status_column = 0: Falta a coluna 'status' na tabela clinics
-- Se has_trigger = 0: O trigger não foi criado
-- Se has_function = 0: A função não foi criada
-- 
-- SOLUÇÃO: Execute a migration add_clinic_approval_system.sql
-- ========================================

