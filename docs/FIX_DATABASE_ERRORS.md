# 🔧 Corrigir Erros do Banco de Dados

## 🎯 Problemas Identificados

Você está enfrentando **2 erros** relacionados ao schema do banco de dados:

1. ❌ **Erro ao criar demanda:** `"Could not find the 'end_time' column of 'demands'"`
2. ❌ **Erro ao candidatar-se:** `"invalid input syntax for type bigint: [uuid]"`

---

## ✅ Solução Rápida (3 Passos)

### **PASSO 1: Diagnóstico** 🩺

1. Abra o **Supabase Dashboard** → **SQL Editor**
2. Abra o arquivo: `backend/database_migrations/petimi_vet/00_DIAGNOSE_DATABASE.sql`
3. Copie todo o conteúdo e cole no SQL Editor
4. Clique em **Run**

O resultado mostrará o que está errado e o que precisa ser corrigido.

---

### **PASSO 2: Executar Migrations** 🔧

Você tem **2 opções**:

#### **OPÇÃO A: All-in-One (Recomendado)** ⚡

Execute tudo de uma vez:

**Arquivo:** `backend/database_migrations/petimi_vet/01_FIX_ALL_ERRORS.sql`

⚠️ **ATENÇÃO: Este script vai recriar a tabela `demands`**
- Se você tem demandas já criadas, elas serão **apagadas**
- Um backup é feito automaticamente em `demands_backup`
- **Recomendado para ambientes de desenvolvimento/teste**

1. Abra o arquivo `01_FIX_ALL_ERRORS.sql`
2. Copie **TODO** o conteúdo
3. Cole no SQL Editor do Supabase
4. Clique em **Run**
5. Aguarde a confirmação ✅

**Pronto!** Todos os erros serão corrigidos automaticamente.

---

#### **OPÇÃO B: Passo a Passo** 🔧

Com base no diagnóstico, execute as migrations necessárias **NA ORDEM**:

#### **Migration A: Criar Sistema de Posições**
**Quando executar:** Se o diagnóstico mostrar que `end_time` não existe na tabela `demands`

**Arquivo:** `backend/database_migrations/petimi_vet/create_demand_positions_system.sql`

**O que faz:**
- ✅ Adiciona coluna `end_time` na tabela `demands`
- ✅ Remove coluna antiga `duration_hours`
- ✅ Cria tabelas `demand_positions` e `position_applications`
- ✅ Cria funções e triggers para gestão de vagas

**Como executar:**
1. Abra o arquivo `create_demand_positions_system.sql`
2. Copie **TODO** o conteúdo
3. Cole no SQL Editor do Supabase
4. Clique em **Run**
5. Aguarde a confirmação ✅

---

#### **Migration B: Corrigir Tipos da Tabela Position Applications**
**Quando executar:** Se o diagnóstico mostrar que `position_applications` existe mas com tipo `bigint` ao invés de `uuid`

**Arquivo:** `backend/database_migrations/petimi_vet/fix_position_applications_types.sql`

**O que faz:**
- ✅ Faz backup dos dados existentes
- ✅ Recria a tabela com tipos corretos (uuid)
- ✅ Recria índices e constraints

**Como executar:**
1. Abra o arquivo `fix_position_applications_types.sql`
2. Copie **TODO** o conteúdo
3. Cole no SQL Editor do Supabase
4. Clique em **Run**
5. Aguarde a confirmação ✅

---

### **PASSO 3: Testar** 🧪

Depois de executar as migrations, teste:

#### ✅ **Teste 1: Criar Demanda**
1. Vá em **Criar Nova Demanda**
2. Preencha todos os campos
3. Clique em "Criar Demanda"
4. **Resultado esperado:** Demanda criada com sucesso! ✅

#### ✅ **Teste 2: Candidatar-se a Vaga**
1. Como veterinário, acesse o **Marketplace de Vagas**
2. Escolha uma vaga aberta
3. Clique em "Candidatar-se"
4. **Resultado esperado:** Candidatura enviada com sucesso! ✅

---

## 📋 Checklist Rápido

```
□ Executei o diagnóstico (00_DIAGNOSE_DATABASE.sql)
□ Li os resultados do diagnóstico
□ Executei create_demand_positions_system.sql (se necessário)
□ Executei fix_position_applications_types.sql (se necessário)
□ Testei criar uma demanda ✅
□ Testei candidatar-se a uma vaga ✅
□ Tudo funcionando! 🎉
```

---

## 🆘 Troubleshooting

### "Erro: column already exists"
**Solução:** Parte da migration já foi executada. Comente as linhas que criam colunas/tabelas já existentes e execute o resto.

### "Erro: relation does not exist"
**Solução:** Execute primeiro a migration `create_demand_positions_system.sql` para criar as tabelas necessárias.

### "Erro: constraint violation"
**Solução:** Você pode ter dados inválidos. Verifique se os UUIDs nas foreign keys existem nas tabelas referenciadas.

### Ainda com problemas?
Execute novamente o diagnóstico (`00_DIAGNOSE_DATABASE.sql`) para ver o estado atual.

---

## 📚 Documentação Completa

Para detalhes técnicos completos, consulte:
- `backend/database_migrations/EXECUTE_MIGRATIONS_GUIDE.md`

---

## 🎉 Resultado Final

Após executar as migrations:
- ✅ Sistema de criação de demandas funcionando
- ✅ Sistema de candidaturas funcionando
- ✅ Schema do banco de dados correto e atualizado
- ✅ Sem erros de tipos (bigint vs uuid)
- ✅ Coluna `end_time` disponível para agendamento

