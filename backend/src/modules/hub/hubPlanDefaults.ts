/** Módulos SaaS do Hub (catálogo `hub_platform_modules`). */
export const ALL_HUB_MODULES = ['hub_core', 'clinic', 'grooming', 'boarding'] as const;
export type HubModuleSlug = (typeof ALL_HUB_MODULES)[number];

/** Config comercial espelhada na migration 140 (`hub_platform_plans.plan_config`). */
export type HubPlanConfig = {
  default_modules: HubModuleSlug[];
  locked_modules: boolean;
  disabled_operational_areas: string[];
  unit_label: 'unidade' | 'area_atendimento';
};

const ALL = [...ALL_HUB_MODULES] as HubModuleSlug[];

const FULL_OPS: HubPlanConfig = {
  default_modules: ALL,
  locked_modules: false,
  disabled_operational_areas: [],
  unit_label: 'unidade',
};

/** Fallbacks tipados — usados se a coluna plan_config ainda não existir ou vier vazia. */
export const PLAN_CONFIG_BY_SLUG: Record<string, HubPlanConfig> = {
  beta: FULL_OPS,
  vet_solo: {
    default_modules: ['hub_core', 'clinic'],
    locked_modules: true,
    disabled_operational_areas: ['banho_tosa', 'hotel_creche', 'leva_traz', 'recepcao'],
    unit_label: 'area_atendimento',
  },
  solo: FULL_OPS,
  growth: FULL_OPS,
  network: FULL_OPS,
};

export const VET_SOLO_PLAN_SLUG = 'vet_solo';
export const VET_SOLO_PLAN_ID = 'a1000000-0000-4000-8000-000000000005';

export const PAST_DUE_GRACE_DAYS = Number(process.env.HUB_PAST_DUE_GRACE_DAYS || 7);

export function parsePlanConfig(
  slug: string | null | undefined,
  raw: unknown,
): HubPlanConfig {
  const fallback = (slug && PLAN_CONFIG_BY_SLUG[slug]) || FULL_OPS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const obj = raw as Record<string, unknown>;
  const modulesRaw = obj.default_modules;
  const areasRaw = obj.disabled_operational_areas;
  const default_modules = Array.isArray(modulesRaw)
    ? (modulesRaw.map(String).filter(Boolean) as HubModuleSlug[])
    : fallback.default_modules;
  const disabled_operational_areas = Array.isArray(areasRaw)
    ? areasRaw.map(String).filter(Boolean)
    : fallback.disabled_operational_areas;
  return {
    default_modules: default_modules.length ? default_modules : fallback.default_modules,
    locked_modules:
      typeof obj.locked_modules === 'boolean' ? obj.locked_modules : fallback.locked_modules,
    disabled_operational_areas,
    unit_label: obj.unit_label === 'area_atendimento' ? 'area_atendimento' : 'unidade',
  };
}

export function defaultModulesForPlanSlug(slug: string | null | undefined): string[] {
  const cfg = PLAN_CONFIG_BY_SLUG[slug || ''] || FULL_OPS;
  const set = new Set(cfg.default_modules.map(String));
  set.add('hub_core');
  return Array.from(set);
}

/** Catálogo comercial canônico (vitrine) — garante Vet Solo + limites Rede mesmo antes da migration 140. */
export type LaunchPaidPlanSeed = {
  slug: string;
  name: string;
  description: string;
  max_units: number;
  max_users: number;
  monthly_price_cents: number;
  sort_order: number;
};

export const LAUNCH_PAID_CATALOG: LaunchPaidPlanSeed[] = [
  {
    slug: 'vet_solo',
    name: 'Vet Solo',
    description:
      'Veterinário independente ou volante — agenda, clientes e clínica. 1 área de atendimento e até 2 usuários.',
    max_units: 1,
    max_users: 2,
    monthly_price_cents: 6900,
    sort_order: 5,
  },
  {
    slug: 'solo',
    name: 'Essencial',
    description:
      'Uma unidade e equipe de até 5 pessoas. Clínica, banho e tosa, hotel e creche e leva e traz inclusos.',
    max_units: 1,
    max_users: 5,
    monthly_price_cents: 14900,
    sort_order: 10,
  },
  {
    slug: 'growth',
    name: 'Expansão',
    description:
      'Até 3 unidades e 20 pessoas na equipe. A mesma operação completa, para quem já tem filial.',
    max_units: 3,
    max_users: 20,
    monthly_price_cents: 29700,
    sort_order: 20,
  },
  {
    slug: 'network',
    name: 'Rede',
    description: 'Até 10 unidades e 50 pessoas na equipe. Operações maiores sob consulta.',
    max_units: 10,
    max_users: 50,
    monthly_price_cents: 49700,
    sort_order: 30,
  },
];

export type MergedPaidPlan = {
  slug: string;
  name: string;
  description: string | null;
  max_units: number;
  max_users: number;
  monthly_price_cents: number;
  sort_order: number;
  plan_config?: unknown;
};

export function mergePaidLaunchCatalog(
  fromDb: Array<{
    slug: string;
    name: string;
    description: string | null;
    max_units: number | null;
    max_users: number | null;
    monthly_price_cents: number | null;
    sort_order: number;
    plan_config?: unknown;
  }>,
): MergedPaidPlan[] {
  const bySlug = new Map(fromDb.map((p) => [p.slug, p]));
  return LAUNCH_PAID_CATALOG.map((canonical) => {
    const db = bySlug.get(canonical.slug);
    if (!db) {
      return {
        slug: canonical.slug,
        name: canonical.name,
        description: canonical.description,
        max_units: canonical.max_units,
        max_users: canonical.max_users,
        monthly_price_cents: canonical.monthly_price_cents,
        sort_order: canonical.sort_order,
      };
    }
    return {
      slug: canonical.slug,
      name: db.name || canonical.name,
      description: db.description ?? canonical.description,
      max_units: db.max_units ?? canonical.max_units,
      max_users: db.max_users ?? canonical.max_users,
      monthly_price_cents: db.monthly_price_cents ?? canonical.monthly_price_cents,
      sort_order: db.sort_order ?? canonical.sort_order,
      plan_config: db.plan_config,
    };
  }).sort((a, b) => a.sort_order - b.sort_order);
}
