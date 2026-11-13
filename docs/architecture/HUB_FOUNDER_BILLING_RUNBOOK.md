# Runbook — Parceiros Fundadores e cobrança Hub

## Princípios

1. **Nunca** iniciar cobrança Mercado Pago automaticamente ao expirar `beta_free_until`.
2. Preço especial de fundador = **`override_monthly_cents`** (centavos/mês).
3. **`beta_discount_percent`** é legado: permanece no admin para histórico, **não** entra no cálculo do checkout.
4. Comunicação comercial e aceite do CADMIN vêm **antes** do checkout.

## Campos em `clinic_hub_subscriptions`

| Campo | Uso |
|-------|-----|
| `is_beta` / `status=beta` | Acesso Fundador/Beta; sem teto de porte |
| `beta_free_until` | Fim do período gratuito (comunicar antes) |
| `override_monthly_cents` | Valor cobrado no MP quando houver checkout |
| `beta_notes` | Registro da oferta (ex.: “Fundador R$ 99 até 2026-12”) |

## Fluxo operacional

1. Admin em `/admin` → clínica → **Gerenciar Fundador**.
2. Definir `beta_free_until` e, se aplicável, `override_monthly_cents`.
3. Registrar a oferta em `beta_notes`.
4. Contato comercial comunica a condição e o prazo.
5. Após o prazo (ou quando o cliente escolher): CADMIN acessa `/hub/assinatura` e inicia checkout.
6. O charge usa `chargeAmountCents(preço_plano, override_monthly_cents)`.

## Go-live do catálogo pago

1. Rodar migration `140_alter_hub_platform_plans_vet_solo_config.sql`.
2. Confirmar enforcement (limites + módulos) em staging.
3. Definir `HUB_SUBSCRIPTION_MODE=catalog` no backend (só depois das Fases 2–3 estáveis).
4. Manter clínicas `is_beta=true` sem cobrança até conversão manual.

## Soft-lock / inadimplência

| Status | Comportamento |
|--------|----------------|
| `pending_payment` | Soft-lock; banner; sem novos users/units |
| `past_due` | Graça `HUB_PAST_DUE_GRACE_DAYS` (default 7) depois `read_history` |
| `canceled` | Históricos; reativação via checkout |

Variável opcional: `HUB_PAST_DUE_GRACE_DAYS=7`.
