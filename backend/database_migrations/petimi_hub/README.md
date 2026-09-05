# PetMi Hub — SQL migrations

Migrations do **PetMi Hub** (tutores, pets, tipos de serviço por clínica). Executar no **Supabase SQL Editor** na ordem indicada.

Cada arquivo `.sql` tem **prefixo numérico** (`001_`, `009a_`, `050b_`, …) igual ao número do item abaixo — no explorador de arquivos eles já aparecem na ordem de execução. Letras (`a`, `b`, …) são sub-itens do mesmo bloco (ex.: `009a` depois de `009`).

## Ordem recomendada

1. **`001_create_hub_guardians.sql`** — `hub_guardians`  
   **Pré-requisito:** função `moddatetime` (ver `petimi_vet/create_moddatetime_function.sql`).

2. **`002_create_hub_pets_and_pet_guardians.sql`** — `hub_pets` + `hub_pet_guardians`

3. **`003_create_hub_service_types.sql`** — `hub_service_types`

4. **`004_alter_hub_service_types_catalog.sql`** — colunas `service_group`, `description`, `allow_scheduling`, `agenda_color`, `internal_notes`, `code_locked`; índice único parcial `(clinic_id, code)` só para linhas não arquivadas (`deleted_at IS NULL`).

5. **`005_alter_hub_service_types_pricing.sql`** — `cost_amount`, `sale_amount` (`numeric(12,2)`, ≥ 0), valores em **BRL (R$)** na UI; margem calculada no cliente.

6. **`006_alter_hub_service_types_pricing_matrix.sql`** — `pricing_matrix` (JSONB, nullable): preços por porte, período, tipo de consulta ou faixa de km num único serviço. Ver [`docs/architecture/HUB_SERVICE_TYPES_PRICING_MATRIX.md`](../../docs/architecture/HUB_SERVICE_TYPES_PRICING_MATRIX.md).

7. **`007_alter_hub_guardians_client_profile.sql`** — colunas extra em `hub_guardians` (PF/PJ, documentos, endereço, `client_status`). Executar depois de `001_create_hub_guardians.sql`.

8. **`008_create_hub_inventory.sql`** — `hub_suppliers`, `hub_manufacturers`, `hub_inventory_items`, `hub_inventory_lots`, `hub_stock_movements`; índices únicos parciais EAN e SKU por clínica.

9. **`009_create_hub_staff.sql`** — `hub_staff_members` (cadastro de equipe, CRMV, agenda, acesso Hub opcional) + `hub_staff_service_types` (N:N com `hub_service_types`). Executar depois de `003_create_hub_service_types.sql` e com `units` / `clinic_users` existentes.

   - **`009a_alter_user_invitations_staff_member_id.sql`** — coluna `staff_member_id` em `user_invitations` para vincular convite Hub ao registro em `hub_staff_members`. Executar após `009_create_hub_staff.sql` e com `user_invitations` (petimi_vet) existente.

   - **`009b_alter_hub_staff_specialties_array.sql`** — converte `hub_staff_members.specialties` de `text` para `text[]` (IDs do catálogo `public.specialties` + nomes livres, alinhado a `vets.specialties`). Executar em bases que já tinham a coluna como `text`.

10. **`010_alter_hub_staff_birth_date.sql`** — coluna opcional `birth_date` em `hub_staff_members`. Executar em bases criadas antes desta coluna existir em `009_create_hub_staff.sql`.

11. **`011_create_hub_staff_photos_bucket.sql`** — bucket Storage `hub-staff-photos` (upload de foto via `POST /api/hub/staff/photo`). Executar no projeto Supabase onde corre o Hub.

12. **`012_create_hub_appointments.sql`** — `hub_appointments` (agenda: horários, staff opcional, tipo de serviço, pet/tutor, `appointment_kind` para hotel/L&T) + `hub_agenda_calendar_blocks` (feriados/fechamentos na vista mês). Executar depois de `009_create_hub_staff.sql`, `002_create_hub_pets_and_pet_guardians.sql` e `003_create_hub_service_types.sql`.

    - **`012a_alter_hub_appointments_clinical_kinds.sql`** — amplia `appointment_kind` com `clinical_walk_in` (encaixe clínico imediato) e `clinical_emergency` (urgência registrada na agenda no momento da abertura). Executar depois de `012_create_hub_appointments.sql` (e antes ou depois de `025f_alter_hub_encounters_hub_service_type.sql`, conforme a ordem no projeto).

    - **`012b_alter_hub_appointments_walk_in_kind.sql`** — adiciona `walk_in` (encaixe genérico para B&T, Hotel, etc. via agenda). Executar depois de `012a_alter_hub_appointments_clinical_kinds.sql`.

13. **`013_alter_hub_appointments_multi_service_and_recurrence.sql`** — Suporte a múltiplos serviços por agendamento e recorrência: cria `hub_appointment_series` (regras de recorrência) e `hub_appointment_services` (N:M serviço↔agendamento); adiciona colunas `title`, `description`, `series_id`, `series_occurrence_date` em `hub_appointments`. Executar depois de `012_create_hub_appointments.sql`.

    **Erro «Could not find the 'description' column of 'hub_appointments'»:** a API espera estas colunas. Executar o ficheiro **13** completo *ou*, só para séries + `title`/`description`/`series_id`, o atalho idempotente **`013a_alter_hub_appointments_ensure_series_title_description.sql`** (não cria `hub_appointment_services`; para multi-serviço continua a ser necessário o **13** completo). Depois do SQL, se o PostgREST ainda acusar coluna em falta, aguardar o reload do schema ou usar `NOTIFY pgrst, 'reload schema';` conforme o projecto.

14. **`014_alter_hub_pets_size_tier.sql`** — Coluna `size_tier` em `hub_pets` (porte para precificação). Backfill `medio` para legado. Executar depois de `002_create_hub_pets_and_pet_guardians.sql`.

15. **`015_alter_hub_appointment_services_pricing_snapshots.sql`** — Snapshot de custo/venda e tier por linha em `hub_appointment_services`; override `pricing_porte_tier` em `hub_appointments`. Executar depois do item 13.

16. **`016_create_hub_clinic_settings.sql`** — `hub_clinic_settings` (`pet_puppy_max_months`, default 8). Executar com `clinics` e `moddatetime` disponíveis.

17. **`017_create_hub_service_groups.sql`** — `hub_service_groups` (nome, slug, `color`, `display_order` por clínica). A cor na agenda do Hub vem do grupo quando existir linha com o mesmo `slug` que `hub_service_types.service_group`. Executar depois de `004_alter_hub_service_types_catalog.sql`. O backend garante automaticamente os grupos canônicos (Banho & Tosa, Hotel, Creche, Clínica, Cirurgia, Leva e Traz, Internação, Outros) na primeira listagem de serviços/grupos por `clinic_id`.

18. **`018_alter_hub_pets_coat_fields.sql`** — Colunas `coat_color` e `coat_type` em `hub_pets`; `coat_type` é usado por precificação de Banho & Tosa por pelagem. Executar depois do item 2 (ou em bases já com pets).

19. **`019_alter_hub_appointment_services_coat_pricing_snapshots.sql`** — Override `pricing_coat_type` no agendamento e snapshot `pricing_coat_type_applied` por linha. Executar depois do item 15.

    **Erro «Could not find the 'pricing_coat_type' column of 'hub_appointments'»:** executar **`019a_alter_hub_appointments_pricing_overrides_catchup.sql`** (inclui itens 15+19 e `financial_notes`) *ou* os ficheiros 15 e 19 em sequência. Depois, se a API ainda acusar coluna em falta, aguardar o reload do schema ou correr `NOTIFY pgrst, 'reload schema';`.

20. **`020_alter_hub_service_groups_archived_at.sql`** — Coluna `archived_at` em `hub_service_groups` (arquivar grupo sem apagar; evita recriação automática do slug canônico). Executar depois do item 17.

21. **`021_create_hub_prospects_and_quotes.sql`** — `hub_prospects` (contato mínimo), `hub_quotes`, `hub_quote_pets`, `hub_quote_lines`. Executar depois de `001_create_hub_guardians.sql`, `003_create_hub_service_types.sql`, `units`. Ver [HUB_QUOTES_AND_PROSPECTS.md](../../docs/architecture/HUB_QUOTES_AND_PROSPECTS.md).

22. **`022_alter_hub_quotes_v2.sql`** — Orçamentos v2: desconto geral (`discount_kind`/`discount_value`), `subtotal_amount`, `client_notes`, `valid_days` configurável, `public_token`, status `awaiting_return`; campos `coat_type`/`age_months`/`sex` em `hub_quote_pets`; nova tabela `hub_quote_line_pets` (preço por linha × pet); `hub_prospects.tax_id` passa a opcional. Executar depois do item 21.

23. **`023_alter_hub_quote_lines_pricing_variant.sql`** — Coluna `pricing_variant` (jsonb) em `hub_quote_lines` para guardar período / tipo de consulta / faixa km escolhidos na UI. Executar depois do item 21 (ou 22).

24. **`024_alter_hub_appointments_financial_notes.sql`** — Coluna `financial_notes` em `hub_appointments` (já incluída no catch-up do item 19 acima se usar esse atalho).

25. **Módulo Clínica** (executar nesta ordem, depois de pets, staff e appointments):
    - **`024a_create_hub_clinical_cases.sql`** — casos clínicos (`hub_clinical_cases`); pré-requisito do intake e dos atendimentos.
    - **`025a_alter_hub_appointments_intake_case.sql`** — colunas opcionais `intake_hub_case_id`, `intake_create_new_case`, `intake_new_case_title` em `hub_appointments` (fluxo «Agendar consulta de rotina» na agenda; consumidas ao abrir o atendimento pelo slot). Requer `hub_appointments` e `hub_clinical_cases`.
    - **`025b_create_hub_encounters.sql`** — atendimentos clínicos (`hub_encounters`)
    - **`025c_alter_hub_encounters_add_case.sql`** — coluna `hub_case_id` em `hub_encounters`
    - **`025d_alter_hub_encounters_case_not_null.sql`** — `hub_case_id` NOT NULL (após backfill)
    - **`025e_alter_hub_encounters_nullable_pet_emergency.sql`** — torna `pet_id` e `hub_case_id` nullable em `hub_encounters` para suportar urgências abertas sem identificação. **Obrigatório** se o ambiente já aplicou `025d_alter_hub_encounters_case_not_null.sql`. Executar depois de `025b_create_hub_encounters.sql`.
    - **`025f_alter_hub_encounters_hub_service_type.sql`** — coluna opcional `hub_service_type_id` em `hub_encounters` (denormalização; a API usa o serviço em `hub_appointments` quando o atendimento está vinculado à agenda). Executar depois de `025b_create_hub_encounters.sql` e `003_create_hub_service_types.sql` apenas se quiser essa coluna no banco.
    - **`025g_create_hub_pet_clinical_flags.sql`** — alertas por pet (alergias, cardiopata, etc.)
    - **`025h_create_hub_encounter_events.sql`** — timeline de evolução
    - **`025i_create_hub_prescriptions_vaccinations.sql`** — prescrições e vacinas
    - **`025j_create_hub_clinical_attachments.sql`** — anexos/exames (metadados; bucket `hub-clinical-files` se aplicável)

    **Erro «Could not find the table 'public.hub_clinical_attachments'»:** executar **`025j_create_hub_clinical_attachments.sql`** no SQL Editor (requer `hub_encounters` e `hub_pets` já criados). O ficheiro termina com `NOTIFY pgrst, 'reload schema';` — se o erro persistir, aguardar ~1 min ou repetir o `NOTIFY` manualmente.
    - **`025k_create_hub_hospitalizations.sql`** — leitos e internações
    - **`025l_create_hub_surgeries.sql`** — cirurgias
    - **`025m_create_hub_clinical_templates.sql`** — tabela `hub_clinical_templates` (legado; a API/UI de templates clínicos não está exposta no produto por ora — pode ignorar se a base ainda não tiver esta tabela)
    - **`025n_backfill_hub_clinical_cases.sql`** — backfill 1:1 de casos para atendimentos legados (uma vez)
    - **`025o_create_hub_prescription_documents.sql`** — documentos de receita versionados
    - **`025p_create_hub_clinical_exams.sql`** — exames clínicos
    - **`025q_alter_hub_clinical_attachments_add_exam.sql`** — vínculo anexo ↔ exame
    - **`025r_create_hub_hospitalization_events.sql`** — eventos de internação
    - **`025s_alter_hub_hospitalizations_fase7.sql`** — internação avançada (Fase 7)
    - **`025t_alter_hub_surgeries_fase8.sql`** — cirurgias avançadas (Fase 8)
    - **`025u_alter_hub_vaccination_records_fase6.sql`** — vacinas completas (Fase 6)
    - **`025v_create_hub_clinical_timeline_events.sql`** — timeline canônica de eventos clínicos
    - **`025w_create_hub_clinical_document_versions.sql`** — audit trail por snapshot versionado

26. **`026_create_hub_service_group_job_functions.sql`** — `hub_service_group_job_functions` (liga `service_group_slug` a `job_title` da equipe para sugestão na agenda) + coluna opcional `description` em `hub_service_groups`. Executar depois do item 17. O backend preenche mapeamentos padrão (Banho & Tosa → groomer, Clínica → vet/auxiliar/enfermeiro, etc.) de forma idempotente.

27. **`027_alter_hub_service_types_is_addon.sql`** — Coluna `is_addon` em `hub_service_types` (catálogo de adicionais vs serviços principais). Executar depois do item 3.

28. **`028_create_hub_service_group_addons.sql`** — Universo de adicionais por grupo (`hub_service_group_addons`). Executar depois dos itens 17 e 27.

29. **`029_create_hub_service_type_addon_availability.sql`** — Disponibilidade por serviço principal (`hub_service_type_addon_availability`). Executar depois do item 28.

30. **`030_alter_hub_appointment_services_pricing_variant.sql`** — (se ainda não aplicado) `pricing_variant` jsonb nas linhas de agendamento, incluindo `custom_tier_index` para preço personalizado. Executar depois do item 15 (e 19 se usar precificação por pelagem).

    **Erro «Could not find the 'pricing_variant' column of 'hub_appointment_services' in the schema cache»:** executar este ficheiro no SQL Editor; o script termina com `NOTIFY pgrst, 'reload schema';`. Se o erro persistir, aguardar ~1 min ou correr `NOTIFY pgrst, 'reload schema';` manualmente. O cabeçalho do agendamento pode ser criado mesmo quando a inserção das linhas falha — após aplicar a migration, volte a editar o agendamento ou crie um novo para gravar as linhas com snapshot.

31. **Módulo Banho & Tosa — Fase 2** (obrigatório para Kanban com estágios e avulso):
    - **`031_create_hub_grooming_sessions.sql`** — `hub_grooming_sessions` + `hub_grooming_events` (inclui `NOTIFY pgrst, 'reload schema'`)
    - Plano completo: [`HUB_GROOMING_OPERATIONAL_PLAN.md`](../../docs/architecture/HUB_GROOMING_OPERATIONAL_PLAN.md).

32. **Módulo Banho & Tosa — Fase 3** (drawer operacional: checklist, **adicionais** na sessão, linhas executadas, tags):
    - **`032a_alter_hub_appointment_services_executed.sql`** — `executed_at` / `executed_by_staff_id` em `hub_appointment_services`.
    - **`032b_create_hub_grooming_session_extras.sql`** — **adicionais** por sessão (tabela `hub_grooming_session_extras`; rota API `/extras`).
    - **`032c_create_hub_grooming_checklist_templates.sql`** — templates opcionais por clínica (sem linha, o backend usa checklist padrão em código).

33. **Fase 4 — UX Banho & Tosa:** **`033_alter_hub_pets_avatar_url.sql`** — coluna `avatar_url` em `hub_pets` para foto no card quando existir URL (upload dedicado de pet: ver [HUB_PET_REGISTRATION.md](../../docs/architecture/HUB_PET_REGISTRATION.md), fora do escopo mínimo da Fase 4). O day-board devolve `is_first_grooming_visit` por pet.

34. **`034_alter_hub_grooming_sessions_paused_at.sql`** — coluna `paused_at` em `hub_grooming_sessions` para pausar/retomar atendimento (`PATCH` com `paused` + eventos `pause`/`resume` no backend). Ver [HUB_GROOMING_OPERATIONAL_PLAN.md](../../docs/architecture/HUB_GROOMING_OPERATIONAL_PLAN.md) (Fase 4).

35. **`035_create_hub_financial_core.sql`** — `hub_receivables`, `hub_receivable_lines`, `hub_financial_adjustments`, `hub_payments`, `hub_cash_sessions`, `hub_cash_movements`. Ver [HUB_FINANCIAL_MODEL.md](../../docs/architecture/HUB_FINANCIAL_MODEL.md).

36. **`036_alter_hub_financial_waive_quote_billing.sql`** — `billing_waived_at` / `billing_waive_reason` em `hub_grooming_sessions` e `hub_encounters`; `billing_state` e waive em `hub_quotes`. Executar depois do item 35 e das tabelas de grooming (31) e encounters (25).

37. **`037_create_hub_expenses.sql`** — `hub_expenses` (despesas por unidade; dashboard e fluxo de caixa). Executar depois do item 35. Ver [HUB_FINANCIAL_IMPLEMENTATION_PLAN.md](../../docs/architecture/HUB_FINANCIAL_IMPLEMENTATION_PLAN.md) (Fase 2).

38. **`038_create_hub_commission_rules.sql`** — `hub_commission_rules` (comissão por `hub_service_type_id`: `percent_of_sale` ou `fixed_per_sale`; soft delete). Executar depois dos itens 3 e 35. API: `GET|POST /api/hub/finance/commission-rules`, `PATCH|DELETE …/commission-rules/:id`, `GET …/commission-preview`. Ver [HUB_FINANCIAL_MODEL.md](../../docs/architecture/HUB_FINANCIAL_MODEL.md) (comissões).

39. **`039_create_hub_comandas.sql`** + **`039a_create_hub_comanda_items.sql`** — Comandas operacionais (checkout) por origem (`appointment`, `grooming_session`, `quote`, `encounter`, …) e itens faturáveis. Executar depois do núcleo financeiro (35), pets/tutores e tabelas de origem (agenda, grooming, orçamentos, clínica).

40. **`040_alter_hub_receivables_comanda_and_unique.sql`** — Coluna `comanda_id` em `hub_receivables` e ajuste de índice único por origem (legado sem comanda). Executar depois dos itens 35 e 39.

41. **`041_alter_hub_receivable_lines_comanda.sql`** — Colunas `comanda_id`, `comanda_item_id`, `pet_id` em `hub_receivable_lines`. Executar depois do item 40.

42. **`042_alter_hub_receivable_lines_product.sql`** — Suporte a linhas de produto no recebível (se ainda não aplicado na base). Executar depois do item 35 e do inventário (8).

43. **`043_alter_hub_quote_pets_hub_pet_id.sql`** — Ligação `hub_quote_pets.hub_pet_id` após conversão de orçamento. Executar depois do item 21/22.

44. **`044_create_hub_customer_credit_movements.sql`** — Movimentos de crédito do tutor e inclusão de `customer_credit` como método de pagamento. Executar depois do item 35.

45. **`045_create_hub_packages_and_subscriptions.sql`** — Pacotes de serviços e assinaturas (`hub_packages`, saldos, `hub_subscriptions`). Executar depois de tutores e tipos de serviço.

46. **`046_alter_hub_appointments_billing_waive.sql`** — Waive de cobrança em agendamentos (se aplicável à base).

47. **`047_alter_hub_roles_groomer_finance.sql`** — Papéis/permissões (ex.: groomer, financeiro) no Hub.

48. **`048_alter_hub_appointments_checked_in_status.sql`** — Adiciona status `checked_in` (paciente chegou à recepção e aguarda na fila) ao CHECK de `hub_appointments.status`. Executar depois de `012_create_hub_appointments.sql`. Habilita a máquina de estados do fluxo de agenda operacional: `confirmed → checked_in → in_progress (encounter criado) → done`.

49. **`049_alter_hub_comandas_prepaid.sql`** — `payment_timing` em `hub_payments` (`on_checkout` | `advance`) e `financial_status` em `hub_comandas` (`open` | `awaiting_balance` | `balanced`). Executar depois dos itens 35, 39 e 44 (pagamentos/comandas/crédito).

50. **`050_alter_hub_comandas_cancellation_resolution.sql`** — Pendência e resolução financeira após cancelamento operacional com pagamento antecipado (`cancellation_*` em `hub_comandas`, fila no Caixa). Executar depois do item 49.

50b. **`050b_alter_hub_comandas_finance_handoff.sql`** — Coluna `finance_handoff_at` em `hub_comandas` (preenchida no checkout `leave_pending`; bloqueia edição no Caixa). Executar depois do item 49.

52. **Módulo Hotel & Creche — Fase 4 (capacidade por unidade)**:
    - **`052_create_hub_unit_boarding_settings.sql`** — `hub_unit_boarding_settings` (vagas hotel, cães por turno creche, horário-limite de checkout; NULL = sem limite). Executar depois do item 51.

51. **Módulo Hotel & Creche — Fases 2 e 3** (reservas, diárias e relatório diário):
    - **`051_create_hub_boarding_reservations.sql`** — `hub_boarding_reservations` (reserva/estadia por pet; índice único parcial por agendamento; `mode` hotel/daycare; `status` reserved/checked_in/checked_out/cancelled/no_show; `daily_rate_cents`; soft delete) + `hub_boarding_daily_logs` (relatório diário: alimentação, medicação, passeios, humor, notas; índice único por reserva × data).
    - Plano completo: [`HUB_BOARDING_OPERATIONAL_PLAN.md`](../../docs/architecture/HUB_BOARDING_OPERATIONAL_PLAN.md).

52. **`052a_create_hub_message_logs.sql`** — Log de tentativas de comunicação com tutores (Epic 9 — WhatsApp click-to-chat e notificações in-app). Tabela `hub_message_logs` com `channel` (`whatsapp_link` | `in_app`), `template_key`, referências a tutor/pet/staff. Não armazena conteúdo de mensagens. Executar depois de tutores e pets.

53. **`053_alter_notifications_hub_types.sql`** — Amplia o CHECK de `notifications.type` para incluir tipos Hub (`hub_pet_ready`, `hub_pet_on_the_way`) e tipos já em uso no TypeScript mas ausentes do SQL original (`demand_invite`, `invite_accepted`, `invite_rejected`, `check_in`, `report_submitted`, `report_approved`). Executar depois de `create_notifications_system.sql` (Vet).

54. **`054_alter_hub_clinic_settings_message_templates.sql`** — Adiciona coluna `message_templates jsonb NOT NULL DEFAULT '{}'` em `hub_clinic_settings`. Permite que cada clínica personalize os textos pré-preenchidos dos links WhatsApp (`pet_ready`, `pet_on_the_way`, `appointment_reminder`). Executar depois de `016_create_hub_clinic_settings.sql`.

55. **`055_create_hub_service_group_checklist_templates.sql`** — Templates de checklist operacional por grupo de serviço (`hub_service_group_checklist_templates`). Migra dados de `hub_grooming_checklist_templates` (nível clínica) para `banho_tosa`. Executar depois dos itens 17 e 32.

56. **`056_alter_hub_clinic_settings_accepted_payment_methods.sql`** — Coluna `accepted_payment_methods text[]` em `hub_clinic_settings` (formas de pagamento aceitas no checkout e registro de pagamentos; default = todos os 7 métodos). Executar depois do item 54.

57. **`057_alter_hub_boarding_reservations_billing.sql`** — Colunas `billing_waived_at` / `billing_waive_reason` em `hub_boarding_reservations`; CHECK `hub_comandas.origin_type` e `hub_receivables.source_type` passam a incluir `boarding_reservation`. Executar depois dos itens 51–52 e do núcleo financeiro (itens 35–39).

58. **`058_alter_hub_prescription_items_mvp_fields.sql`** — Campos MVP de medicamento (`presentation`, `concentration`, `quantity`, `posology`) e `administration` em `hub_prescription_items`. Executar depois do item 10 (`025i_create_hub_prescriptions_vaccinations.sql`).

59. **`059_alter_hub_prescriptions_guardian_status.sql`** — `guardian_id` e status `issued` em `hub_prescriptions`. Executar depois do item 58.

60. **`060_alter_hub_prescription_documents_validation.sql`** — Colunas de validação pública (`validation_code`, `public_token`, `snapshot`, `content_hash`, `document_status`, revogação) em `hub_prescription_documents`. Executar depois do item 59 e de `025o_create_hub_prescription_documents.sql`.

61. **`061_create_hub_prescription_document_events.sql`** — Tabela `hub_prescription_document_events` (auditoria created/viewed/pdf_downloaded/revoked). Executar depois do item 60.

62. **`062_alter_hub_clinic_settings_prescription_defaults.sql`** — Coluna `prescription_defaults jsonb` em `hub_clinic_settings` (validade padrão da receita). Executar depois do item 54.

63. **`063_alter_hub_clinical_exams_referral.sql`** — Campos de solicitação de exame (`guardian_id`, `urgency`, `clinical_indication`, `fasting_required`, `collection_instructions`, `document_status`). Executar depois de `025p_create_hub_clinical_exams.sql`.

64. **`064_create_hub_clinical_exam_order_documents.sql`** — Documentos validáveis de solicitação de exame (`EX-XXXX-XXXX`) + eventos de auditoria. Executar depois do item 63.

65. **`065_create_hub_clinical_specialist_referrals.sql`** — Encaminhamentos a especialista. Executar depois do núcleo clínico (exames/atendimentos).

66. **`066_create_hub_clinical_specialist_referral_documents.sql`** — Documentos validáveis de encaminhamento (`RF-XXXX-XXXX`) + eventos. Executar depois do item 65.

67. **`067_alter_hub_clinic_settings_exam_referral_templates.sql`** — `exam_order_defaults` e `specialist_referral_defaults` em `hub_clinic_settings`. Executar depois do item 54.

68. **`068_alter_hub_comandas_client_notes.sql`** — Coluna `client_notes` em `hub_comandas` (mensagem ao tutor no PDF/link público; distinta de `notes` interno). Executar depois do item 39.

69. **`069_alter_hub_comandas_finance_notes.sql`** — Coluna `finance_notes` em `hub_comandas` (observação interna do financeiro, separada de `notes` do caixa). Executar depois do item 39.

70. **`070_create_hub_comanda_events.sql`** — Tabela `hub_comanda_events` (timeline de itens adicionados, removidos e alterados na comanda). Executar depois do item 39.

71. **`071_alter_hub_encounters_operational_phase.sql`** — Coluna `operational_phase` em `hub_encounters` (fluxo Em exames / Retornou dos exames no consultório). Executar depois de `025b_create_hub_encounters.sql`.

82. **`082_create_hub_platform_subscriptions.sql`** — Assinatura SaaS do Hub: `hub_platform_plans`, `hub_platform_modules`, `clinic_hub_subscriptions`; seed do Programa Beta + módulos; backfill de clínicas existentes. Ver [HUB_PLATFORM_SUBSCRIPTION_PLAN.md](../../docs/architecture/HUB_PLATFORM_SUBSCRIPTION_PLAN.md).

83. **`083_alter_hub_pickup_stops_in_transit.sql`** — Adiciona status `in_transit` em `hub_pickup_stops` (pet a bordo / a caminho da clínica, exclusivo para coletas). Adiciona índice único para paradas soltas (`hub_pickup_route_id IS NULL`) por agendamento. Executar depois do item 12c.

94. **`094_alter_hub_partner_clinics_address.sql`** — Campos de endereço em clínicas parceiras (local de atendimento). Executar depois do item 93.

95. **`095_alter_hub_vaccination_records_price.sql`** — Coluna `price` em `hub_vaccination_records` (snapshot de venda para comanda). Executar depois de `025i_create_hub_prescriptions_vaccinations.sql`. Ver [`docs/onboarding/matilha-vacinacao-estoque.md`](../../docs/onboarding/matilha-vacinacao-estoque.md).

96. **`096_create_hub_report_email_schedules.sql`** — Tabela `hub_report_email_schedules` (envio semanal de relatórios por e-mail). Executar depois de `clinics` / `units`.

97. **`097_alter_hub_pets_health_profile.sql`** — Coluna `hub_pets.neutered` e tabela de auditoria `hub_pet_profile_changes` (ficha permanente de saúde/comportamento). Executar depois de `002` / `002a` (`hub_pets`) e `025g` (`hub_pet_clinical_flags`).

98. **`098_alter_hub_comandas_pet_id.sql`** — Coluna `hub_comandas.pet_id` (pet de contexto ao abrir comanda pelo perfil do pet / origem com um pet). Executar depois de `039_create_hub_comandas.sql` e `002` (`hub_pets`).

99. **`099_create_hub_special_prices.sql`** — Preços especiais por pet, tutor ou plano família (`hub_special_prices` + `hub_special_price_pets`), com aprovação e aviso de reajuste de catálogo; colunas `pricing_source` / `special_price_id` em `hub_appointment_services`. Executar depois de `003` (`hub_service_types`), `001`/`002` (tutores/pets) e `015` (`hub_appointment_services`).

100. **`100_create_hub_series_invoices.sql`** — Faturamento periódico de séries: colunas de cobrança em `hub_appointment_series`; tabelas `hub_series_invoices` + `hub_series_invoice_items`; amplia `hub_comandas.origin_type` com `series_invoice`. Executar depois de `013` e `039`.

101. **`101_alter_notifications_hub_ops_types.sql`** — Amplia `notifications_type_check` com os avisos operacionais internos do Hub (`hub_payment_due`, `hub_cancellation_pending`, `hub_stock_alert`, `hub_boarding_checkin`, `hub_boarding_checkout`), direcionados por área operacional via `hubNotifyStaff`. Executar depois do item 53.

102. **`102_create_hub_charge_bundles.sql`** — Cobrança agrupada: `hub_charge_bundles` + `hub_charge_bundle_items` (lote persistente com link/PDF públicos e histórico para baixa). Executar depois de `hub_receivables` e `hub_guardians`.

103. **`103_create_hub_prescription_lookups.sql`** — Catálogo de receita por clínica (`hub_prescription_lookups`: medication / presentation / use_route) + coluna `use_route` em `hub_prescription_items`. Independente do inventário. Executar depois de `025i` / `058`.

104. **`104_alter_hub_suppliers_manufacturers_party.sql`** — `hub_suppliers.party_name` (empresa ou pessoa que fornece) e ficha completa em `hub_manufacturers` (`party_name`, `tax_id`, `phone`, `email`, `notes`). Executar depois de `008_create_hub_inventory.sql`.
