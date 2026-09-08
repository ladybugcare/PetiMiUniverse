# Serviços cobráveis em Cirurgia e Internação + preço variável

Como cirurgia e internação geram itens na **comanda do atendimento** (`hub_comandas.origin_type = 'encounter'`), sem criar origem nova de comanda.

## Âncora: um atendimento, uma comanda

```
Agenda (hub_appointments + hub_appointment_services)
        │ check-in
        ▼
hub_encounters  ◄── hub_surgeries / hub_hospitalizations
        │
        ├── hub_surgery_services
        ├── hub_hospitalization_charges
        └── diária (runtime: hospitalization_daily)
                │
                ▼
        Comanda do atendimento
```

`ensureCaseAndAdmissionEncounter` garante `hub_encounter_id` e pode gravar `hub_service_type_id` no atendimento de admissão.

## Cirurgia

| Peça | Papel |
|------|--------|
| `hub_surgeries.hub_appointment_id` | Liga ao slot da agenda (dedupe) |
| `hub_surgery_services` | Serviços do grupo `cirurgia` cobráveis |
| `origin_type: surgery_service` | Item na comanda (só `billing_mode = charge` e `price_status = confirmed`) |

**Dedupe:** se a linha da cirurgia aponta `hub_appointment_service_id` e a comanda já tem aquele `appointment_service`, não duplica o valor.

**Agenda → ficha:** `hubSurgeryFromAppointment.ts` espelha o slot na ficha cirúrgica sempre que o agendamento é criado, editado, cancelado ou excluído com serviço do grupo `cirurgia`. As linhas nascem já adotando o `appointment_service` correspondente (`price_status: confirmed`), então o slot continua sendo a única fonte de cobrança até o vet acrescentar itens na ficha. Ao abrir o atendimento pelo slot, a ficha herda `hub_encounter_id` e `hub_case_id`.

## Internação

| Peça | Papel |
|------|--------|
| `daily_hub_service_type_id` / `daily_unit_amount` | Serviço de diária na admissão |
| `daily_includes_medication` | Padrão “incluso” vs “cobrar” para lançamentos |
| `hub_hospitalization_charges` | Extras (medicação, material, procedimento…) |
| `origin_type: hospitalization_daily` | Um item com `quantity` = nº de diárias |
| `origin_type: hospitalization_charge` | Extras com `billing_mode = charge` confirmados |

`buildHospitalizationDailyItems` (`hubHospitalizationBilling.ts`) calcula diárias entre `admitted_at` e `discharged_at` (ou hoje se ativa). Recalcula enquanto ativa; congela na alta.

**Incluso vs cobrado:** `billing_mode = included` aparece no clínico/histórico e pode baixar estoque, mas **não** vira linha de comanda.

## Preço variável no catálogo

Migration `108`: em `hub_service_types`:

- `price_mode`: `fixed` \| `variable`
- `price_min` / `price_max` (opcionais)

Cadastro: quem tem `hub.service_types.write` (passo Precificação).

Na hora de cobrar (cirurgia / charge de internação):

| Condição | `price_status` |
|----------|----------------|
| Usuário com `hub.financial.write` | `confirmed` |
| `variable` e valor **dentro** da faixa | `confirmed` |
| `variable` fora da faixa **ou** sem faixa | `pending_approval` |
| `fixed` com valor ≠ catálogo | `pending_approval` |

Aprovação: `POST .../approve-price` exige `hub.financial.write`. Até aprovar, o item **não** entra no total da comanda; a UI lista em `pending_price_approvals` no detalhe da comanda.

Espírito alinhado a [HUB_SPECIAL_PRICES.md](./HUB_SPECIAL_PRICES.md).

## Comanda (edição de valor)

- Serviços com `price_mode = fixed`: `unit_amount` **somente leitura** na UI da comanda.
- Alterações de valor/quantidade/desconto em item existente geram `hub_comanda_events` com `event_type: item_updated` e `edit_context` (`caixa` \| `financeiro`).

## Permissão pré-requisito

Área operacional `clinica` e role `CVET_INTERNAL` precisam de `hub.service_types.read` para listar o catálogo nos formulários clínicos.

## Migrations

- `107_alter_clinical_modules_billable_services.sql`
- `108_alter_hub_service_types_variable_price.sql`

## APIs principais

- `POST|PATCH|DELETE /api/hub/clinical/surgeries/:id/services`
- `POST .../services/:serviceId/approve-price`
- `POST|PATCH|DELETE /api/hub/clinical/hospitalizations/:id/charges`
- `POST .../charges/:chargeId/approve-price`

## Fora de escopo

- `encounter_type` dedicado `cirurgia` / `internacao`
- Materiais de cirurgia como FK de estoque (hoje JSONB)
- Matriz de preço por porte só para cirurgia (usar `price_mode = variable`)
