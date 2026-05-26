# PetMi Hub — SQL migrations

Migrations do **PetMi Hub** (tutores, pets, tipos de serviço por clínica). Executar no **Supabase SQL Editor** na ordem indicada.

## Ordem recomendada

1. **`create_hub_guardians.sql`** — `hub_guardians`  
   **Pré-requisito:** função `moddatetime` (ver `petimi_vet/create_moddatetime_function.sql`).

2. **`create_hub_pets_and_pet_guardians.sql`** — `hub_pets` + `hub_pet_guardians`

3. **`create_hub_service_types.sql`** — `hub_service_types`

4. **`alter_hub_service_types_catalog.sql`** — colunas `service_group`, `description`, `allow_scheduling`, `agenda_color`, `internal_notes`, `code_locked`; índice único parcial `(clinic_id, code)` só para linhas não arquivadas (`deleted_at IS NULL`).

5. **`alter_hub_service_types_pricing.sql`** — `cost_amount`, `sale_amount` (`numeric(12,2)`, ≥ 0), valores em **BRL (R$)** na UI; margem calculada no cliente.

6. **`alter_hub_service_types_pricing_matrix.sql`** — `pricing_matrix` (JSONB, nullable): preços por porte, período, tipo de consulta ou faixa de km num único serviço. Ver [`docs/architecture/HUB_SERVICE_TYPES_PRICING_MATRIX.md`](../../docs/architecture/HUB_SERVICE_TYPES_PRICING_MATRIX.md).

7. **`alter_hub_guardians_client_profile.sql`** — colunas extra em `hub_guardians` (PF/PJ, documentos, morada, `client_status`). Executar depois de `create_hub_guardians.sql`.

8. **`create_hub_inventory.sql`** — `hub_suppliers`, `hub_manufacturers`, `hub_inventory_items`, `hub_inventory_lots`, `hub_stock_movements`; índices únicos parciais EAN e SKU por clínica.

9. **`create_hub_staff.sql`** — `hub_staff_members` (cadastro de equipe, CRMV, agenda, acesso Hub opcional) + `hub_staff_service_types` (N:N com `hub_service_types`). Executar depois de `create_hub_service_types.sql` e com `units` / `clinic_users` existentes.

10. **`alter_hub_staff_birth_date.sql`** — coluna opcional `birth_date` em `hub_staff_members`. Executar em bases criadas antes desta coluna existir em `create_hub_staff.sql`.

11. **`create_hub_staff_photos_bucket.sql`** — bucket Storage `hub-staff-photos` (upload de foto via `POST /api/hub/staff/photo`). Executar no projeto Supabase onde corre o Hub.

12. **`create_hub_appointments.sql`** — `hub_appointments` (agenda: horários, staff opcional, tipo de serviço, pet/tutor, `appointment_kind` para hotel/L&T) + `hub_agenda_calendar_blocks` (feriados/fechamentos na vista mês). Executar depois de `create_hub_staff.sql`, `create_hub_pets_and_pet_guardians.sql` e `create_hub_service_types.sql`.

13. **`alter_hub_appointments_multi_service_and_recurrence.sql`** — Suporte a múltiplos serviços por agendamento e recorrência: cria `hub_appointment_series` (regras de recorrência) e `hub_appointment_services` (N:M serviço↔agendamento); adiciona colunas `title`, `description`, `series_id`, `series_occurrence_date` em `hub_appointments`. Executar depois de `create_hub_appointments.sql`.

Documentação geral: [`../README.md`](../README.md).
