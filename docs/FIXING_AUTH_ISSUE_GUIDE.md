# 🔧 Guia: Corrigindo Problema de Sincronização de Usuários

## 🎯 Problema Identificado

Você criou o usuário `abd.pedroso@gmail.com` no Supabase Dashboard, mas:
- ❌ Ele não aparece nas tabelas `clinics` ou `vets`
- ❌ Não tem role definido
- ❌ O login não funciona corretamente

**Causa:** O Supabase Authentication (`auth.users`) é **separado** das tabelas customizadas do banco de dados.

---

## ✅ Solução em 3 Passos

### Passo 1: Definir o Role do Usuário

Primeiro, decida qual será o role do usuário `abd.pedroso@gmail.com`:

**Opção A: Admin do Sistema**
```sql
UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_build_object('role', 'admin')
WHERE email = 'abd.pedroso@gmail.com';
```

**Opção B: Clínica (Admin da Clínica)**
```sql
UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_build_object(
    'role', 'clinic',
    'name', 'Minha Clínica',
    'phone', '(11) 99999-9999',
    'city', 'São Paulo',
    'state', 'SP'
  )
WHERE email = 'abd.pedroso@gmail.com';
```

**Opção C: Veterinário**
```sql
UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_build_object(
    'role', 'vet',
    'name', 'Dr. André Pedroso',
    'crmv', '12345',
    'phone', '(11) 99999-9999',
    'city', 'São Paulo',
    'state', 'SP'
  )
WHERE email = 'abd.pedroso@gmail.com';
```

---

### Passo 2: Criar Registro na Tabela Correspondente

#### Se escolheu Admin (Opção A):
**Nada mais a fazer!** Admins não precisam de registro em outras tabelas.

#### Se escolheu Clínica (Opção B):
```sql
-- 1. Criar registro na tabela clinics
INSERT INTO clinics (
  id,
  name,
  email,
  phone,
  address,
  city,
  state,
  created_at,
  updated_at
)
SELECT 
  id,
  'Minha Clínica',  -- ALTERAR: Nome da clínica
  email,
  '(11) 99999-9999',  -- ALTERAR: Telefone
  'Rua Example, 123',  -- ALTERAR: Endereço
  'São Paulo',  -- ALTERAR: Cidade
  'SP',  -- ALTERAR: Estado
  NOW(),
  NOW()
FROM auth.users
WHERE email = 'abd.pedroso@gmail.com';

-- 2. Criar unidade principal
INSERT INTO units (
  clinic_id,
  name,
  address,
  city,
  state,
  is_main,
  status
)
SELECT 
  id,
  'Minha Clínica - Unidade Principal',
  'Rua Example, 123',
  'São Paulo',
  'SP',
  true,
  'active'
FROM auth.users
WHERE email = 'abd.pedroso@gmail.com';

-- 3. Criar role CADMIN para o dono da clínica
INSERT INTO clinic_users (
  user_id,
  clinic_id,
  unit_id,
  role,
  status,
  accepted_at
)
SELECT 
  u.id,
  u.id,
  un.id,
  'CADMIN',
  'active',
  NOW()
FROM auth.users u
JOIN units un ON un.clinic_id = u.id AND un.is_main = true
WHERE u.email = 'abd.pedroso@gmail.com';
```

#### Se escolheu Veterinário (Opção C):
```sql
INSERT INTO vets (
  id,
  name,
  email,
  crmv,
  phone,
  specialties,
  city,
  state,
  created_at,
  updated_at
)
SELECT 
  id,
  'Dr. André Pedroso',  -- ALTERAR: Nome
  email,
  '12345',  -- ALTERAR: CRMV
  '(11) 99999-9999',  -- ALTERAR: Telefone
  ARRAY['clinica_geral']::text[],  -- ALTERAR: Especialidades
  'São Paulo',  -- ALTERAR: Cidade
  'SP',  -- ALTERAR: Estado
  NOW(),
  NOW()
FROM auth.users
WHERE email = 'abd.pedroso@gmail.com';
```

---

### Passo 3: Instalar Triggers para Futuros Usuários

Execute o script de triggers para que **futuros usuários** sejam sincronizados automaticamente:

```bash
# No terminal
psql -U seu_usuario -d seu_banco -f backend/database_migrations/petimi_vet/create_auth_triggers.sql
```

Ou no Supabase Dashboard (SQL Editor), copie e cole o conteúdo de:
`backend/database_migrations/petimi_vet/create_auth_triggers.sql`

---

## 🧪 Verificação

### 1. Verificar se o role foi definido:
```sql
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as role,
  created_at
FROM auth.users
WHERE email = 'abd.pedroso@gmail.com';
```

**Resultado esperado:**
```
role
-----
admin
-- OU
clinic
-- OU
vet
```

### 2. Verificar se foi criado na tabela correspondente:

**Se Admin:**
```sql
-- Admins não precisam de tabela, apenas o role
SELECT 'OK - Admin não precisa de tabela' as status;
```

**Se Clínica:**
```sql
-- Verificar tabela clinics
SELECT c.*, u.email 
FROM clinics c
JOIN auth.users u ON u.id = c.id
WHERE u.email = 'abd.pedroso@gmail.com';

-- Verificar unidade principal
SELECT * FROM units 
WHERE clinic_id = (
  SELECT id FROM auth.users WHERE email = 'abd.pedroso@gmail.com'
)
AND is_main = true;

-- Verificar role CADMIN
SELECT * FROM clinic_users
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'abd.pedroso@gmail.com'
)
AND role = 'CADMIN';
```

**Se Veterinário:**
```sql
SELECT v.*, u.email 
FROM vets v
JOIN auth.users u ON u.id = v.id
WHERE u.email = 'abd.pedroso@gmail.com';
```

### 3. Testar Login:

1. Abra o frontend: `http://localhost:3000/login`
2. Entre com: `abd.pedroso@gmail.com` + sua senha
3. **Resultado esperado:**
   - Admin → Redireciona para `/admin-dashboard`
   - Clínica → Redireciona para `/clinic-dashboard`
   - Veterinário → Redireciona para `/vet-dashboard`

---

## 🔄 Solução Rápida: Script All-in-One

Se você quer uma solução rápida para tornar `abd.pedroso@gmail.com` um **Admin do Sistema**:

```sql
-- Executar no Supabase SQL Editor
-- SCRIPT COMPLETO PARA CRIAR ADMIN

-- 1. Atualizar role
UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_build_object('role', 'admin')
WHERE email = 'abd.pedroso@gmail.com';

-- 2. Verificar
SELECT 
  email,
  raw_user_meta_data->>'role' as role,
  'Admin criado com sucesso!' as status
FROM auth.users
WHERE email = 'abd.pedroso@gmail.com';
```

**Pronto!** Agora faça login e você será redirecionado para `/admin-dashboard`.

---

## 🚀 Para Criar Novos Usuários Corretamente

### Via Frontend (Recomendado):
1. Use as páginas de sign-up: `/clinic-signup` ou `/vet-signup`
2. O sistema cria automaticamente os registros necessários

### Via Supabase Dashboard:
1. **Crie o usuário** (Authentication > Add User)
2. **Defina o role IMEDIATAMENTE** com o SQL:
```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_build_object('role', 'TIPO_AQUI')
WHERE email = 'novo.usuario@example.com';
```
3. **Execute os INSERTs** nas tabelas correspondentes (clinics/vets)

### Via API (Melhor para Produção):
Use os endpoints de sign-up existentes que já fazem tudo automaticamente.

---

## 📊 Fluxo Correto de Cadastro

```
User Sign-Up
    ↓
1. Cria em auth.users (com role no metadata)
    ↓
2. Trigger automático detecta
    ↓
3. Cria registro em clinics/vets
    ↓
4. (Se clínica) Cria unidade principal
    ↓
5. (Se clínica) Cria clinic_user com CADMIN
    ↓
✅ Usuário pronto para login
```

---

## 🐛 Troubleshooting

### Problema: "Login falha mesmo após seguir os passos"
**Solução:**
1. Limpar cache do navegador
2. Verificar se a senha está correta
3. Verificar se `email_confirmed_at` não é NULL:
```sql
SELECT email_confirmed_at FROM auth.users 
WHERE email = 'abd.pedroso@gmail.com';

-- Se for NULL, executar:
UPDATE auth.users 
SET email_confirmed_at = NOW()
WHERE email = 'abd.pedroso@gmail.com';
```

### Problema: "Redirecionamento errado após login"
**Solução:**
```sql
-- Verificar se o role está correto
SELECT raw_user_meta_data 
FROM auth.users 
WHERE email = 'abd.pedroso@gmail.com';

-- Deve ter: {"role": "admin"} ou {"role": "clinic"} ou {"role": "vet"}
```

### Problema: "Triggers não estão funcionando"
**Solução:**
1. Verificar se os triggers foram criados:
```sql
SELECT * FROM information_schema.triggers
WHERE event_object_table = 'users';
```
2. Re-executar o script de triggers

---

## 📝 Checklist Final

- [ ] Role definido no `auth.users`
- [ ] Registro criado na tabela correspondente (se aplicável)
- [ ] Unidade principal criada (se clínica)
- [ ] Clinic_user criado com CADMIN (se clínica)
- [ ] Triggers instalados para futuros usuários
- [ ] Login testado e funcionando
- [ ] Redirecionamento correto

---

## 📞 Precisa de Ajuda?

Se ainda tiver problemas:
1. Verifique o console do navegador (F12)
2. Verifique os logs do Supabase
3. Execute as queries de verificação acima
4. Compartilhe os erros específicos

---

**Versão:** 1.0.0  
**Data:** 29 de Outubro, 2025  
**Autor:** PetMi Vet Development Team

