# 🔧 Correção: Erro ao Candidatar-se a Vagas

## 🎯 Problema

Ao tentar candidatar-se a uma vaga, aparece o erro:
```
Erro ao enviar candidatura: invalid input syntax for type bigint: "29541e87-f802-4c0b-9626-cfa328171688"
```

**Causa:** A tabela `position_applications` foi criada com colunas do tipo `bigint` em vez de `uuid`.

---

## ✅ Solução: Executar Migration no Supabase

### Passo 1: Acesse o SQL Editor no Supabase

1. Acesse seu projeto no **Supabase Dashboard**
2. No menu lateral, clique em **SQL Editor**
3. Clique em **New Query** (Nova Consulta)

---

### Passo 2: Execute o Script de Correção

Cole e execute o seguinte SQL:

```sql
-- ========================================
-- 1. BACKUP: Criar backup dos dados existentes (se houver)
-- ========================================
CREATE TABLE IF NOT EXISTS position_applications_backup AS 
SELECT * FROM position_applications;

-- ========================================
-- 2. RECRIAR: Tabela position_applications com tipos corretos
-- ========================================
DROP TABLE IF EXISTS position_applications CASCADE;

CREATE TABLE position_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES demand_positions(id) ON DELETE CASCADE,
  vet_id uuid NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 
    'accepted', 
    'rejected',
    'cancelled_by_vet',
    'inactive_accepted_other_position',
    'inactive_time_conflict'
  )),
  message text,
  accepted_at timestamp with time zone,
  inactive_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(position_id, vet_id)
);

-- ========================================
-- 3. ÍNDICES: Recriar índices
-- ========================================
CREATE INDEX IF NOT EXISTS idx_position_applications_position ON position_applications(position_id);
CREATE INDEX IF NOT EXISTS idx_position_applications_vet ON position_applications(vet_id);
CREATE INDEX IF NOT EXISTS idx_position_applications_status ON position_applications(status);

-- ========================================
-- 4. VERIFICAÇÃO: Confirmar estrutura correta
-- ========================================
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'position_applications'
ORDER BY ordinal_position;
```

---

### Passo 3: Verificar Resultado

Após executar o script, você deve ver uma tabela de verificação mostrando:

| column_name | data_type | is_nullable | column_default |
|-------------|-----------|-------------|----------------|
| id | uuid | NO | gen_random_uuid() |
| position_id | uuid | NO | |
| vet_id | uuid | NO | |
| status | text | NO | 'pending'::text |
| message | text | YES | |
| accepted_at | timestamp with time zone | YES | |
| inactive_reason | text | YES | |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Confirme que:**
- ✅ `id`, `position_id` e `vet_id` são do tipo **uuid** (não bigint)

---

### Passo 4: Testar a Candidatura

1. Volte para a aplicação
2. Acesse a página de posições disponíveis (como veterinário)
3. Tente candidatar-se a uma vaga
4. **Deve funcionar agora!** ✅

---

## 📋 Notas Importantes

### ⚠️ Sobre Dados Existentes

- Este script **cria um backup** antes de recriar a tabela
- Se você tinha candidaturas anteriores, elas estão salvas em `position_applications_backup`
- Para restaurar dados do backup (se necessário):

```sql
INSERT INTO position_applications 
SELECT * FROM position_applications_backup;
```

### 🗑️ Limpar Backup (Opcional)

Após confirmar que tudo funciona, você pode remover a tabela de backup:

```sql
DROP TABLE IF EXISTS position_applications_backup;
```

---

## 🔍 Como Verificar se o Problema Foi Resolvido

Execute esta query para confirmar os tipos corretos:

```sql
SELECT 
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_name = 'position_applications'
  AND column_name IN ('id', 'position_id', 'vet_id');
```

**Resultado esperado:**
```
column_name  | data_type
-------------|-----------
id           | uuid
position_id  | uuid
vet_id       | uuid
```

---

## ✅ Pronto!

Após executar esta migration, o erro **"invalid input syntax for type bigint"** deve desaparecer e os veterinários poderão se candidatar normalmente às vagas! 🎉

---

## 💡 Por Que Isso Aconteceu?

Este problema ocorre quando:
1. Uma versão antiga da tabela foi criada com tipos `bigint`
2. A migration correta com tipos `uuid` não foi aplicada
3. Existe uma discrepância entre o código (que usa UUID) e o banco (que espera bigint)

A solução é **recriar a tabela com os tipos corretos** conforme especificado na migration `create_demand_positions_system.sql`.

