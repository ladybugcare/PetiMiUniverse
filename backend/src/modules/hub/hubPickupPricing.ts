import { roundMoney2 } from './hubServiceTypesPricingMatrix';

export type PickupPriceScope = 'round_trip' | 'per_leg';

/** Reparte um total comercial em duas linhas com soma exacta. */
export function splitMoneyTotalAcrossTwoLegs(total: number): [number, number] {
  const a = roundMoney2(total / 2);
  const b = roundMoney2(total - a);
  return [a, b];
}

export function normalizePickupPriceScope(raw: unknown): PickupPriceScope {
  return String(raw ?? '').trim() === 'per_leg' ? 'per_leg' : 'round_trip';
}

export type PickupLegAmounts = {
  /** Valor de venda por perna na ordem [primeira, segunda?]. */
  saleLegs: number[];
  costLegs: number[];
  totalSale: number;
  totalCost: number;
};

/**
 * Resolve valores cobrados por perna a partir do valor cadastrado (catálogo).
 * - round_trip: catálogo = ida+volta → cada perna = metade; 1 perna = metade.
 * - per_leg: catálogo = uma perna → cada perna = catálogo; ida+volta = 2×.
 */
export function resolvePickupLegAmounts(
  catalogSale: number,
  catalogCost: number,
  scope: PickupPriceScope,
  legCount: 1 | 2,
): PickupLegAmounts {
  const sale = roundMoney2(Number(catalogSale) || 0);
  const cost = roundMoney2(Number(catalogCost) || 0);

  if (scope === 'per_leg') {
    const saleLegs = legCount === 2 ? [sale, sale] : [sale];
    const costLegs = legCount === 2 ? [cost, cost] : [cost];
    return {
      saleLegs,
      costLegs,
      totalSale: roundMoney2(sale * legCount),
      totalCost: roundMoney2(cost * legCount),
    };
  }

  // round_trip
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

  const halfSale = roundMoney2(sale / 2);
  const halfCost = roundMoney2(cost / 2);
  return {
    saleLegs: [halfSale],
    costLegs: [halfCost],
    totalSale: halfSale,
    totalCost: halfCost,
  };
}
