import {
  normalizePickupPriceScope,
  resolvePickupLegAmounts,
  shouldAttachPickupInMultipetBatch,
  shouldRewriteAppointmentServicesOnPatch,
  splitMoneyTotalAcrossTwoLegs,
} from '../hubPickupPricing';
import { resolveServiceLinePricing } from '../hubPricingResolve';

describe('hubPickupPricing', () => {
  test('splitMoneyTotalAcrossTwoLegs soma exacta', () => {
    expect(splitMoneyTotalAcrossTwoLegs(100)).toEqual([50, 50]);
    expect(splitMoneyTotalAcrossTwoLegs(99.99)).toEqual([50, 49.99]);
  });

  test('normalizePickupPriceScope', () => {
    expect(normalizePickupPriceScope('per_leg')).toBe('per_leg');
    expect(normalizePickupPriceScope('round_trip')).toBe('round_trip');
    expect(normalizePickupPriceScope(null)).toBe('round_trip');
    expect(normalizePickupPriceScope('')).toBe('round_trip');
  });

  test('round_trip + 2 pernas = catálogo total', () => {
    const r = resolvePickupLegAmounts(100, 40, 'round_trip', 2);
    expect(r.saleLegs).toEqual([50, 50]);
    expect(r.costLegs).toEqual([20, 20]);
    expect(r.totalSale).toBe(100);
    expect(r.totalCost).toBe(40);
  });

  test('round_trip + 1 perna = metade', () => {
    const r = resolvePickupLegAmounts(100, 40, 'round_trip', 1);
    expect(r.saleLegs).toEqual([50]);
    expect(r.totalSale).toBe(50);
  });

  test('per_leg + 2 pernas = 2× catálogo', () => {
    const r = resolvePickupLegAmounts(35, 10, 'per_leg', 2);
    expect(r.saleLegs).toEqual([35, 35]);
    expect(r.totalSale).toBe(70);
    expect(r.totalCost).toBe(20);
  });

  test('per_leg + 1 perna = catálogo', () => {
    const r = resolvePickupLegAmounts(35, 10, 'per_leg', 1);
    expect(r.saleLegs).toEqual([35]);
    expect(r.totalSale).toBe(35);
  });
});

describe('shouldAttachPickupInMultipetBatch', () => {
  test('sem L&T compartilhado → nenhum pet', () => {
    const claimed = new Set<string>();
    expect(
      shouldAttachPickupInMultipetBatch({
        billing: 'per_visit',
        sharedHasPickup: false,
        dayKey: '2026-07-10',
        claimedDays: claimed,
      }),
    ).toBe(false);
  });

  test('per_visit mesmo dia → só o primeiro pet', () => {
    const claimed = new Set<string>();
    expect(
      shouldAttachPickupInMultipetBatch({
        billing: 'per_visit',
        sharedHasPickup: true,
        dayKey: '2026-07-10',
        claimedDays: claimed,
      }),
    ).toBe(true);
    expect(
      shouldAttachPickupInMultipetBatch({
        billing: 'per_visit',
        sharedHasPickup: true,
        dayKey: '2026-07-10',
        claimedDays: claimed,
      }),
    ).toBe(false);
  });

  test('per_visit dias diferentes → um L&T por dia (cada pet)', () => {
    const claimed = new Set<string>();
    expect(
      shouldAttachPickupInMultipetBatch({
        billing: 'per_visit',
        sharedHasPickup: true,
        dayKey: '2026-07-10',
        claimedDays: claimed,
      }),
    ).toBe(true);
    expect(
      shouldAttachPickupInMultipetBatch({
        billing: 'per_visit',
        sharedHasPickup: true,
        dayKey: '2026-07-11',
        claimedDays: claimed,
      }),
    ).toBe(true);
  });

  test('per_pet → todos os pets no mesmo dia', () => {
    const claimed = new Set<string>();
    expect(
      shouldAttachPickupInMultipetBatch({
        billing: 'per_pet',
        sharedHasPickup: true,
        dayKey: '2026-07-10',
        claimedDays: claimed,
      }),
    ).toBe(true);
    expect(
      shouldAttachPickupInMultipetBatch({
        billing: 'per_pet',
        sharedHasPickup: true,
        dayKey: '2026-07-10',
        claimedDays: claimed,
      }),
    ).toBe(true);
    expect(claimed.size).toBe(0);
  });
});

describe('shouldRewriteAppointmentServicesOnPatch', () => {
  test('pula pernas de L&T', () => {
    expect(shouldRewriteAppointmentServicesOnPatch('pickup_route')).toBe(false);
    expect(shouldRewriteAppointmentServicesOnPatch('standard')).toBe(true);
    expect(shouldRewriteAppointmentServicesOnPatch(null)).toBe(true);
  });
});

describe('bloco extra L&T usa matriz km_banda (não sale_amount cru)', () => {
  test('resolveServiceLinePricing com km_tier_index usa a faixa', () => {
    const serviceType = {
      id: 'lt-1',
      service_group: 'leva_traz',
      cost_amount: 10,
      sale_amount: 10,
      pricing_matrix: {
        kind: 'km_banda' as const,
        tiers: [
          { label: 'até 5 km', km_min: 0, km_max: 5, cost_amount: 15, sale_amount: 40 },
          { label: '5–10 km', km_min: 5, km_max: 10, cost_amount: 25, sale_amount: 60 },
        ],
      },
    };
    const pet = {
      size_tier: 'medio',
      coat_type: null,
      birth_date: null,
    };
    const priced = resolveServiceLinePricing({
      serviceType,
      pet,
      appointmentDateYmd: '2026-07-10',
      puppyMaxMonths: 8,
      overrideTier: null,
      overrideCoatType: null,
      pricing_variant: { km_tier_index: 0 },
    });
    expect(priced.sale).toBe(40);
    expect(priced.cost).toBe(15);
    expect(priced.pricing_variant).toEqual({ km_tier_index: 0 });

    const legs = resolvePickupLegAmounts(priced.sale, priced.cost, 'round_trip', 2);
    expect(legs.totalSale).toBe(40);
    expect(legs.saleLegs).toEqual([20, 20]);
  });
});
