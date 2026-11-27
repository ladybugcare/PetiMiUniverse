import { roundMoney2 } from './hubServiceTypesPricingMatrix';

export type PickupPriceScope = 'round_trip' | 'per_leg';

/** Preferência da clínica para L&T em lote multi-pet. */
export type MultipetPickupBilling = 'per_visit' | 'per_pet';

/**
 * Decide se este pet do lote deve receber pernas de L&T.
 * Em `per_visit`, só o primeiro pet de cada dia de calendário (YYYY-MM-DD) leva o transporte;
 * dias distintos no mesmo lote naturalmente cobram por pet.
 */
export function shouldAttachPickupInMultipetBatch(opts: {
  billing: MultipetPickupBilling;
  sharedHasPickup: boolean;
  dayKey: string;
  claimedDays: Set<string>;
}): boolean {
  const { billing, sharedHasPickup, dayKey, claimedDays } = opts;
  if (!sharedHasPickup) return false;
  if (billing === 'per_pet') return true;
  if (claimedDays.has(dayKey)) return false;
  claimedDays.add(dayKey);
  return true;
}

/** Edição de série não deve regravar serviços de pernas de L&T. */
export function shouldRewriteAppointmentServicesOnPatch(appointmentKind: string | null | undefined): boolean {
  return String(appointmentKind ?? '') !== 'pickup_route';
}

/** Papel do row no patch de série (future/all). */
export type SeriesPatchTargetRole = 'main' | 'extra' | 'pickup_leg';

/**
 * Classifica um alvo da série:
 * - main: ocorrência visível (banho/hotel/…) sem pai
 * - extra: bloco adicional ligado por parent_appointment_id
 * - pickup_leg: perna de Leva e Traz
 */
export function classifySeriesPatchTarget(opts: {
  appointmentKind: string | null | undefined;
  parentAppointmentId: string | null | undefined;
}): SeriesPatchTargetRole {
  if (String(opts.appointmentKind ?? '') === 'pickup_route') return 'pickup_leg';
  if (opts.parentAppointmentId) return 'extra';
  return 'main';
}

/**
 * Só o agendamento principal da ocorrência recebe a lista de serviços do formulário.
 * Pernas L&T e blocos extras mantêm as próprias linhas.
 */
export function shouldRewriteAppointmentServicesOnSeriesPatch(opts: {
  appointmentKind: string | null | undefined;
  parentAppointmentId: string | null | undefined;
}): boolean {
  return classifySeriesPatchTarget(opts) === 'main';
}

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
