-- PetMi Hub — planos pagos do lançamento + vínculo com assinatura Mercado Pago.
-- Executar depois de 082_create_hub_platform_subscriptions.sql.
-- Preços iniciais (ajuste aqui antes de cobrar de verdade):
--   Essencial R$ 149, Expansão R$ 297, Rede R$ 497.
-- Todos os módulos operacionais entram no plano. A diferença é o porte.

ALTER TABLE public.clinic_hub_subscriptions
  DROP CONSTRAINT IF EXISTS clinic_hub_subscriptions_status_check;

ALTER TABLE public.clinic_hub_subscriptions
  ADD CONSTRAINT clinic_hub_subscriptions_status_check
  CHECK (status IN ('beta', 'trialing', 'active', 'past_due', 'canceled', 'pending_payment'));

ALTER TABLE public.clinic_hub_subscriptions
  ADD COLUMN IF NOT EXISTS mp_preapproval_id text,
  ADD COLUMN IF NOT EXISTS pending_plan_id uuid REFERENCES public.hub_platform_plans(id),
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_hub_subscriptions_mp_preapproval
  ON public.clinic_hub_subscriptions (mp_preapproval_id)
  WHERE mp_preapproval_id IS NOT NULL;

COMMENT ON COLUMN public.clinic_hub_subscriptions.mp_preapproval_id IS
  'Assinatura (preapproval) criada no Mercado Pago para a mensalidade.';
COMMENT ON COLUMN public.clinic_hub_subscriptions.pending_plan_id IS
  'Plano escolhido na tela, aplicado quando o Mercado Pago autorizar. Não troca o plano atual antes disso.';
COMMENT ON COLUMN public.clinic_hub_subscriptions.current_period_end IS
  'Fim do período já pago / próxima cobrança informada pelo Mercado Pago.';

UPDATE public.hub_platform_plans SET
  name = 'Essencial',
  description = 'Uma unidade e equipe de até 5 pessoas. Clínica, banho e tosa, hotel e creche e leva e traz inclusos.',
  monthly_price_cents = 14900,
  is_public = true,
  active = true,
  updated_at = now()
WHERE slug = 'solo';

UPDATE public.hub_platform_plans SET
  name = 'Expansão',
  description = 'Até 3 unidades e 20 pessoas na equipe. A mesma operação, para quem já tem filial.',
  monthly_price_cents = 29700,
  is_public = true,
  active = true,
  updated_at = now()
WHERE slug = 'growth';

UPDATE public.hub_platform_plans SET
  name = 'Rede',
  description = 'Várias unidades, sem limite de equipe. Operação completa do Hub.',
  monthly_price_cents = 49700,
  is_public = true,
  active = true,
  updated_at = now()
WHERE slug = 'network';

NOTIFY pgrst, 'reload schema';
