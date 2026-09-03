# Preços especiais (pet / tutor / plano família)

Acordos comerciais permanentes que sobrescrevem o catálogo na resolução de preço da agenda e no snapshot da comanda.

## Escopos

| Escopo | Uso |
|--------|-----|
| `pet` | Valor fixo para um pet × serviço (ex.: Simba creche R$ 50) |
| `guardian` | Mesmo valor para todos os pets do tutor naquele serviço |
| `family_plan` | Valor **total** do grupo; rateio igualitário por pet membro |

Prioridade na resolução: **pet > plano família (se o pet for membro) > tutor > catálogo/matriz**.

## Aprovação

- Quem tem `hub.financial.write` (CADMIN, CFINANCE, etc.) cria já **ativo**.
- Recepção (`hub.appointments.write` sem financial.write) cria como `pending_approval`.
- `POST /api/hub/special-prices/:id/approve` exige `hub.financial.write`.

## Reajuste de catálogo

Ao alterar `sale_amount` (ou referência da matriz) do tipo de serviço:

- Se `auto_track_catalog = true`: o especial sobe/desce pelo **mesmo delta em R$**.
- Senão: marca `needs_catalog_review` (aviso; não sobe sozinho).

## API

- `GET /api/hub/special-prices`
- `GET /api/hub/special-prices/resolve`
- `POST /api/hub/special-prices`
- `PATCH /api/hub/special-prices/:id`
- `POST /api/hub/special-prices/:id/approve`

Na criação de agendamento, cada linha de `services` aceita:

- `sale_amount_override`
- `persist_special_price` + `persist_special_scope` (`pet` | `guardian`)

## Migration

`099_create_hub_special_prices.sql`
