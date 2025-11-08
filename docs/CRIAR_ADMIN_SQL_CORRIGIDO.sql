-- Habilitar extensão pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Criar usuário admin
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
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
  'admin@gmail.com',  -- ✅ Aspas fechadas corretamente
  crypt('Test@123', gen_salt('bf')),  -- ✅ Senha
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"admin","name":"Admin"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
);

-- Verificar se foi criado
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as role,
  raw_user_meta_data->>'name' as name,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE email = 'admin@gmail.com';

