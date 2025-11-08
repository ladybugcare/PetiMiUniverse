# 🔐 Como Criar um Usuário Admin pelo Banco de Dados

Este guia mostra como criar um usuário administrador do sistema PetiVet diretamente pelo banco de dados Supabase.

## 📋 Método Recomendado: Via Supabase Dashboard

### Passo 1: Criar o usuário no Supabase Dashboard

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Authentication** → **Users**
4. Clique em **Add User** (ou **Add user manually**)
5. Preencha:
   - **Email**: `seu-email@exemplo.com`
   - **Password**: `SuaSenhaForte123!`
   - **Auto Confirm User**: ✅ **Marcar como SIM** (importante!)
6. Clique em **Create User**

### Passo 2: Atualizar o role para admin

1. No Supabase Dashboard, vá em **SQL Editor**
2. Execute o seguinte SQL (substitua o email pelo que você criou):

```sql
UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_build_object('role', 'admin')
WHERE email = 'seu-email@exemplo.com';
```

### Passo 3: Verificar se funcionou

Execute este SQL para confirmar:

```sql
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as role,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE email = 'seu-email@exemplo.com';
```

Você deve ver `role = 'admin'` no resultado.

---

## 🔧 Método Alternativo: Atualizar Usuário Existente

Se você já tem um usuário criado e quer transformá-lo em admin:

```sql
UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{role}',
    '"admin"'
  )
WHERE email = 'email-existente@exemplo.com';
```

---

## ✅ Verificação Final

Para listar todos os admins do sistema:

```sql
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as role,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE raw_user_meta_data->>'role' = 'admin';
```

---

## 🎯 Próximos Passos

1. **Faça login** com o email e senha criados
2. Você será **redirecionado automaticamente** para `/admin-dashboard`
3. Agora você tem acesso completo ao painel administrativo

---

## ⚠️ Notas Importantes

- **Role 'admin'** = Administrador do SISTEMA PetiVet (acesso total)
- **Role 'CADMIN'** = Administrador de CLÍNICA (acesso limitado à clínica)
- Guarde a senha em um local seguro!
- O email deve estar confirmado (`email_confirmed_at` não deve ser NULL)

---

## 🔄 Criar Múltiplos Admins

Para criar mais admins, repita o processo acima com emails diferentes:

```sql
UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_build_object('role', 'admin')
WHERE email = 'outro.admin@exemplo.com';
```

---

## 🆘 Troubleshooting

### ❌ Erro: "Failed to create user: API error happened while trying to communicate with the server"

Este erro pode ocorrer por várias razões. **Solução recomendada: usar SQL direto** (veja método abaixo).

**Possíveis causas:**
1. Limites de API do Supabase atingidos
2. Problemas de conectividade/rede
3. Configurações de email/SMTP não configuradas
4. Problemas temporários do Supabase

**Solução: Use o Método SQL Direto** (mais confiável) ⬇️

---

## 🚀 Método SQL Direto (Recomendado quando Dashboard falha)

Se o Dashboard não funcionar, você pode criar o usuário diretamente via SQL:

### Passo 1: Criar usuário via SQL

No **SQL Editor** do Supabase, execute (substitua os valores):

```sql
-- Habilitar extensão pgcrypto (se ainda não estiver habilitada)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Criar usuário admin diretamente
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
  'seu-email@exemplo.com',  -- ⚠️ ALTERE AQUI
  crypt('SuaSenhaForte123!', gen_salt('bf')),  -- ⚠️ ALTERE AQUI
  NOW(),  -- Email já confirmado
  '{"provider":"email","providers":["email"]}',
  '{"role":"admin","name":"Nome do Admin"}',  -- ⚠️ Role = admin
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
);
```

### Passo 2: Verificar se foi criado

```sql
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as role,
  raw_user_meta_data->>'name' as name,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE email = 'seu-email@exemplo.com';
```

Você deve ver:
- `role = 'admin'`
- `email_confirmed_at` não é NULL
- `name` com o nome que você definiu

---

### Problema: Não consigo fazer login
- Verifique se `email_confirmed_at` não é NULL
- Se for NULL, execute: `UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = 'seu-email@exemplo.com';`

### Problema: Não está redirecionando para /admin-dashboard
- Verifique se o role está correto: `SELECT raw_user_meta_data->>'role' FROM auth.users WHERE email = 'seu-email@exemplo.com';`
- Deve retornar `'admin'` (com aspas simples)

### Problema: Erro de permissão no SQL Editor
- Certifique-se de estar usando o SQL Editor do Supabase Dashboard
- Você precisa ter permissões de administrador no projeto Supabase

### Problema: Erro ao executar INSERT (duplicado)
- Se o email já existe, use o método de atualização:
```sql
UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_build_object('role', 'admin', 'name', 'Nome do Admin'),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email = 'seu-email@exemplo.com';
```

