# 🚀 EXECUTAR TODAS AS MIGRATIONS - GUIA COMPLETO

Execute estas migrations **NA ORDEM** para ativar todas as funcionalidades do sistema.

## 📋 Lista de Migrations

### ✅ 1. add_photo_url_columns.sql
**Prioridade: ALTA** - Necessário para upload de fotos de perfil

```sql
-- Copie e execute o conteúdo de:
backend/database_migrations/petimi_vet/add_photo_url_columns.sql
```

**O que faz:**
- ✅ Adiciona coluna `photo_url` na tabela `clinics`
- ✅ Adiciona coluna `photo_url` na tabela `vets`
- ✅ Cria índices para performance

**Quando executar:** AGORA (necessário para funcionalidade básica)

---

### ✅ 2. add_clinic_approval_system.sql
**Prioridade: MÉDIA** - Sistema de aprovação de clínicas

```sql
-- Copie e execute o conteúdo de:
backend/database_migrations/petimi_vet/add_clinic_approval_system.sql
```

**O que faz:**
- ✅ Adiciona coluna `status` na tabela `clinics`
- ✅ Atualiza constraints em `units` e `clinic_users`
- ✅ Adiciona campos de auditoria em `units`

**Quando executar:** Após a migration 1

---

### ✅ 3. update_auth_trigger_approval_flow.sql
**Prioridade: MÉDIA** - Atualiza trigger de cadastro

```sql
-- Copie e execute o conteúdo de:
backend/database_migrations/petimi_vet/update_auth_trigger_approval_flow.sql
```

**O que faz:**
- ✅ Modifica trigger `handle_new_user()`
- ✅ Clínicas novas não criam unidade automaticamente
- ✅ Clínicas começam com status `pending_unit`

**Quando executar:** Após a migration 2

---

### ✅ 4. migrate_existing_clinics_to_approval_flow.sql
**Prioridade: MÉDIA** - Protege clínicas existentes

```sql
-- Copie e execute o conteúdo de:
backend/database_migrations/petimi_vet/migrate_existing_clinics_to_approval_flow.sql
```

**O que faz:**
- ✅ Atualiza clínicas existentes para status `active`
- ✅ Atualiza unidades existentes para status `approved`
- ✅ Ativa todos os `clinic_users` existentes

**Quando executar:** Após a migration 3

---

## 🚀 Passo a Passo para Executar TODAS

### 1️⃣ Acesse Supabase
- URL: https://app.supabase.com
- Projeto: PetMi Vet
- Navegue para: **SQL Editor** (⚡)

### 2️⃣ Execute Migration 1 (OBRIGATÓRIA)
```sql
-- Abra: backend/database_migrations/petimi_vet/add_photo_url_columns.sql
-- Copie todo o conteúdo
-- Cole no SQL Editor
-- Clique em "Run"
```

✅ **Confirme o sucesso:**
```
status: "Migration add_photo_url_columns.sql concluída com sucesso!"
clinics_photo_url_exists: 1
vets_photo_url_exists: 1
```

### 3️⃣ Execute Migration 2
```sql
-- Abra: backend/database_migrations/petimi_vet/add_clinic_approval_system.sql
-- Copie todo o conteúdo
-- Cole no SQL Editor
-- Clique em "Run"
```

✅ **Confirme o sucesso:**
```
status: "Migration add_clinic_approval_system.sql concluída com sucesso!"
```

### 4️⃣ Execute Migration 3
```sql
-- Abra: backend/database_migrations/petimi_vet/update_auth_trigger_approval_flow.sql
-- Copie todo o conteúdo
-- Cole no SQL Editor
-- Clique em "Run"
```

✅ **Confirme o sucesso:**
```
status: "Migration update_auth_trigger_approval_flow.sql concluída com sucesso!"
```

### 5️⃣ Execute Migration 4
```sql
-- Abra: backend/database_migrations/petimi_vet/migrate_existing_clinics_to_approval_flow.sql
-- Copie todo o conteúdo
-- Cole no SQL Editor
-- Clique em "Run"
```

✅ **Confirme o sucesso:**
```
status: "Migration migrate_existing_clinics_to_approval_flow.sql concluída com sucesso!"
clinicas_ativas: X
unidades_aprovadas: X
usuarios_ativos: X
```

---

## ✅ Após Executar TODAS as Migrations

### 1. Recarregue o Frontend
```bash
# No navegador, pressione F5 ou Ctrl+R
```

### 2. Reinicie o Backend (se necessário)
```bash
cd backend
npm run dev
```

### 3. Teste as Funcionalidades

**Upload de Foto:**
- ✅ Acesse seu perfil
- ✅ Faça upload de uma foto
- ✅ Deve funcionar sem erros

**Sistema de Aprovação (se executou migrations 2-4):**
- ✅ Cadastre nova clínica
- ✅ Crie primeira unidade
- ✅ Login como ADMIN
- ✅ Aprove/reprove em `/admin/pending-units`

---

## ⚠️ IMPORTANTE

### Ordem de Execução
**SEMPRE execute as migrations NA ORDEM indicada!**

1. `add_photo_url_columns.sql` (OBRIGATÓRIA)
2. `add_clinic_approval_system.sql`
3. `update_auth_trigger_approval_flow.sql`
4. `migrate_existing_clinics_to_approval_flow.sql`

### Migrations Idempotentes
Todas as migrations usam `IF NOT EXISTS` ou `IF EXISTS`, então:
- ✅ Seguras para executar múltiplas vezes
- ✅ Não causam erros se já executadas
- ✅ Não perdem dados existentes

### Backup
Embora as migrations sejam seguras, **sempre bom ter backup:**
- Supabase Dashboard → Settings → Backups
- Ou faça export manual das tabelas importantes

---

## 🆘 Troubleshooting

### Erro: "relation X does not exist"
**Solução:** Execute as migrations anteriores primeiro

### Erro: "column already exists"
**Solução:** Normal! A migration detecta isso e pula

### Erro: "permission denied"
**Solução:** Verifique se você é admin do projeto Supabase

### Frontend ainda não funciona
**Solução:** 
1. Recarregue a página (F5)
2. Limpe cache do navegador (Ctrl+Shift+R)
3. Verifique console para erros

---

## 📊 Status das Migrations

| Migration | Status | Necessária Para |
|-----------|--------|-----------------|
| `add_photo_url_columns.sql` | ⏳ Pendente | Upload de fotos |
| `add_clinic_approval_system.sql` | ⏳ Pendente | Aprovação de clínicas |
| `update_auth_trigger_approval_flow.sql` | ⏳ Pendente | Fluxo de cadastro |
| `migrate_existing_clinics_to_approval_flow.sql` | ⏳ Pendente | Proteger clínicas existentes |

Após executar, marque como: ✅ Completo

---

## 🎯 Conclusão

Após executar **TODAS** as migrations:
- ✅ Upload de fotos funcionando
- ✅ Sistema de aprovação ativo
- ✅ Clínicas existentes protegidas
- ✅ Sistema 100% funcional!

**Qualquer dúvida, verifique os logs de execução no SQL Editor do Supabase.**

