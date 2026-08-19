/** Espelho leve de `backend/.../hubPickupPricing.ts` para preview na agenda. */

export type PickupPriceScope = 'round_trip' | 'per_leg';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizePickupPriceScope(raw: unknown): PickupPriceScope {
  return String(raw ?? '').trim() === 'per_leg' ? 'per_leg' : 'round_trip';
}

function splitMoneyTotalAcrossTwoLegs(total: number): [number, number] {
  const a = round2(total / 2);
  const b = round2(total - a);
  return [a, b];
}

export type PickupLegAmountsPreview = {
  saleLegs: number[];
  costLegs: number[];
  totalSale: number;
  totalCost: number;
};

export function resolvePickupLegAmounts(
  catalogSale: number,
  catalogCost: number,
  scope: PickupPriceScope,
  legCount: 1 | 2,
): PickupLegAmountsPreview {
  const sale = round2(Number(catalogSale) || 0);
  const cost = round2(Number(catalogCost) || 0);

  if (scope === 'per_leg') {
    const saleLegs = legCount === 2 ? [sale, sale] : [sale];
    const costLegs = legCount === 2 ? [cost, cost] : [cost];
    return {
      saleLegs,
      costLegs,
      totalSale: round2(sale * legCount),
      totalCost: round2(cost * legCount),
    };
  }

  if (legCount === 2) {
    const saleLegs = splitMoneyTotalAcrossTwoLegs(sale);
    const costLegs = splitMoneyTotalAcrossTwoLegs(cost);
    return {
      saleLegs: [...saleLegs],
      costLegs: [...costLegs],
      totalSale: sale,
      totalCost: cost,
    };
  }

  const halfSale = round2(sale / 2);
  const halfCost = round2(cost / 2);
  return {
    saleLegs: [halfSale],
    costLegs: [halfCost],
    totalSale: halfSale,
    totalCost: halfCost,
  };
}

export function pickupModeLegCount(
  mode: 'round_trip' | 'pickup_only' | 'delivery_only',
): 1 | 2 {
  return mode === 'round_trip' ? 2 : 1;
}
