# 📋 Guia de Execução de Migrations

## ⚠️ IMPORTANTE: Execute as migrations NA ORDEM especificada abaixo!

Este guia lista todas as migrations que devem ser executadas para corrigir os erros de schema no banco de dados.

---

## 🔧 Como Executar as Migrations

1. **Abra o Supabase Dashboard** do seu projeto
2. Vá em **SQL Editor** (menu lateral esquerdo)
3. **Cole o conteúdo de cada migration** (uma por vez, na ordem)
4. Clique em **Run** (ou pressione `Ctrl/Cmd + Enter`)
5. ✅ Aguarde a confirmação de sucesso antes de executar a próxima

---

## 🩺 PASSO 0: DIAGNÓSTICO (EXECUTE PRIMEIRO!)

**Arquivo:** `00_DIAGNOSE_DATABASE.sql`  
**Descrição:** Verifica o estado atual do banco de dados e indica quais migrations são necessárias.

**Como usar:**
1. Copie e execute o conteúdo de `00_DIAGNOSE_DATABASE.sql` no SQL Editor
2. Leia os resultados - ele mostrará:
   - ✅ O que está correto
   - ❌ O que precisa ser corrigido
   - 📋 Quais migrations executar

**Com base no diagnóstico, execute apenas as migrations necessárias abaixo.**

---

## 📝 Ordem de Execução das Migrations

### ✅ **1. Fix Position Applications Types** 
**Arquivo:** `fix_position_applications_types.sql`  
**Descrição:** Corrige os tipos de dados na tabela `position_applications` (bigint → uuid)

**Por que executar:** Resolve o erro de candidatura de veterinários.

---

### ✅ **2. Create Demand Positions System**
**Arquivo:** `create_demand_positions_system.sql`  
**Descrição:** Adiciona a coluna `end_time` e remove `duration_hours` da tabela `demands`

**Por que executar:** Resolve o erro "Could not find the 'end_time' column".

---

## 🧪 Verificação Após Execução

Execute este SQL para verificar se tudo está correto:

```sql
-- Verificar schema da tabela demands
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'demands'
AND column_name IN ('end_time', 'duration_hours', 'is_composite')
ORDER BY column_name;

-- Verificar schema da tabela position_applications
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'position_applications'
AND column_name IN ('id', 'position_id', 'vet_id')
ORDER BY column_name;
```

**Resultado esperado:**
- `demands` deve ter `end_time` (tipo `time`) e NÃO ter `duration_hours`
- `position_applications` deve ter `id`, `position_id`, `vet_id` com tipo `uuid`

---

## 🚀 Testar Após Migrations

1. **Criar uma nova demanda:**
   - Acesse a página de criar demanda
   - Preencha todos os campos
   - Clique em "Criar Demanda"
   - ✅ Deve criar sem erros

2. **Candidatar-se a uma vaga:**
   - Como veterinário, acesse o marketplace de vagas
   - Clique em "Candidatar-se" em uma vaga
   - ✅ Deve candidatar sem erros

---

## 📋 Checklist de Execução

- [ ] Migration 1: `fix_position_applications_types.sql` executada
- [ ] Migration 2: `create_demand_positions_system.sql` executada
- [ ] Queries de verificação executadas
- [ ] Schema correto confirmado
- [ ] Teste de criar demanda ✅
- [ ] Teste de candidatura ✅

---

## ⚠️ Troubleshooting

### Erro: "column already exists"
Se você receber um erro dizendo que a coluna já existe, significa que parte da migration já foi executada. Você pode:
1. Comentar as linhas que adicionam colunas já existentes
2. Executar apenas as partes que ainda não foram aplicadas

### Erro: "relation does not exist"
Se uma tabela não existir, você pode precisar executar migrations anteriores primeiro. Verifique se todas as tabelas necessárias existem.

### Erro de Foreign Key
Se houver erro de chave estrangeira, verifique se os dados existentes são válidos (UUIDs corretos, referências existentes).

---

## 📞 Suporte

Se encontrar problemas durante a execução:
1. Leia a mensagem de erro completa
2. Verifique qual linha do SQL causou o erro
3. Consulte a documentação do PostgreSQL/Supabase
4. Considere fazer backup antes de modificações grandes

