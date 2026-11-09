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

const BOARDING_TZ = 'America/Sao_Paulo';

const spPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BOARDING_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Data (YYYY-MM-DD) e minutos do dia no fuso da operação. */
export function boardingLocalParts(iso: string): { ymd: string; minutes: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(spPartsFormatter.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function ymdToUtcDays(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Noites = viradas de data (fuso de São Paulo) entre entrada e saída. */
export function computeBoardingNights(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const a = boardingLocalParts(checkIn);
  const b = boardingLocalParts(checkOut);
  if (!a || !b) return 0;
  return Math.max(0, ymdToUtcDays(b.ymd) - ymdToUtcDays(a.ymd));
}

function cutoffToMinutes(cutoff: string | null | undefined): number | null {
  if (!cutoff) return null;
  const m = /^(\d{2}):(\d{2})/.exec(cutoff);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Saída depois do horário-limite da unidade cobra uma diária extra. */
export function isCheckoutAfterCutoff(checkOut: string | null, cutoffTime: string | null | undefined): boolean {
  const limit = cutoffToMinutes(cutoffTime);
  if (limit == null || !checkOut) return false;
  const parts = boardingLocalParts(checkOut);
  return parts != null && parts.minutes > limit;
}

export type BoardingQuantityOptions = { cutoffTime?: string | null };

export function computeBoardingQuantity(
  mode: string,
  checkIn: string | null,
  checkOut: string | null,
  opts?: BoardingQuantityOptions,
): number {
  if (mode === 'hotel') {
    const nights = computeBoardingNights(checkIn, checkOut);
    const extra = nights > 0 && isCheckoutAfterCutoff(checkOut, opts?.cutoffTime) ? 1 : 0;
    return Math.max(1, nights + extra);
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

export function buildBoardingDescription(
  mode: string,
  quantity: number,
  daycarePeriod?: string | null,
): string {
  if (mode === 'hotel') {
    return `Hotel — ${quantity} ${quantity === 1 ? 'diária' : 'diárias'}`;
  }
  if (daycarePeriod === 'half_day') return 'Creche — meio período';
  if (daycarePeriod === 'full_day') return 'Creche — período integral';
  return `Creche — ${quantity} ${quantity === 1 ? 'período' : 'períodos'}`;
}

export type BoardingComandaLine = {
  pet_id: string | null;
  item_kind: 'service';
  hub_service_type_id: string | null;
  hub_inventory_item_id: null;
  hub_inventory_lot_id: null;
  description: string;
  quantity: number;
  unit_amount: number;
  discount_amount: number;
  line_total: number;
  service_date: string | null;
  origin_type: 'boarding_reservation' | 'boarding_extra';
  origin_id: string;
  sort_order: number;
};

export type BoardingReservationLineInput = BoardingReservationBillingInput & {
  pet_id?: string | null;
  hub_service_type_id?: string | null;
  daycare_period?: string | null;
};

export type BoardingExtraInput = {
  id: string;
  hub_service_type_id?: string | null;
  description: string;
  quantity: number | string;
  unit_amount_cents: number;
  service_date?: string | null;
  deleted_at?: string | null;
};

function localYmdOrNull(iso: string | null): string | null {
  if (!iso) return null;
  return boardingLocalParts(iso)?.ymd ?? iso.slice(0, 10);
}

export function buildBoardingComandaLine(
  reservation: BoardingReservationLineInput,
  opts?: BoardingQuantityOptions,
): { line: BoardingComandaLine; subtotal: number } {
  const { checkIn, checkOut } = resolveBoardingCheckInOut(reservation);
  const dailyRateCents = reservation.daily_rate_cents ?? 0;
  const quantity = computeBoardingQuantity(reservation.mode, checkIn, checkOut, opts);
  const { unitAmount, lineTotal } = computeBoardingLineAmount(dailyRateCents, quantity);

  const line: BoardingComandaLine = {
    pet_id: reservation.pet_id ?? null,
    item_kind: 'service',
    hub_service_type_id: reservation.hub_service_type_id ?? null,
    hub_inventory_item_id: null,
    hub_inventory_lot_id: null,
    description: buildBoardingDescription(reservation.mode, quantity, reservation.daycare_period),
    quantity,
    unit_amount: unitAmount,
    discount_amount: 0,
    line_total: lineTotal,
    service_date: localYmdOrNull(checkIn),
    origin_type: 'boarding_reservation',
    origin_id: reservation.id,
    sort_order: 0,
  };

  return { line, subtotal: lineTotal };
}

/** Adicionais da estadia como linhas próprias da comanda (após a linha das diárias). */
export function buildBoardingExtraLines(
  extras: BoardingExtraInput[],
  petId: string | null,
  startSortOrder = 1,
): { lines: BoardingComandaLine[]; subtotal: number } {
  const lines: BoardingComandaLine[] = [];
  let subtotal = 0;
  let sort = startSortOrder;
  for (const ex of extras) {
    if (ex.deleted_at) continue;
    const quantity = round2(Number(ex.quantity) || 0);
    if (quantity <= 0) continue;
    const { unitAmount, lineTotal } = computeBoardingLineAmount(ex.unit_amount_cents ?? 0, quantity);
    lines.push({
      pet_id: petId,
      item_kind: 'service',
      hub_service_type_id: ex.hub_service_type_id ?? null,
      hub_inventory_item_id: null,
      hub_inventory_lot_id: null,
      description: ex.description,
      quantity,
      unit_amount: unitAmount,
      discount_amount: 0,
      line_total: lineTotal,
      service_date: ex.service_date ?? null,
      origin_type: 'boarding_extra',
      origin_id: ex.id,
      sort_order: sort++,
    });
    subtotal = round2(subtotal + lineTotal);
  }
  return { lines, subtotal };
}

/** Total estimado da estadia (diárias/período + adicionais), em reais. */
export function estimateBoardingStayTotal(
  reservation: BoardingReservationLineInput,
  extras: BoardingExtraInput[],
  opts?: BoardingQuantityOptions,
): { quantity: number; base: number; extras: number; total: number } {
  const { line } = buildBoardingComandaLine(reservation, opts);
  const { subtotal } = buildBoardingExtraLines(extras, null);
  return {
    quantity: line.quantity,
    base: line.line_total,
    extras: subtotal,
    total: round2(line.line_total + subtotal),
  };
}

/**
 * Quando a reserva entra na comanda do agendamento, a linha do serviço de hospedagem
 * do agendamento é substituída pelas diárias (evita cobrança dupla).
 */
export function isAppointmentLineReplacedByBoarding(
  lineServiceTypeId: string | null | undefined,
  lineServiceGroup: string | null | undefined,
  reservationServiceTypeId: string | null | undefined,
): boolean {
  if (reservationServiceTypeId && lineServiceTypeId === reservationServiceTypeId) return true;
  return lineServiceGroup === 'hotel' || lineServiceGroup === 'creche';
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

export function estimateBoardingUnbilledAmount(
  reservation: BoardingReservationBillingInput,
  extras: BoardingExtraInput[] = [],
  opts?: BoardingQuantityOptions,
): number {
  return estimateBoardingStayTotal(reservation, extras, opts).total;
}

export type DayBoardBilling = {
  comanda_id: string | null;
  comanda_status: string | null;
  has_receivable: boolean;
  receivable_status: 'pending' | 'partially_paid' | 'paid' | null;
  finance_handoff_at: string | null;
  active_receivable_id: string | null;
  /** Vencimento do recebível ativo (pendente/parcial), quando houver. */
  due_date: string | null;
  /** Valor final do recebível ativo (para filtrar cobranças zeradas). */
  receivable_amount?: number | null;
};

export function isBilledViaComandaHandoff(billing: DayBoardBilling): boolean {
  if (billing.finance_handoff_at) return true;
  if (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid') return true;
  return false;
}
