-- PetMi Hub — Vet Solo + plan_config + limites Rede (10 unidades / 50 usuários).
-- Executar depois de 119_alter_hub_platform_subscriptions_mercadopago.sql.
-- Não altera clinic_hub_subscriptions de clínicas beta existentes.

ALTER TABLE public.hub_platform_plans
  ADD COLUMN IF NOT EXISTS plan_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.hub_platform_plans.plan_config IS
  'Config comercial: default_modules, locked_modules, disabled_operational_areas, unit_label.';

-- Rede: sair de ilimitado para tetos sustentáveis
UPDATE public.hub_platform_plans SET
  max_units = 10,
  max_users = 50,
  description = 'Até 10 unidades e 50 pessoas na equipe. Operações maiores sob consulta.',
  updated_at = now()
WHERE slug = 'network';

-- Essencial / Expansão: plan_config com todos os módulos
UPDATE public.hub_platform_plans SET
  plan_config = jsonb_build_object(
    'default_modules', jsonb_build_array('hub_core', 'clinic', 'grooming', 'boarding'),
    'locked_modules', false,
    'disabled_operational_areas', jsonb_build_array(),
    'unit_label', 'unidade'
  ),
  updated_at = now()
WHERE slug IN ('solo', 'growth', 'network');

UPDATE public.hub_platform_plans SET
  plan_config = jsonb_build_object(
    'default_modules', jsonb_build_array('hub_core', 'clinic', 'grooming', 'boarding'),
    'locked_modules', false,
    'disabled_operational_areas', jsonb_build_array(),
    'unit_label', 'unidade'
  ),
  updated_at = now()
WHERE slug = 'beta';

-- Vet Solo (novo SKU; slug distinto de solo/Essencial)
INSERT INTO public.hub_platform_plans (
  id, slug, name, description,
  max_units, max_users, monthly_price_cents,
  is_public, sort_order, active, plan_config
) VALUES (
  'a1000000-0000-4000-8000-000000000005',
  'vet_solo',
  'Vet Solo',
  'Veterinário independente ou volante — agenda, clientes e clínica. 1 área de atendimento e até 2 usuários.',
  1,
  2,
  6900,
  true,
  5,
  true,
  jsonb_build_object(
    'default_modules', jsonb_build_array('hub_core', 'clinic'),
    'locked_modules', true,
    'disabled_operational_areas', jsonb_build_array('banho_tosa', 'hotel_creche', 'leva_traz', 'recepcao'),
    'unit_label', 'area_atendimento'
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  max_units = EXCLUDED.max_units,
  max_users = EXCLUDED.max_users,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  is_public = EXCLUDED.is_public,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  plan_config = EXCLUDED.plan_config,
  updated_at = now();

-- Descrições alinhadas à matriz comercial
UPDATE public.hub_platform_plans SET
  description = 'Uma unidade e equipe de até 5 pessoas. Clínica, banho e tosa, hotel e creche e leva e traz inclusos.',
  updated_at = now()
WHERE slug = 'solo';

UPDATE public.hub_platform_plans SET
  description = 'Até 3 unidades e 20 pessoas na equipe. A mesma operação completa, para quem já tem filial.',
  updated_at = now()
WHERE slug = 'growth';

NOTIFY pgrst, 'reload schema';
