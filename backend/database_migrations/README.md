# 📋 Database Migrations

Este diretório contém todas as migrations do banco de dados do sistema PetiVet.

## 🚨 Resolução Rápida de Erros

Se você está com erros ao criar demandas ou candidatar-se a vagas:

### ⚡ Solução Rápida (Recomendada)

1. Abra **Supabase Dashboard** → **SQL Editor**
2. Execute o arquivo: **`01_FIX_ALL_ERRORS.sql`**
3. Pronto! ✅

📖 **Guia completo:** Veja `FIX_DATABASE_ERRORS.md` na raiz do projeto.

---

## 📁 Arquivos Principais

### 🩺 Diagnóstico e Correção

| Arquivo | Descrição | Quando Usar |
|---------|-----------|-------------|
| `00_DIAGNOSE_DATABASE.sql` | Diagnóstico do estado do banco | Sempre execute PRIMEIRO para saber o que precisa corrigir |
| `01_FIX_ALL_ERRORS.sql` | Corrige TODOS os erros de uma vez | **Recomendado:** Corrige os 2 erros principais |
| `EXECUTE_MIGRATIONS_GUIDE.md` | Guia detalhado passo a passo | Se preferir executar migrations individuais |

---

## 📚 Todas as Migrations

### Estrutura e Autenticação

- `create_admin_user.sql` - Cria usuário admin inicial
- `create_auth_triggers.sql` - Triggers de autenticação
- `create_units_and_permissions_system.sql` - Sistema de unidades e permissões
- `add_nickname_to_units.sql` - Adiciona campo nickname/apelido às unidades

### Demandas (Demands)

- `add_datetime_fields.sql` - Adiciona campos de data/hora
- `add_category_and_specialties.sql` - Adiciona categoria e especialidades
- `add_required_specialties.sql` - Adiciona especialidades requeridas
- `fix_clinic_id_type.sql` - Corrige tipo de clinic_id (bigint → uuid)

### Sistema de Posições

- `create_demand_positions_system.sql` - ⭐ Cria sistema completo de posições profissionais
  - Adiciona `end_time` à tabela demands
  - Remove `duration_hours`
  - Cria tabelas: `demand_positions`, `position_applications`
  - Cria funções e triggers automáticos

- `add_position_specialties_junction_table.sql` - Tabela de junção para especialidades
- `fix_position_applications_types.sql` - Corrige tipos (bigint → uuid)

### Migrações de Dados

- `migrate_existing_clinics_to_units.sql` - Migra clínicas existentes para sistema de unidades
- `add_photo_url_columns.sql` - Adiciona colunas photo_url para clinics e vets
- `drop_photo_url_indexes.sql` - Remove índices desnecessários de photo_url
- `add_clinic_approval_system.sql` - Sistema de aprovação de clínicas e unidades
- `migrate_existing_clinics_to_approval_flow.sql` - Migra clínicas existentes para sistema de aprovação

---

## 🔧 Como Executar Migrations

### Método 1: All-in-One (Recomendado)

```sql
-- Execute: 01_FIX_ALL_ERRORS.sql
-- Corrige tudo de uma vez
```

### Método 2: Passo a Passo

1. Execute `00_DIAGNOSE_DATABASE.sql` para diagnóstico
2. Com base no resultado, execute as migrations necessárias **na ordem**
3. Verifique com o diagnóstico novamente

### Método 3: Migrations Individuais

Execute na ordem cronológica (da mais antiga para a mais recente):

1. `create_admin_user.sql`
2. `create_auth_triggers.sql`
3. `add_datetime_fields.sql`
4. `add_category_and_specialties.sql`
5. `add_required_specialties.sql`
6. `fix_clinic_id_type.sql`
7. `create_units_and_permissions_system.sql`
8. `create_demand_positions_system.sql` ⭐ **IMPORTANTE**
9. `add_position_specialties_junction_table.sql`
10. `migrate_existing_clinics_to_units.sql`

---

## 📝 Notas Importantes

### Campo Nickname em Unidades

O campo `nickname` foi adicionado para permitir que clínicas diferenciem unidades na mesma cidade:

- **Único por clínica**: Uma clínica não pode ter duas unidades com o mesmo nickname
- **Formato recomendado**: "Cidade - Bairro" (ex: "Cotia - Granja Viana")
- **Obrigatório**: Deve ser preenchido ao criar ou editar unidades
- **Máximo**: 100 caracteres

**Migration**: `add_nickname_to_units.sql`

---

## ✅ Verificação

Após executar migrations, sempre verifique:

```sql
-- Execute: 00_DIAGNOSE_DATABASE.sql
-- Deve mostrar: "✅ BANCO DE DADOS OK!"
```

---

## 🆘 Troubleshooting

### Erro: "Could not find the 'end_time' column"
**Solução:** Execute `create_demand_positions_system.sql` ou `01_FIX_ALL_ERRORS.sql`

### Erro: "invalid input syntax for type bigint"
**Solução:** Execute `fix_position_applications_types.sql` ou `01_FIX_ALL_ERRORS.sql`

### Erro: "column already exists"
**Solução:** A migration já foi parcialmente executada. Comente as linhas que criam colunas já existentes.

### Erro: "relation does not exist"
**Solução:** Execute migrations anteriores primeiro. Verifique a ordem de execução.

---

## 📖 Mais Informações

- **Guia rápido:** `../FIX_DATABASE_ERRORS.md` (na raiz do projeto)
- **Guia completo:** `EXECUTE_MIGRATIONS_GUIDE.md` (neste diretório)

---

## 🎯 Estado Ideal do Banco

Após todas as migrations executadas:

✅ Tabela `demands`:
  - Tem coluna `end_time` (tipo: time)
  - NÃO tem coluna `duration_hours`
  - Tem coluna `is_composite` (tipo: boolean)

✅ Tabela `demand_positions`:
  - Existe e está funcional
  - Foreign keys corretas (uuid)

✅ Tabela `position_applications`:
  - Existe com tipos corretos (uuid, não bigint)
  - Constraints e índices criados

✅ Views e Funções:
  - `positions_with_availability` (view)
  - `check_time_conflict()` (function)
  - `handle_application_acceptance()` (trigger function)

---

**Última atualização:** 2025-10-29
**Versão do sistema:** PetiVet v2.0

