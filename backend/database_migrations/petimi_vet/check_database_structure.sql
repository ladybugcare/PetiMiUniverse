-- ========================================
-- Script: Verificar Estrutura do Banco de Dados
-- Description: Verifica quais tabelas e colunas existem
-- ========================================

-- 1. Verificar quais tabelas existem
SELECT 
  '📊 TABELAS EXISTENTES NO BANCO' as info,
  table_name,
  CASE 
    WHEN table_name = 'auth.users' THEN '✅ Essencial para autenticação'
    WHEN table_name = 'clinics' THEN '✅ Essencial para clínicas'
    WHEN table_name = 'clinic_users' THEN '✅ Essencial para roles de clínica'
    WHEN table_name = 'vets' THEN '✅ Essencial para veterinários'
    WHEN table_name = 'units' THEN '✅ Sistema multi-unidades'
    WHEN table_name = 'demands' THEN '✅ Sistema de demandas'
    WHEN table_name = 'demand_positions' THEN '✅ Posições de demanda'
    WHEN table_name = 'position_applications' THEN '✅ Candidaturas'
    ELSE '📄 Outra tabela'
  END as description
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'clinics',
    'clinic_users',
    'vets',
    'units',
    'demands',
    'demand_positions',
    'position_applications',
    'user_invitations'
  )
ORDER BY table_name;

-- 2. Verificar se auth.users está acessível
SELECT 
  '🔐 VERIFICAÇÃO AUTH.USERS' as info,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'auth' AND table_name = 'users'
    ) THEN '✅ Tabela auth.users existe'
    ELSE '❌ Tabela auth.users NÃO existe ou não é acessível'
  END as auth_users_status;

-- 3. Verificar usuário específico no auth.users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    RAISE NOTICE '✅ Pode acessar auth.users!';
  ELSE
    RAISE NOTICE '❌ NÃO pode acessar auth.users!';
  END IF;
END $$;

-- 4. Se auth.users existe, buscar o usuário
SELECT 
  '📧 USUÁRIO NO AUTH.USERS' as info,
  id as user_id,
  email,
  raw_user_meta_data->>'role' as role,
  raw_user_meta_data->>'name' as name,
  created_at,
  confirmed_at
FROM auth.users
WHERE email = 'abd.pedroso+cadmin@gmail.com';

-- 5. Verificar se clinics existe e tem o usuário
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'clinics'
  ) THEN
    RAISE NOTICE '✅ Tabela clinics existe!';
  ELSE
    RAISE NOTICE '❌ Tabela clinics NÃO existe!';
  END IF;
END $$;

SELECT 
  '🏥 DADOS DA CLÍNICA' as info,
  c.id as clinic_id,
  c.name as clinic_name,
  c.email,
  c.cnpj,
  c.created_at
FROM clinics c
JOIN auth.users u ON u.id = c.id
WHERE u.email = 'abd.pedroso+cadmin@gmail.com';

-- 6. Verificar se clinic_users existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'clinic_users'
  ) THEN
    RAISE NOTICE '✅ Tabela clinic_users existe!';
  ELSE
    RAISE NOTICE '❌ Tabela clinic_users NÃO existe! Esta tabela é ESSENCIAL para o sistema!';
  END IF;
END $$;

-- 7. Se clinic_users existe, verificar o role
SELECT 
  '👤 ROLE DO USUÁRIO (clinic_users)' as info,
  cu.id as clinic_user_id,
  cu.user_id,
  cu.clinic_id,
  cu.role,
  CASE 
    WHEN cu.role = 'CADMIN' THEN '👑 CADMIN (Administrador da Clínica)'
    WHEN cu.role = 'CMANAGER' THEN '👨‍💼 CMANAGER (Gerente)'
    WHEN cu.role = 'CASSISTANT' THEN '👩‍💻 CASSISTANT (Assistente)'
    WHEN cu.role = 'CVET_INTERNAL' THEN '👩‍⚕️ CVET_INTERNAL (Veterinário Interno)'
    ELSE cu.role
  END as role_description
FROM clinic_users cu
JOIN auth.users u ON u.id = cu.user_id
WHERE u.email = 'abd.pedroso+cadmin@gmail.com';

-- 8. RESUMO FINAL
SELECT 
  '📊 RESUMO FINAL' as info,
  (
    SELECT COUNT(*) 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'clinic_users'
  ) as clinic_users_exists,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'clinic_users'
    ) THEN
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM clinic_users cu
          JOIN auth.users u ON u.id = cu.user_id
          WHERE u.email = 'abd.pedroso+cadmin@gmail.com' AND cu.role = 'CADMIN'
        ) THEN '✅ SIM, É CADMIN!'
        ELSE '❌ NÃO É CADMIN ou não está em clinic_users'
      END
    ELSE '❌ Tabela clinic_users NÃO EXISTE!'
  END as is_cadmin;

-- ========================================
-- DIAGNÓSTICO DE PROBLEMAS:
-- ========================================
SELECT 
  '⚠️ DIAGNÓSTICO' as info,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'clinic_users'
    ) THEN '🚨 PROBLEMA CRÍTICO: Tabela clinic_users não existe! O banco precisa ser migrado.'
    ELSE '✅ Estrutura básica OK'
  END as diagnosis,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'clinic_users'
    ) THEN 'Execute as migrations de criação das tabelas principais'
    ELSE 'Banco parece OK'
  END as recommendation;

-- ========================================
-- COMO USAR:
-- ========================================
-- 1. Copie este script
-- 2. Acesse: Supabase Dashboard → SQL Editor
-- 3. Cole o script
-- 4. Clique em "Run"
-- 5. Veja os resultados!
-- ========================================

