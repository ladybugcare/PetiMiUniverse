import type { HubPaidPlan } from '../services/hubSubscriptionApi';

/** Espelho da matriz comercial (migration 140 / hubPlanDefaults). */
export const HUB_LAUNCH_PAID_PLANS: HubPaidPlan[] = [
  {
    slug: 'vet_solo',
    name: 'Vet Solo',
    description: 'Veterinário independente — agenda, clientes e clínica.',
    max_units: 1,
    max_users: 2,
    monthly_price_cents: 6900,
    sort_order: 5,
  },
  {
    slug: 'solo',
    name: 'Essencial',
    description: 'Uma unidade, operação completa.',
    max_units: 1,
    max_users: 5,
    monthly_price_cents: 14900,
    sort_order: 10,
  },
  {
    slug: 'growth',
    name: 'Expansão',
    description: 'Até 3 unidades e equipe maior.',
    max_units: 3,
    max_users: 20,
    monthly_price_cents: 29700,
    sort_order: 20,
  },
  {
    slug: 'network',
    name: 'Rede',
    description: 'Até 10 unidades e 50 pessoas. Maiores sob consulta.',
    max_units: 10,
    max_users: 50,
    monthly_price_cents: 49700,
    sort_order: 30,
  },
];

export const HUB_PLAN_HIGHLIGHT: Record<string, string> = {
  vet_solo: 'Clínica',
  solo: 'Operação completa',
  growth: 'Multiunidade',
  network: 'Rede',
};

/** Garante os 4 planos na vitrine mesmo se o banco ainda não tiver a migration 140. */
export function mergeLaunchPaidPlans(fromApi: HubPaidPlan[]): HubPaidPlan[] {
  const bySlug = new Map(fromApi.map((p) => [p.slug, p]));
  return HUB_LAUNCH_PAID_PLANS.map((canonical) => {
    const api = bySlug.get(canonical.slug);
    if (!api) return canonical;
    return {
      ...canonical,
      ...api,
      max_units: api.max_units ?? canonical.max_units,
      max_users: api.max_users ?? canonical.max_users,
      monthly_price_cents: api.monthly_price_cents ?? canonical.monthly_price_cents,
      name: api.name || canonical.name,
      description: api.description ?? canonical.description,
      sort_order: api.sort_order ?? canonical.sort_order,
    };
  }).sort((a, b) => a.sort_order - b.sort_order);
}

export function hubPlanUnitLine(plan: Pick<HubPaidPlan, 'slug' | 'max_units'>): string {
  if (plan.slug === 'vet_solo') return '1 área de atendimento';
  const maxUnits = plan.max_units;
  if (maxUnits == null) return 'Unidades sob consulta';
  if (maxUnits === 1) return '1 unidade';
  return `Até ${maxUnits} unidades`;
}

export function hubPlanPeopleLine(plan: Pick<HubPaidPlan, 'max_users'>): string {
  const maxUsers = plan.max_users;
  if (maxUsers == null) return 'Equipe sob consulta';
  return maxUsers === 1 ? '1 pessoa' : `Até ${maxUsers} pessoas`;
}
