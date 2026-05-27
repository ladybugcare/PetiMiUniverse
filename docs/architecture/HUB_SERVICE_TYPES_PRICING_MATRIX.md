# PetMi Hub — Matriz de precificação de tipos de serviço (`pricing_matrix`)

**Tabela:** `public.hub_service_types.pricing_matrix` (JSONB, nullable).  
**Colunas de referência:** `cost_amount` e `sale_amount` (`numeric(12,2)`) permanecem obrigatórias e são **sincronizadas na API** com a matriz quando esta existe: usam o custo e a venda do **tier cuja venda é a menor** (em empate, o primeiro na lista).

O campo `service_group` é **texto** na base de dados. A API aceita o conjunto pré-definido (`banho_tosa`, `hotel`, …) ou **slugs personalizados** normalizados (minúsculas, `a-z`, `0-9`, `_`, até 64 caracteres). Grupos personalizados **não** suportam `pricing_matrix` (apenas preço único), tal como `cirurgia` e `outros`.

## Quando usar

- **NULL:** precificação simples (um custo e uma venda por linha de serviço).
- **Objeto JSON:** um único serviço com vários preços conforme categorias (porte, pelagem, período, tipo de consulta, faixa de km).

O campo `service_group` define que `kind` de matriz é permitido:

| `service_group` | `kind` obrigatório |
|-----------------|-------------------|
| `banho_tosa` | `porte`, `pelagem`, `porte_pelagem` |
| `hotel` | `porte` |
| `creche` | `periodo` |
| `clinica` | `consulta` |
| `leva_traz` | `km_banda` |
| `cirurgia`, `outros`, grupos personalizados | matriz não suportada (deve ser NULL) |

## Esquema por `kind`

### `porte`

Chaves de `porte` na matriz incluem o tier de preço **`filhote`** (opcional), além dos portes corporais do cadastro do pet no Hub: `mini`, `pequeno`, `medio`, `grande`, `gigante`. O **`filhote` não** é guardado como porte corporal do animal — só entra na resolução de preço da agenda (idade vs. configuração da clínica) e em overrides de agendamento.

```json
{
  "kind": "porte",
  "tiers": [
    { "porte": "filhote", "cost_amount": 8, "sale_amount": 28 },
    { "porte": "mini", "cost_amount": 10, "sale_amount": 35 },
    { "porte": "pequeno", "cost_amount": 12, "sale_amount": 42 }
  ]
}
```

`tiers` deve ter pelo menos um elemento; não repetir o mesmo `porte` em duas linhas.

#### Agenda e snapshots

Na criação ou alteração de agendamentos, o servidor grava por linha em `hub_appointment_services`: `pricing_porte_tier_applied`, `cost_amount_applied`, `sale_amount_applied`. O corpo do pedido pode incluir `pricing_porte_tier` ao nível do agendamento (override para todas as linhas; `null` = automático). A regra de **automático** está em [`hubPricingResolve.ts`](../../backend/src/modules/hub/hubPricingResolve.ts): idade em meses completos até à data do agendamento &lt; `pet_puppy_max_months` da clínica e existência do tier `filhote` na matriz → `filhote`; caso contrário usa o `size_tier` do pet se existir na matriz; senão fallback ao primeiro tier.

A idade máxima em meses para considerar **filhote** é configurável por clínica (`hub_clinic_settings.pet_puppy_max_months`, default 8, intervalo 1–24), exposta em `GET/PATCH /api/hub/clinic-settings`.

### `pelagem`

Usado em `banho_tosa` quando o preço varia apenas pela pelagem cadastrada no pet. Valores aceitos: `curto`, `medio`, `longo`, `duplo`, `encaracolado`, `sem_pelo`, `outro`.

```json
{
  "kind": "pelagem",
  "tiers": [
    { "coat_type": "curto", "cost_amount": 12, "sale_amount": 45 },
    { "coat_type": "longo", "cost_amount": 18, "sale_amount": 65 }
  ]
}
```

`tiers` deve ter pelo menos um elemento; não repetir a mesma `coat_type`.

### `porte_pelagem`

Usado em `banho_tosa` quando o preço depende da combinação de porte e pelagem.

```json
{
  "kind": "porte_pelagem",
  "tiers": [
    { "porte": "mini", "coat_type": "curto", "cost_amount": 10, "sale_amount": 40 },
    { "porte": "mini", "coat_type": "longo", "cost_amount": 14, "sale_amount": 55 },
    { "porte": "grande", "coat_type": "curto", "cost_amount": 22, "sale_amount": 85 }
  ]
}
```

`tiers` não pode repetir a mesma combinação `porte + coat_type`. No agendamento, se o pet não tiver pelagem preenchida e o serviço precisar dela, a UI/API exigem override manual (`pricing_coat_type`) para aquele agendamento.

### `periodo`

```json
{
  "kind": "periodo",
  "tiers": [
    { "period": "full_day", "cost_amount": 0, "sale_amount": 80 },
    { "period": "half_day", "cost_amount": 0, "sale_amount": 50 }
  ]
}
```

Valores de `period`: `full_day`, `half_day`.

### `consulta`

```json
{
  "kind": "consulta",
  "tiers": [
    { "consult_type": "padrao", "cost_amount": 20, "sale_amount": 120 },
    { "consult_type": "retorno", "cost_amount": 5, "sale_amount": 0 }
  ]
}
```

`consult_type`: `padrao`, `retorno`. Retorno gratuito: `sale_amount: 0`.

### `km_banda`

```json
{
  "kind": "km_banda",
  "tiers": [
    {
      "label": "0–5 km",
      "km_min": 0,
      "km_max": 5,
      "cost_amount": 2,
      "sale_amount": 15
    }
  ]
}
```

- `label`: texto curto (1–120 caracteres), obrigatório.
- `km_min` / `km_max`: opcionais, número ≥ 0 ou `null` (sem limite desse lado).
- Pelo menos uma linha em `tiers`.

## Validação

- Backend: [`hubServiceTypesPricingMatrix.ts`](../../backend/src/modules/hub/hubServiceTypesPricingMatrix.ts) (Zod) + `pricingMatrixKindMatchesGroup`.
- Cliente: [`hubServiceTypesPricingMatrix.ts`](../../packages/hub-ui/src/utils/hubServiceTypesPricingMatrix.ts) (validação espelhada para UX).

## Integrações (agenda)

1. Ler `service_group` e `pricing_matrix` do tipo de serviço.
2. Se `pricing_matrix` for NULL, usar `cost_amount` / `sale_amount` da linha de tipo.
3. Se `kind === 'porte'`, resolver o tier (automático ou override do agendamento) e usar os valores desse tier; persistir snapshots em `hub_appointment_services` (ver seção «Agenda e snapshots» acima).
4. Se `kind === 'pelagem'`, usar `hub_pets.coat_type` ou `pricing_coat_type` do agendamento. Se nenhum existir, devolver erro claro para seleção manual.
5. Se `kind === 'porte_pelagem'`, resolver porte e pelagem e buscar a combinação exata; `pricing_porte_tier` e `pricing_coat_type` são overrides só daquele agendamento.
6. Outros `kind` (`periodo`, `consulta`, `km_banda`): na fase atual da agenda, as linhas usam sobretudo os valores de referência do tipo quando não há contexto adicional — evoluir por dimensão em iterações futuras.

A listagem no Hub continua a mostrar intervalos mín–máx derivados dos tiers para custo e venda quando existe matriz.
