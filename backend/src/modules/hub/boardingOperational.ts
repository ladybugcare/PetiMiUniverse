import { computeBoardingNights } from './boardingBilling';

export const BOARDING_SERVICE_GROUPS = ['hotel', 'creche'] as const;
export const BOARDING_APPOINTMENT_KINDS = ['hotel_stay', 'daycare_block'];
export const BOARDING_MODES = ['hotel', 'daycare', 'all'] as const;
export const BOARDING_STATUSES = ['reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show'] as const;

export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  reserved: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['checked_out', 'reserved'],
  checked_out: ['checked_in'],
  cancelled: [],
  no_show: ['reserved'],
};

export function isValidStatusTransition(from: string, to: string): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export function dayBoundsFromYmdSaoPaulo(dateYmd: string): { from: string; to: string } {
  const from = new Date(`${dateYmd}T00:00:00-03:00`);
  const to = new Date(`${dateYmd}T23:59:59.999-03:00`);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function resolveDayBoardRange(query: {
  date?: string;
  from?: string;
  to?: string;
}): { from: string; to: string; dateYmd: string } {
  if (query.from && query.to) {
    const dateYmd = query.date ?? query.from.slice(0, 10);
    return { from: query.from, to: query.to, dateYmd };
  }
  const dateYmd = query.date!;
  const bounds = dayBoundsFromYmdSaoPaulo(dateYmd);
  return { ...bounds, dateYmd };
}

export function appointmentMatchesBoardingTypes(
  appt: Record<string, unknown>,
  boardingTypeIds: Set<string>,
  lineTypeIdsByAppt: Map<string, string[]>,
): boolean {
  const kind = appt.appointment_kind as string | null;
  if (kind && BOARDING_APPOINTMENT_KINDS.includes(kind)) return true;
  const primary = appt.hub_service_type_id as string | null;
  if (primary && boardingTypeIds.has(primary)) return true;
  const lines = lineTypeIdsByAppt.get(appt.id as string) ?? [];
  return lines.some((id) => boardingTypeIds.has(id));
}

export function modeFromAppointmentKind(kind: string | null): 'hotel' | 'daycare' {
  return kind === 'daycare_block' ? 'daycare' : 'hotel';
}

export function stageFromAppointmentStatus(status: string | null): string {
  switch (status) {
    case 'in_progress':
      return 'checked_in';
    case 'done':
    case 'paid':
      return 'checked_out';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'reserved';
  }
}

/** Noites entre check-in e check-out (ou agora). Mesma regra da cobrança: viradas de data em São Paulo. */
export function calcBoardingNights(checkedInAt: string | null, checkedOutAt: string | null): number {
  if (!checkedInAt) return 0;
  return computeBoardingNights(checkedInAt, checkedOutAt ?? new Date().toISOString());
}

export type BoardingStayWindowInput = {
  status: string;
  expected_check_in?: string | null;
  expected_check_out?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  created_at?: string | null;
};

/** Intervalo em que o pet está (ou estará) sob responsabilidade da unidade. */
export function boardingStayWindow(
  r: BoardingStayWindowInput,
  nowIso: string = new Date().toISOString(),
): { start: string; end: string } | null {
  const start = r.checked_in_at ?? r.expected_check_in ?? r.created_at ?? null;
  if (!start) return null;
  let end: string;
  if (r.checked_out_at) {
    end = r.checked_out_at;
  } else if (r.status === 'checked_in') {
    const expected = r.expected_check_out ?? null;
    end = expected && expected > nowIso ? expected : nowIso;
  } else {
    end = r.expected_check_out ?? start;
  }
  if (end < start) end = start;
  return { start, end };
}

/** A estadia cobre algum instante do intervalo [from, to]? (estadias de vários dias aparecem em todos os dias) */
export function reservationOverlapsRange(
  r: BoardingStayWindowInput,
  from: string,
  to: string,
  nowIso?: string,
): boolean {
  const w = boardingStayWindow(r, nowIso);
  if (!w) return false;
  return new Date(w.start).getTime() <= new Date(to).getTime() && new Date(w.end).getTime() >= new Date(from).getTime();
}
