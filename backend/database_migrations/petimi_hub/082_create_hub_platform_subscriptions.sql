-- PetMi Hub — assinatura SaaS da plataforma (plano base + módulos + beta).
-- Pré-requisitos: clinics, moddatetime (opcional).
-- Distinto de hub_packages / hub_subscriptions (billing cliente final).

CREATE TABLE IF NOT EXISTS public.hub_platform_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  max_units integer CHECK (max_units IS NULL OR max_units > 0),
  max_users integer CHECK (max_users IS NULL OR max_users > 0),
  monthly_price_cents integer CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0),
  is_public boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_platform_plans_slug_unique UNIQUE (slug)
);

COMMENT ON TABLE public.hub_platform_plans IS
  'Catálogo de planos base SaaS do Hub (capacidade: unidades/usuários).';

CREATE TABLE IF NOT EXISTS public.hub_platform_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  monthly_price_cents integer CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0),
  maps_to_entitlement text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_platform_modules_slug_unique UNIQUE (slug)
);

COMMENT ON TABLE public.hub_platform_modules IS
  'Módulos operacionais contratáveis (clinic, grooming, boarding) + hub_core.';

CREATE TABLE IF NOT EXISTS public.clinic_hub_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  base_plan_id uuid NOT NULL REFERENCES public.hub_platform_plans(id),
  status text NOT NULL DEFAULT 'beta'
    CHECK (status IN ('beta', 'trialing', 'active', 'past_due', 'canceled')),
  is_beta boolean NOT NULL DEFAULT false,
  beta_free_until timestamptz,
  beta_discount_percent smallint CHECK (
    beta_discount_percent IS NULL
    OR (beta_discount_percent >= 0 AND beta_discount_percent <= 100)
  ),
  override_monthly_cents integer CHECK (override_monthly_cents IS NULL OR override_monthly_cents >= 0),
  beta_notes text,
  enabled_modules text[] NOT NULL DEFAULT ARRAY['hub_core']::text[],
  started_at timestamptz NOT NULL DEFAULT now(),
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_hub_subscriptions_clinic_unique UNIQUE (clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_clinic_hub_subscriptions_status
  ON public.clinic_hub_subscriptions (status);

CREATE INDEX IF NOT EXISTS idx_clinic_hub_subscriptions_is_beta
  ON public.clinic_hub_subscriptions (is_beta)
  WHERE is_beta = true;

COMMENT ON TABLE public.clinic_hub_subscriptions IS
  'Assinatura SaaS ativa por clínica (Hub). Beta gerenciado pelo admin da plataforma.';

COMMENT ON COLUMN public.clinic_hub_subscriptions.beta_free_until IS
  'NULL = grátis até o admin encerrar o beta; data = grátis até essa data.';

COMMENT ON COLUMN public.clinic_hub_subscriptions.enabled_modules IS
  'Slugs de hub_platform_modules ativos (ex.: hub_core, clinic, grooming, boarding).';

-- Seeds: planos (UUIDs fixos para referência estável)
INSERT INTO public.hub_platform_plans (
  id, slug, name, description, max_units, max_users, monthly_price_cents, is_public, sort_order, active
) VALUES
  (
    'a1000000-0000-4000-8000-000000000001',
    'beta',
    'Programa Beta',
    'Acesso completo durante o pré-MVP. Grátis, sem cartão.',
    NULL,
    NULL,
    0,
    true,
    0,
    true
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'solo',
    'Solo',
    '1 unidade, time pequeno. Ativo após o MVP.',
    1,
    5,
    NULL,
    false,
    10,
    false
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'growth',
    'Crescimento',
    'Até 3 unidades. Ativo após o MVP.',
    3,
    20,
    NULL,
    false,
    20,
    false
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'network',
    'Rede',
    'Várias unidades. Ativo após o MVP.',
    NULL,
    NULL,
    NULL,
    false,
    30,
    false
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  max_units = EXCLUDED.max_units,
  max_users = EXCLUDED.max_users,
  is_public = EXCLUDED.is_public,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  updated_at = now();

INSERT INTO public.hub_platform_modules (
  id, slug, name, description, monthly_price_cents, maps_to_entitlement, sort_order, active
) VALUES
  (
    'b1000000-0000-4000-8000-000000000001',
    'hub_core',
    'Hub Core',
    'Agenda, tutores, pets, caixa e financeiro simples.',
    0,
    'module.hub_core',
    0,
    true
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'clinic',
    'Clínica',
    'Consultório, prontuário e prescrição.',
    NULL,
    'module.clinic',
    10,
    true
  ),
  (
    'b1000000-0000-4000-8000-000000000003',
    'grooming',
    'Banho & Tosa',
    'Fila e operação de banho e tosa.',
    NULL,
    'module.grooming',
    20,
    true
  ),
  (
    'b1000000-0000-4000-8000-000000000004',
    'boarding',
    'Hotel & Creche',
    'Reservas e operação de hotel/creche.',
    NULL,
    'module.boarding',
    30,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  maps_to_entitlement = EXCLUDED.maps_to_entitlement,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  updated_at = now();

-- Backfill: clínicas sem assinatura recebem Beta com todos os módulos
INSERT INTO public.clinic_hub_subscriptions (
  clinic_id,
  base_plan_id,
  status,
  is_beta,
  beta_notes,
  enabled_modules,
  started_at
)
SELECT
  c.id,
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'beta',
  true,
  'Backfill pré-MVP',
  ARRAY['hub_core', 'clinic', 'grooming', 'boarding']::text[],
  COALESCE(c.created_at, now())
FROM public.clinics c
WHERE NOT EXISTS (
    SELECT 1 FROM public.clinic_hub_subscriptions s WHERE s.clinic_id = c.id
  );

NOTIFY pgrst, 'reload schema';
