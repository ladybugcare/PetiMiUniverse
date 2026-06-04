# PetMi Hub — Modelo financeiro (MVP e evolução)

Este documento define a **fonte da verdade** financeira operacional do Hub e o fluxo único aplicável a Banho e Tosa, Clínica, Orçamentos e módulos futuros (Hotel, Creche, etc.).

## Fluxo único (sem exceções)

```text
Finalizar operação (ou proposta aceite no caso de orçamento)
  → Revisar cobrança (UI)
  → Gerar cobrança (ação explícita)
  → hub_receivables + hub_receivable_lines
  → hub_payments (um ou vários por recebível)
```

- **Não** criar recebível em: conclusão de `hub_grooming_sessions`, `completeHubEncounter`, nem ao gravar `hub_quotes.status = accepted`.
- O estado **`paid` em `hub_appointments`**, se existir, é apenas **UX/cache** opcional após o recebível estar quitado — **nunca** substitui o ledger para relatórios.

## Entidades principais

### `hub_receivables`

Valor a receber, ligado a uma **fonte** operacional.

- `source_type`: `grooming_session` | `encounter` | `quote` | `appointment` | `manual` | (reservado: `inventory_sale`, …)
- `source_id`: UUID da fonte.
- `guardian_id` (cliente), `unit_id`, `clinic_id`.
- `original_amount`, `final_amount`, `status` (`pending` | `partially_paid` | `paid` | `cancelled` | `refunded`), `due_date`, notas.
- **Unicidade:** um recebível “ativo” por `(clinic_id, source_type, source_id)` quando `status <> cancelled` e `deleted_at` nulo.

### `hub_receivable_lines`

Linhas de detalhe (serviço, quantidade, preço) após **Gerar cobrança** — obrigatório para auditoria e rankings (“top serviços”).

### `hub_financial_adjustments`

Alterações posteriores com rastreio: `discount`, `credit`, `write_off`, `refund`, `manual_adjustment`; `amount`, `reason`, `created_by`, `created_at`.

**Convenção de montante:** documentar no código da API se valores de desconto são **positivos** que reduzem `final_amount` (recomendado para leitura humana).

### `hub_payments`

Pagamento liquidado: `receivable_id`, `amount`, `payment_method` (`pix` | `cash` | `credit_card` | `debit_card` | `transfer` | `payment_link`), parcelas, `payment_date`, `external_reference`, ligação opcional a sessão de caixa.

### `hub_expenses` (Fase 2)

Despesa operacional por unidade: `clinic_id`, `unit_id`, `amount`, `category` (supplies, services, utilities, payroll, rent, marketing, other), `description`, `expense_date`, `payment_method` opcional, notas. Usada no dashboard gerencial e no fluxo de caixa (saídas).

### Caixa (`hub_cash_sessions`, `hub_cash_movements`)

Sessão por unidade; movimentos `withdrawal` (sangria), `deposit` (suprimento), etc.

## Atendimentos sem cobrança

Episódios **concluídos na operação** sem recebível ativo e sem **waive** de faturação.

**Fontes MVP:**

| Fonte | Critério “concluído” |
|--------|----------------------|
| Banho e Tosa | `hub_grooming_sessions.grooming_stage = closed` |
| Clínica | `hub_encounters.status = completed` |
| Orçamento | `hub_quotes.status = accepted` e faturação ainda em `awaiting_billing` |

**Saída da lista:**

1. Foi criado `hub_receivables` para a fonte, **ou**
2. **Waive:** `billing_waived_at` + `billing_waive_reason` obrigatório na fonte (`hub_grooming_sessions`, `hub_encounters`, `hub_quotes`).

## Orçamentos — faturação pós-aceite

- **`accepted`:** o cliente aceitou a proposta — **não** cria recebível.
- **`billing_state`** em `hub_quotes`: `none` | `awaiting_billing` | `receivable_created`.
- Ao concluir conversão para tutor (`accepted`), definir `billing_state = awaiting_billing` até **Gerar cobrança**.
- CTA na UI: **Gerar cobrança** (igual Grooming/Clínica).

## Payment Intent (fase futura)

Modelo alvo, **sem tabelas no MVP:**

```text
Receivable → PaymentIntent (pending | succeeded | failed | cancelled) → Payment
```

Útil para links (Mercado Pago, Stripe, Asaas, …). Primeira migração `hub_payment_intents` apenas quando existir integração.

## Comissões (fase 3)

Regras por **`hub_service_type_id`**, não por rótulos genéricos “Banho / Consulta”.

### `hub_commission_rules`

- `clinic_id`, `hub_service_type_id` — no máximo uma regra activa por par (índice único parcial com `deleted_at IS NULL`).
- `basis`: `percent_of_sale` (taxa em % sobre `line_total` da linha do recebível) ou `fixed_per_sale` (valor fixo por linha, limitado ao total da linha).
- `rate` (numeric), `active`, `notes`, `created_at` / `updated_at`, `deleted_at` (soft delete).
- A pré-visualização e relatórios futuros percorrem `hub_receivable_lines` e aplicam a regra activa cujo `hub_service_type_id` coincide com o da linha.

## Permissões (alvo)

- `hub.financial.read` — listagens, dashboard, “sem cobrança”, pré-visualização de comissões.
- `hub.financial.write` — despesas, ajustes, waive, **regras de comissão** (criar/editar/remover).
- `hub.receivables.create` — gerar cobrança (pode coincidir com `hub.financial.write` no MVP).
- `hub.cash.session` — abrir/fechar caixa, sangria/suprimento.
- `hub.cash.receive` — registar pagamento na recepção.

## Integração multi-unidade

Todas as consultas filtram por `clinic_id`; quando aplicável, por `unit_id` do contexto do utilizador.
