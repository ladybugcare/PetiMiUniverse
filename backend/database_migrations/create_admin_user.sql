-- ========================================
-- Script: Create Admin User in Supabase
-- Date: 2025-10-29
-- Description: Creates an admin user with full system access
-- ========================================

-- IMPORTANTE: Substitua os valores abaixo pelos dados reais

-- ========================================
-- OPÇÃO 1: Atualizar usuário existente para admin
-- ========================================
-- Se você já criou o usuário abd.pedroso@gmail.com no Supabase Dashboard:

UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{role}',
    '"admin"'
  )
WHERE email = 'abd.pedroso@gmail.com';

-- Verificar
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as role,
  created_at
FROM auth.users
WHERE email = 'abd.pedroso@gmail.com';

-- ========================================
-- OPÇÃO 2: Criar novo usuário admin do zero
-- ========================================
-- ATENÇÃO: Substitua os valores abaixo

-- Primeiro, vamos criar o usuário com senha criptografada
-- Você precisará gerar o hash da senha usando extensions.crypt()

-- Habilitar a extensão pgcrypto se ainda não estiver habilitada
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Criar o usuário admin
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@petivet.com',  -- ALTERAR: Seu email de admin
  crypt('SuaSenhaForte123!', gen_salt('bf')),  -- ALTERAR: Sua senha
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"admin"}',  -- Define o role como admin
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
);

-- Verificar o usuário criado
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as role,
  created_at
FROM auth.users
WHERE email = 'admin@petivet.com';

-- ========================================
-- OPÇÃO 3: Script simplificado para Supabase Dashboard
-- ========================================
-- Se você preferir usar o Supabase Dashboard SQL Editor:

-- 1. Crie o usuário no Dashboard (Authentication > Add User)
--    Email: admin@petivet.com
--    Password: SuaSenhaForte123!
--    Auto Confirm: Sim

-- 2. Depois execute este SQL:
UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_build_object('role', 'admin')
WHERE email = 'admin@petivet.com';

-- ========================================
-- VERIFICAÇÃO FINAL
-- ========================================
-- Execute para confirmar que o admin foi criado corretamente:

SELECT 
  id,
  email,
  raw_user_meta_data,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE raw_user_meta_data->>'role' = 'admin';

-- ========================================
-- NOTAS IMPORTANTES
-- ========================================
-- 1. O role 'admin' é para administradores do SISTEMA PetiVet
-- 2. Isso é diferente de 'CADMIN' (admin de clínica)
-- 3. Após criar, faça login com este usuário
-- 4. Você será redirecionado para /admin-dashboard
-- 5. Guarde a senha em um local seguro!

-- ========================================
-- CRIAR MÚLTIPLOS ADMINS
-- ========================================
-- Para criar mais admins, repita o processo com emails diferentes:

/*
UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_build_object('role', 'admin')
WHERE email = 'outro.admin@petivet.com';
*/

