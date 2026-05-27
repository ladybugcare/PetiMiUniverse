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

7. **`alter_hub_guardians_client_profile.sql`** — colunas extra em `hub_guardians` (PF/PJ, documentos, endereço, `client_status`). Executar depois de `create_hub_guardians.sql`.

8. **`create_hub_inventory.sql`** — `hub_suppliers`, `hub_manufacturers`, `hub_inventory_items`, `hub_inventory_lots`, `hub_stock_movements`; índices únicos parciais EAN e SKU por clínica.

9. **`create_hub_staff.sql`** — `hub_staff_members` (cadastro de equipe, CRMV, agenda, acesso Hub opcional) + `hub_staff_service_types` (N:N com `hub_service_types`). Executar depois de `create_hub_service_types.sql` e com `units` / `clinic_users` existentes.

10. **`alter_hub_staff_birth_date.sql`** — coluna opcional `birth_date` em `hub_staff_members`. Executar em bases criadas antes desta coluna existir em `create_hub_staff.sql`.

11. **`create_hub_staff_photos_bucket.sql`** — bucket Storage `hub-staff-photos` (upload de foto via `POST /api/hub/staff/photo`). Executar no projeto Supabase onde corre o Hub.

12. **`create_hub_appointments.sql`** — `hub_appointments` (agenda: horários, staff opcional, tipo de serviço, pet/tutor, `appointment_kind` para hotel/L&T) + `hub_agenda_calendar_blocks` (feriados/fechamentos na vista mês). Executar depois de `create_hub_staff.sql`, `create_hub_pets_and_pet_guardians.sql` e `create_hub_service_types.sql`.

13. **`alter_hub_appointments_multi_service_and_recurrence.sql`** — Suporte a múltiplos serviços por agendamento e recorrência: cria `hub_appointment_series` (regras de recorrência) e `hub_appointment_services` (N:M serviço↔agendamento); adiciona colunas `title`, `description`, `series_id`, `series_occurrence_date` em `hub_appointments`. Executar depois de `create_hub_appointments.sql`.

    **Erro «Could not find the 'description' column of 'hub_appointments'»:** a API espera estas colunas. Executar o ficheiro **13** completo *ou*, só para séries + `title`/`description`/`series_id`, o atalho idempotente **`alter_hub_appointments_ensure_series_title_description.sql`** (não cria `hub_appointment_services`; para multi-serviço continua a ser necessário o **13** completo). Depois do SQL, se o PostgREST ainda acusar coluna em falta, aguardar o reload do schema ou usar `NOTIFY pgrst, 'reload schema';` conforme o projecto.

14. **`alter_hub_pets_size_tier.sql`** — Coluna `size_tier` em `hub_pets` (porte para precificação). Backfill `medio` para legado. Executar depois de `create_hub_pets_and_pet_guardians.sql`.

15. **`alter_hub_appointment_services_pricing_snapshots.sql`** — Snapshot de custo/venda e tier por linha em `hub_appointment_services`; override `pricing_porte_tier` em `hub_appointments`. Executar depois do item 13.

16. **`create_hub_clinic_settings.sql`** — `hub_clinic_settings` (`pet_puppy_max_months`, default 8). Executar com `clinics` e `moddatetime` disponíveis.

17. **`create_hub_service_groups.sql`** — `hub_service_groups` (nome, slug, `color`, `display_order` por clínica). A cor na agenda do Hub vem do grupo quando existir linha com o mesmo `slug` que `hub_service_types.service_group`. Executar depois de `alter_hub_service_types_catalog.sql`. O backend garante automaticamente os grupos canônicos (Banho & Tosa, Hotel, Creche, Clínica, Cirurgia, Leva e Traz, Internação, Outros) na primeira listagem de serviços/grupos por `clinic_id`.

18. **`alter_hub_pets_coat_fields.sql`** — Colunas `coat_color` e `coat_type` em `hub_pets`; `coat_type` é usado por precificação de Banho & Tosa por pelagem. Executar depois do item 2 (ou em bases já com pets).

19. **`alter_hub_appointment_services_coat_pricing_snapshots.sql`** — Override `pricing_coat_type` no agendamento e snapshot `pricing_coat_type_applied` por linha. Executar depois do item 15.

    **Erro «Could not find the 'pricing_coat_type' column of 'hub_appointments'»:** executar **`alter_hub_appointments_pricing_overrides_catchup.sql`** (inclui itens 15+19 e `financial_notes`) *ou* os ficheiros 15 e 19 em sequência. Depois, se a API ainda acusar coluna em falta, aguardar o reload do schema ou correr `NOTIFY pgrst, 'reload schema';`.

20. **`alter_hub_service_groups_archived_at.sql`** — Coluna `archived_at` em `hub_service_groups` (arquivar grupo sem apagar; evita recriação automática do slug canônico). Executar depois do item 17.

21. **`create_hub_prospects_and_quotes.sql`** — `hub_prospects` (contato mínimo), `hub_quotes`, `hub_quote_pets`, `hub_quote_lines`. Executar depois de `create_hub_guardians.sql`, `create_hub_service_types.sql`, `units`. Ver [HUB_QUOTES_AND_PROSPECTS.md](../../docs/architecture/HUB_QUOTES_AND_PROSPECTS.md).

22. **`alter_hub_quotes_v2.sql`** — Orçamentos v2: desconto geral (`discount_kind`/`discount_value`), `subtotal_amount`, `client_notes`, `valid_days` configurável, `public_token`, status `awaiting_return`; campos `coat_type`/`age_months`/`sex` em `hub_quote_pets`; nova tabela `hub_quote_line_pets` (preço por linha × pet); `hub_prospects.tax_id` passa a opcional. Executar depois do item 21.

23. **`alter_hub_quote_lines_pricing_variant.sql`** — Coluna `pricing_variant` (jsonb) em `hub_quote_lines` para guardar período / tipo de consulta / faixa km escolhidos na UI. Executar depois do item 21 (ou 22).

24. **`alter_hub_appointments_financial_notes.sql`** — Coluna `financial_notes` em `hub_appointments` (já incluída no catch-up do item 19 acima se usar esse atalho).

Documentação geral: [`../README.md`](../README.md).
