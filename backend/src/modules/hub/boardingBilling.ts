export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export type BoardingReservationBillingInput = {
  id: string;
  mode: string;
  status?: string;
  expected_check_in?: string | null;
  expected_check_out?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  daily_rate_cents?: number | null;
  billing_waived_at?: string | null;
  deleted_at?: string | null;
};

export function resolveBoardingCheckInOut(reservation: BoardingReservationBillingInput): {
  checkIn: string | null;
  checkOut: string | null;
} {
  const checkIn = reservation.checked_in_at ?? reservation.expected_check_in ?? null;
  const checkOut = reservation.checked_out_at ?? reservation.expected_check_out ?? null;
  return { checkIn, checkOut };
}

export function computeBoardingNights(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const d1 = new Date(checkIn);
  const d2 = new Date(checkOut);
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
}

export function computeBoardingQuantity(mode: string, checkIn: string | null, checkOut: string | null): number {
  if (mode === 'hotel') {
    return Math.max(1, computeBoardingNights(checkIn, checkOut));
  }
  return 1;
}

export function computeBoardingLineAmount(dailyRateCents: number, quantity: number): {
  unitAmount: number;
  lineTotal: number;
} {
  const unitAmount = round2(dailyRateCents / 100);
  const lineTotal = round2(quantity * unitAmount);
  return { unitAmount, lineTotal };
}

export function buildBoardingDescription(mode: string, quantity: number): string {
  const label = mode === 'hotel' ? 'Hotel' : 'Creche';
  if (mode === 'hotel') {
    return `${label} — ${quantity} ${quantity === 1 ? 'diária' : 'diárias'}`;
  }
  return `${label} — ${quantity} bloco(s)`;
}

export type BoardingComandaLine = {
  pet_id: string | null;
  item_kind: 'service';
  hub_service_type_id: null;
  hub_inventory_item_id: null;
  hub_inventory_lot_id: null;
  description: string;
  quantity: number;
  unit_amount: number;
  discount_amount: number;
  line_total: number;
  service_date: string | null;
  origin_type: 'boarding_reservation';
  origin_id: string;
  sort_order: number;
};

export function buildBoardingComandaLine(
  reservation: BoardingReservationBillingInput & { pet_id?: string | null }
): { line: BoardingComandaLine; subtotal: number } {
  const { checkIn, checkOut } = resolveBoardingCheckInOut(reservation);
  const dailyRateCents = reservation.daily_rate_cents ?? 0;
  const quantity = computeBoardingQuantity(reservation.mode, checkIn, checkOut);
  const { unitAmount, lineTotal } = computeBoardingLineAmount(dailyRateCents, quantity);

  const line: BoardingComandaLine = {
    pet_id: reservation.pet_id ?? null,
    item_kind: 'service',
    hub_service_type_id: null,
    hub_inventory_item_id: null,
    hub_inventory_lot_id: null,
    description: buildBoardingDescription(reservation.mode, quantity),
    quantity,
    unit_amount: unitAmount,
    discount_amount: 0,
    line_total: lineTotal,
    service_date: checkIn ? checkIn.slice(0, 10) : null,
    origin_type: 'boarding_reservation',
    origin_id: reservation.id,
    sort_order: 0,
  };

  return { line, subtotal: lineTotal };
}

export type UnbilledBoardingContext = {
  activeReceivableKeys: Set<string>;
  comandaOpenKeys: Set<string>;
  billedViaComandaKeys: Set<string>;
};

export function shouldIncludeInUnbilledBoarding(
  reservation: BoardingReservationBillingInput,
  ctx: UnbilledBoardingContext
): boolean {
  if (reservation.status !== 'checked_out') return false;
  if (reservation.billing_waived_at) return false;
  if (reservation.deleted_at) return false;

  const key = `boarding_reservation:${reservation.id}`;
  if (ctx.activeReceivableKeys.has(key)) return false;
  if (ctx.comandaOpenKeys.has(key)) return false;
  if (ctx.billedViaComandaKeys.has(key)) return false;
  return true;
}

export function estimateBoardingUnbilledAmount(reservation: BoardingReservationBillingInput): number {
  const { checkIn, checkOut } = resolveBoardingCheckInOut(reservation);
  const quantity = computeBoardingQuantity(reservation.mode, checkIn, checkOut);
  const dailyRateCents = reservation.daily_rate_cents ?? 0;
  return computeBoardingLineAmount(dailyRateCents, quantity).lineTotal;
}

export type DayBoardBilling = {
  comanda_id: string | null;
  comanda_status: string | null;
  has_receivable: boolean;
  receivable_status: 'pending' | 'partially_paid' | 'paid' | null;
  finance_handoff_at: string | null;
  active_receivable_id: string | null;
};

export function isBilledViaComandaHandoff(billing: DayBoardBilling): boolean {
  if (billing.finance_handoff_at) return true;
  if (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid') return true;
  return false;
}
