-- ========================================
-- Script: Verificar Role de Usuário
-- Description: Verifica o role de um usuário específico
-- ========================================

-- SUBSTITUA O EMAIL ABAIXO PELO EMAIL QUE DESEJA VERIFICAR
DO $$
DECLARE
  v_email TEXT := 'abd.pedroso+cadmin@gmail.com';
  v_user_id UUID;
BEGIN
  -- Buscar user_id pelo email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email;
  
  IF v_user_id IS NULL THEN
    RAISE NOTICE '❌ Usuário com email % não encontrado!', v_email;
  ELSE
    RAISE NOTICE '✅ Usuário encontrado!';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE 'User ID: %', v_user_id;
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  END IF;
END $$;

-- 1. Verificar dados do auth.users
SELECT 
  '📧 DADOS DO AUTH.USERS' as info,
  id as user_id,
  email,
  raw_user_meta_data->>'role' as auth_role,
  raw_user_meta_data->>'name' as name,
  created_at,
  confirmed_at,
  CASE 
    WHEN confirmed_at IS NOT NULL THEN '✅ Confirmado'
    ELSE '⏳ Aguardando confirmação'
  END as status
FROM auth.users
WHERE email = 'abd.pedroso+cadmin@gmail.com';

-- 2. Verificar se é clínica (na tabela clinics)
SELECT 
  '🏥 DADOS DA CLÍNICA' as info,
  c.id as clinic_id,
  c.name as clinic_name,
  c.email,
  c.cnpj,
  c.created_at,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'clinics' AND column_name = 'status'
    ) THEN 'Coluna status existe'
    ELSE '⚠️ Coluna status não existe (migration não executada)'
  END as status_note
FROM clinics c
JOIN auth.users u ON u.id = c.id
WHERE u.email = 'abd.pedroso+cadmin@gmail.com';

-- 3. Verificar clinic_users (onde fica o role CADMIN, CMANAGER, etc)
SELECT 
  '👤 ROLE NA CLÍNICA (clinic_users)' as info,
  cu.id as clinic_user_id,
  cu.user_id,
  cu.clinic_id,
  cu.unit_id,
  cu.role as clinic_role,
  cu.accepted_at,
  CASE 
    WHEN cu.role = 'CADMIN' THEN '👑 CADMIN (Administrador da Clínica)'
    WHEN cu.role = 'CMANAGER' THEN '👨‍💼 CMANAGER (Gerente)'
    WHEN cu.role = 'CASSISTANT' THEN '👩‍💻 CASSISTANT (Assistente)'
    WHEN cu.role = 'CVET_INTERNAL' THEN '👩‍⚕️ CVET_INTERNAL (Veterinário Interno)'
    ELSE cu.role
  END as role_description,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'clinic_users' AND column_name = 'status'
    ) THEN 'Coluna status existe'
    ELSE '⚠️ Coluna status não existe (migration não executada)'
  END as status_note
FROM clinic_users cu
JOIN auth.users u ON u.id = cu.user_id
WHERE u.email = 'abd.pedroso+cadmin@gmail.com';

-- 4. Verificar unidades vinculadas
SELECT 
  '🏥 UNIDADES VINCULADAS' as info,
  un.id as unit_id,
  un.name as unit_name,
  un.clinic_id,
  un.is_main,
  un.city,
  un.state,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'units' AND column_name = 'status'
    ) THEN 'Coluna status existe'
    ELSE '⚠️ Coluna status não existe (migration não executada)'
  END as status_note
FROM units un
JOIN clinic_users cu ON cu.unit_id = un.id
JOIN auth.users u ON u.id = cu.user_id
WHERE u.email = 'abd.pedroso+cadmin@gmail.com';

-- 5. RESUMO FINAL
SELECT 
  '📊 RESUMO' as info,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM clinic_users cu
      JOIN auth.users u ON u.id = cu.user_id
      WHERE u.email = 'abd.pedroso+cadmin@gmail.com' AND cu.role = 'CADMIN'
    ) THEN '✅ SIM, É CADMIN!'
    ELSE '❌ NÃO É CADMIN'
  END as is_cadmin,
  (
    SELECT cu.role 
    FROM clinic_users cu
    JOIN auth.users u ON u.id = cu.user_id
    WHERE u.email = 'abd.pedroso+cadmin@gmail.com'
    LIMIT 1
  ) as current_role,
  (
    SELECT COUNT(*) 
    FROM units un
    JOIN clinic_users cu ON cu.clinic_id = un.clinic_id
    JOIN auth.users u ON u.id = cu.user_id
    WHERE u.email = 'abd.pedroso+cadmin@gmail.com'
  ) as total_units;

-- ========================================
-- COMO USAR:
-- ========================================
-- 1. Copie este script
-- 2. Acesse: Supabase Dashboard → SQL Editor
-- 3. Cole o script
-- 4. Clique em "Run"
-- 5. Veja os resultados!
-- ========================================

