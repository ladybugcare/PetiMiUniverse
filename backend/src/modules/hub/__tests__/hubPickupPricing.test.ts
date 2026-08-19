import {
  normalizePickupPriceScope,
  resolvePickupLegAmounts,
  splitMoneyTotalAcrossTwoLegs,
} from '../hubPickupPricing';

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
