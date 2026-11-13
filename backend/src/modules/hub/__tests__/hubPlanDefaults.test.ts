import {
  defaultModulesForPlanSlug,
  mergePaidLaunchCatalog,
  parsePlanConfig,
  PLAN_CONFIG_BY_SLUG,
} from '../hubPlanDefaults.js';
import { computeAccessMode, chargeAmountCents } from '../hubSubscriptionService.js';
import type { ClinicHubSubscriptionRow } from '../hubSubscriptionService.js';

describe('hubPlanDefaults', () => {
  it('Vet Solo só libera hub_core e clinic', () => {
    expect(defaultModulesForPlanSlug('vet_solo').sort()).toEqual(['clinic', 'hub_core']);
    expect(PLAN_CONFIG_BY_SLUG.vet_solo.disabled_operational_areas).toEqual(
      expect.arrayContaining(['banho_tosa', 'hotel_creche', 'leva_traz', 'recepcao']),
    );
  });

  it('Essencial inclui todos os módulos', () => {
    const mods = defaultModulesForPlanSlug('solo');
    expect(mods).toEqual(expect.arrayContaining(['hub_core', 'clinic', 'grooming', 'boarding']));
  });

  it('parsePlanConfig usa fallback quando raw vazio', () => {
    const cfg = parsePlanConfig('vet_solo', {});
    expect(cfg.locked_modules).toBe(true);
    expect(cfg.default_modules).toContain('clinic');
  });

  it('mergePaidLaunchCatalog inclui Vet Solo e corrige Rede ilimitada', () => {
    const merged = mergePaidLaunchCatalog([
      {
        slug: 'solo',
        name: 'Essencial',
        description: null,
        max_units: 1,
        max_users: 5,
        monthly_price_cents: 14900,
        sort_order: 10,
      },
      {
        slug: 'network',
        name: 'Rede',
        description: null,
        max_units: null,
        max_users: null,
        monthly_price_cents: 49700,
        sort_order: 30,
      },
    ]);
    expect(merged.map((p) => p.slug)).toEqual(['vet_solo', 'solo', 'growth', 'network']);
    expect(merged.find((p) => p.slug === 'vet_solo')?.monthly_price_cents).toBe(6900);
    expect(merged.find((p) => p.slug === 'network')?.max_units).toBe(10);
    expect(merged.find((p) => p.slug === 'network')?.max_users).toBe(50);
  });
});

describe('chargeAmountCents', () => {
  it('usa override quando definido', () => {
    expect(chargeAmountCents(14900, 9900)).toBe(9900);
    expect(chargeAmountCents(14900, null)).toBe(14900);
    expect(chargeAmountCents(14900, 0)).toBe(0);
  });
});

describe('computeAccessMode', () => {
  const base = {
    id: '1',
    clinic_id: 'c',
    base_plan_id: 'p',
    enabled_modules: ['hub_core'],
    beta_discount_percent: null,
    override_monthly_cents: null,
    beta_notes: null,
    beta_free_until: null,
    started_at: new Date().toISOString(),
    canceled_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as ClinicHubSubscriptionRow;

  it('beta e active são full', () => {
    expect(computeAccessMode({ ...base, status: 'beta', is_beta: true })).toBe('full');
    expect(computeAccessMode({ ...base, status: 'active', is_beta: false })).toBe('full');
  });

  it('pending_payment é soft_lock', () => {
    expect(computeAccessMode({ ...base, status: 'pending_payment', is_beta: false })).toBe(
      'soft_lock',
    );
  });

  it('canceled é read_history', () => {
    expect(computeAccessMode({ ...base, status: 'canceled', is_beta: false })).toBe('read_history');
  });
});
