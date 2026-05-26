# 📋 Database Migrations

Este diretório agrupa migrations SQL por produto:

| Pasta | Conteúdo |
|--------|----------|
| **`petimi_vet/`** | PetMi Vet (demandas, unidades, auth, suporte, seeds, diagnósticos, `BOOTSTRAP_NEW_SUPABASE_ALL_IN_ONE.sql`) |
| **`petimi_hub/`** | PetMi Hub (`hub_guardians` + extensões CRM, `hub_pets`, `hub_service_types`, `hub_appointments`, blocos de calendário, `hub_appointment_series`, `hub_appointment_services`) |

Os ficheiros `.md` de apoio (`README.md`, `EXECUTE_MIGRATIONS_GUIDE.md`, `README_STAGING.md`, …) ficam na **raiz** deste diretório.

## 🚨 Resolução Rápida de Erros

Se você está com erros ao criar demandas ou candidatar-se a vagas:

### ⚡ Solução Rápida (Recomendada)

1. Abra **Supabase Dashboard** → **SQL Editor**
2. Execute o arquivo: **`petimi_vet/01_FIX_ALL_ERRORS.sql`**
3. Pronto! ✅

📖 **Guia completo:** Veja `FIX_DATABASE_ERRORS.md` na raiz do projeto.

---

## 📁 Arquivos Principais

### 🩺 Diagnóstico e Correção

| Arquivo | Descrição | Quando Usar |
|---------|-----------|-------------|
| `petimi_vet/00_DIAGNOSE_DATABASE.sql` | Diagnóstico do estado do banco | Sempre execute PRIMEIRO para saber o que precisa corrigir |
| `petimi_vet/01_FIX_ALL_ERRORS.sql` | Corrige TODOS os erros de uma vez | **Recomendado:** Corrige os 2 erros principais |
| `EXECUTE_MIGRATIONS_GUIDE.md` | Guia detalhado passo a passo | Se preferir executar migrations individuais |

---

## 📚 Todas as Migrations

### Estrutura e Autenticação

- `petimi_vet/create_admin_user.sql` - Cria usuário admin inicial
- `petimi_vet/create_auth_triggers.sql` - Triggers de autenticação
- `petimi_vet/create_units_and_permissions_system.sql` - Sistema de unidades e permissões
- `petimi_vet/add_nickname_to_units.sql` - Adiciona campo nickname/apelido às unidades

### Demandas (Demands)

- `petimi_vet/add_datetime_fields.sql` - Adiciona campos de data/hora
- `petimi_vet/add_category_and_specialties.sql` - Adiciona categoria e especialidades
- `petimi_vet/add_required_specialties.sql` - Adiciona especialidades requeridas
- `petimi_vet/fix_clinic_id_type.sql` - Corrige tipo de clinic_id (bigint → uuid)

### Sistema de Posições

- `petimi_vet/create_demand_positions_system.sql` - ⭐ Cria sistema completo de posições profissionais
  - Adiciona `end_time` à tabela demands
  - Remove `duration_hours`
  - Cria tabelas: `demand_positions`, `position_applications`
  - Cria funções e triggers automáticos

- `petimi_vet/add_position_specialties_junction_table.sql` - Tabela de junção para especialidades
- `petimi_vet/fix_position_applications_types.sql` - Corrige tipos (bigint → uuid)

### Especialidades (lista vazia no onboarding / demandas)

- **`petimi_vet/seed_specialties_petimi.sql`** — Garante a tabela `specialties`, colunas `role` / `active`, constraints compatíveis com o backend e **insere ou atualiza** ~50 especialidades (vet + freelancer).  
  **Quando usar:** Supabase novo ou tabela vazia / sem `role` (a API `/specialties` filtra por `role`; sem dados ou com `role` NULL a lista aparece vazia).  
  **Como:** Supabase Dashboard → SQL Editor → colar o ficheiro → Run.

- **`petimi_vet/seed_specialties_clinic_other_minimal.sql`** — Insere especialidades com `role` `clinic` e `other` (necessárias para criar demandas nessas categorias). **Quando usar:** `GET /specialties?category=clinic` ou `...other` devolve `[]`.

- `petimi_vet/add_category_and_specialties.sql` — Versão mais antiga (category só `vet|freelancer|clinic|other`); o seed acima alinha com `petimi_vet/update_specialties_staging.sql`.

### PetMi Hub (operação / tutores)

- **`petimi_hub/create_hub_guardians.sql`** — Cria `hub_guardians` (tutores por `clinic_id`, soft delete `deleted_at`) + índice + trigger `updated_at` via `moddatetime`.  
  **Pré-requisito:** função/trigger `moddatetime` já aplicada (`petimi_vet/create_moddatetime_function.sql`). Se o trigger falhar, criar a função primeiro ou comentar o bloco `CREATE TRIGGER` no ficheiro.  
  **Quando usar:** antes de usar `GET/POST/PATCH /api/hub/guardians` em staging/produção.

- **`petimi_hub/create_hub_pets_and_pet_guardians.sql`** — Cria `hub_pets` (`petmi_pet_id`, dados do animal, soft delete) e `hub_pet_guardians` (primary/secondary, um primary por pet). **Executar depois** de `petimi_hub/create_hub_guardians.sql`.

- **`petimi_hub/alter_hub_guardians_client_profile.sql`** — Adiciona a `hub_guardians` perfil de cliente: `client_kind` (PF/PJ), `legal_name`, documentos, morada, `client_status`, etc. **Executar depois** de `create_hub_guardians.sql`. Ver `petimi_hub/README.md`.

- **`petimi_hub/create_hub_staff.sql`** — Equipe Hub (`hub_staff_members`, `hub_staff_service_types`). Ver comentários no ficheiro.

- **`petimi_hub/alter_hub_staff_birth_date.sql`** — Adiciona `birth_date` (date, opcional) a `hub_staff_members` se ainda não existir.

- **`petimi_hub/create_hub_staff_photos_bucket.sql`** — Bucket Storage `hub-staff-photos` (fotos de profissionais; leitura pública, upload só pelo backend). **Executar** para `POST /api/hub/staff/photo` funcionar.

- **`petimi_hub/create_hub_appointments.sql`** — Agenda Hub: `hub_appointments` (intervalos, staff opcional, tipo de serviço, pet/tutor, `appointment_kind`) e `hub_agenda_calendar_blocks` (feriados/fechamentos). **Executar depois** de `create_hub_staff.sql`, `create_hub_pets_and_pet_guardians.sql` e `create_hub_service_types.sql`. Ver `petimi_hub/README.md`.

### Onboarding de veterinário (erro `onboarding_completed does not exist`)

- **`petimi_vet/fix_vet_onboarding_schema_supabase.sql`** — Adiciona em `public.vets` as colunas `onboarding_completed`, `crmv_file_url`, `service_regions`, `experience_year` e o bloco de **aprovação** (`approval_status`, etc.), como nas migrations `petimi_vet/add_vet_onboarding_fields.sql` + `petimi_vet/add_vet_approval_system.sql`.  
  **Sintoma:** ao finalizar onboarding, mensagem *column vets.onboarding_completed does not exist*.  
  **Como:** SQL Editor → executar este ficheiro (ou as duas migrations originais **nessa ordem**).

### Cadastro público de clínica (`POST /clinics`)

- **`petimi_vet/fix_clinic_public_signup_clinic_users.sql`** — Torna `clinic_users.clinic_id` **nullable** e atualiza o **CHECK** de `status` para incluir `pending_clinic` (fluxo atual do signup).  
  **Sintoma:** *null value in column "clinic_id" violates not-null constraint* ou falha ao criar vínculo após criar o user no Auth.  
  **Como:** SQL Editor → executar antes de testar `/clinic-signup` ou `POST /clinics`.

### Migrações de Dados

- `petimi_vet/migrate_existing_clinics_to_units.sql` - Migra clínicas existentes para sistema de unidades
- `petimi_vet/add_photo_url_columns.sql` - Adiciona colunas photo_url para clinics e vets
- `petimi_vet/drop_photo_url_indexes.sql` - Remove índices desnecessários de photo_url
- `petimi_vet/add_clinic_approval_system.sql` - Sistema de aprovação de clínicas e unidades
- `petimi_vet/migrate_existing_clinics_to_approval_flow.sql` - Migra clínicas existentes para sistema de aprovação

---

## 🔧 Como Executar Migrations

### Método 1: All-in-One (Recomendado)

```sql
-- Execute: petimi_vet/01_FIX_ALL_ERRORS.sql
-- Corrige tudo de uma vez
```

### Método 2: Passo a Passo

1. Execute `petimi_vet/00_DIAGNOSE_DATABASE.sql` para diagnóstico
2. Com base no resultado, execute as migrations necessárias **na ordem**
3. Verifique com o diagnóstico novamente

### Método 3: Migrations Individuais

Execute na ordem cronológica (da mais antiga para a mais recente):

1. `petimi_vet/create_admin_user.sql`
2. `petimi_vet/create_auth_triggers.sql`
3. `petimi_vet/add_datetime_fields.sql`
4. `petimi_vet/add_category_and_specialties.sql`
5. `petimi_vet/add_required_specialties.sql`
6. `petimi_vet/fix_clinic_id_type.sql`
7. `petimi_vet/create_units_and_permissions_system.sql`
8. `petimi_vet/create_demand_positions_system.sql` ⭐ **IMPORTANTE**
9. `petimi_vet/add_position_specialties_junction_table.sql`
10. `petimi_vet/migrate_existing_clinics_to_units.sql`

---

## Novo projeto Supabase (vazio)

Para **criar schema do zero** num projeto novo (sem importar dump de cluster inteiro):

- **Um só ficheiro:** `petimi_vet/BOOTSTRAP_NEW_SUPABASE_ALL_IN_ONE.sql` — cole no SQL Editor e execute (se der timeout, use a opção em passos abaixo). Para regenerar após alterar migrações: `./scripts/generate-bootstrap-all-in-one.sh`.

1. No repositório, execute: `./scripts/bootstrap-new-supabase.sh` — lista a **ordem** dos ficheiros SQL.
2. No **Supabase Dashboard → SQL Editor**, cole e execute **cada** ficheiro **por ordem** (um de cada vez).
3. Depois, opcional: `petimi_vet/00_DIAGNOSE_DATABASE.sql` e, só se fizer falta, `petimi_vet/01_FIX_ALL_ERRORS.sql`.

Importante: **não** execute `petimi_vet/create_auth_triggers.sql` depois de `petivet_prod_structure.sql` + migrações em `supabase/migrations/`, pois sobrescreve `handle_new_user`. Use `petimi_vet/bootstrap_attach_auth_triggers.sql` (só liga os triggers em `auth.users`).

Dump antigo (`.backup`): não colar o ficheiro inteiro no SQL Editor. Para extrair só `public`: `python3 scripts/extract_public_from_supabase_cluster_dump.py …` (ver comentário no script).

---

## 📝 Notas Importantes

### Campo Nickname em Unidades

O campo `nickname` foi adicionado para permitir que clínicas diferenciem unidades na mesma cidade:

- **Único por clínica**: Uma clínica não pode ter duas unidades com o mesmo nickname
- **Formato recomendado**: "Cidade - Bairro" (ex: "Cotia - Granja Viana")
- **Obrigatório**: Deve ser preenchido ao criar ou editar unidades
- **Máximo**: 100 caracteres

**Migration**: `petimi_vet/add_nickname_to_units.sql`

---

## ✅ Verificação

Após executar migrations, sempre verifique:

```sql
-- Execute: petimi_vet/00_DIAGNOSE_DATABASE.sql
-- Deve mostrar: "✅ BANCO DE DADOS OK!"
```

---

## 🆘 Troubleshooting

### Erro: "Could not find the 'end_time' column"
**Solução:** Execute `petimi_vet/create_demand_positions_system.sql` ou `petimi_vet/01_FIX_ALL_ERRORS.sql`

### Erro: "invalid input syntax for type bigint"
**Solução:** Execute `petimi_vet/fix_position_applications_types.sql` ou `petimi_vet/01_FIX_ALL_ERRORS.sql`

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

**Última atualização:** 2026-05-23  
**Versão do sistema:** PetMi Vet v2.0 + PetMi Hub (migrations em `petimi_hub/`)

