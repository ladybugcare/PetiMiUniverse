import type { HubServiceGroupValue } from '../../utils/serviceTypeSlug';
import { SERVICE_GROUP_OPTIONS, serviceGroupLabel } from '../../utils/serviceTypeSlug';

export type AgendaView = 'day' | 'week' | 'month';

/** Colunas no dia / linhas na semana: por profissional, grupo de serviço ou recurso/sala. */
export type AgendaGroupMode = 'professional' | 'category' | 'resource';

export type AgendaStatus =
  | 'pending_confirm'
  | 'confirmed'
  | 'in_progress'
  | 'done'
  | 'cancelled'
  | 'paid';

export const STATUS_OPTIONS: { value: AgendaStatus; label: string; short: string }[] = [
  { value: 'pending_confirm', label: 'A confirmar', short: '?' },
  { value: 'confirmed', label: 'Confirmado', short: 'OK' },
  { value: 'in_progress', label: 'Em atendimento', short: '…' },
  { value: 'done', label: 'Finalizado', short: '✓' },
  { value: 'cancelled', label: 'Cancelado', short: '×' },
  { value: 'paid', label: 'Pago', short: '$' },
];

export const STATUS_META: Record<
  AgendaStatus,
  { label: string; short: string; pillClass: string }
> = {
  pending_confirm: { label: 'A confirmar', short: '?', pillClass: 'hub-agenda__pill--st-pending' },
  confirmed: { label: 'Confirmado', short: 'OK', pillClass: 'hub-agenda__pill--st-confirmed' },
  in_progress: { label: 'Em atendimento', short: '…', pillClass: 'hub-agenda__pill--st-progress' },
  done: { label: 'Finalizado', short: '✓', pillClass: 'hub-agenda__pill--st-done' },
  cancelled: { label: 'Cancelado', short: '×', pillClass: 'hub-agenda__pill--st-cancelled' },
  paid: { label: 'Pago', short: '$', pillClass: 'hub-agenda__pill--st-paid' },
};

export type AgendaAppointment = {
  id: string;
  serviceName: string;
  group: HubServiceGroupValue;
  agendaColor: string | null;
  professionalId: string | null;
  professionalName: string;
  resourceLabel: string;
  unitName: string;
  petName: string;
  guardianName: string;
  start: Date;
  end: Date;
  status: AgendaStatus;
  notes?: string;
  conflict?: boolean;
  /** standard | hotel_stay | daycare_block | pickup_route (API). */
  appointment_kind?: string;
  /** UUID do tipo de serviço principal na API Hub. */
  hub_service_type_id?: string;
  /** UUID da série de recorrência (se pertencer a uma). */
  series_id?: string;
  /** Título editável do agendamento. */
  title?: string;
  /** Serviços detalhados da linha N:M. */
  services?: Array<{
    id: string;
    hub_service_type_id: string;
    name: string;
    durationMin: number;
    saleAmount?: number | null;
  }>;
  description?: string;
  financial_notes?: string;
  /** Soma de sale_amount_applied das linhas (quando existir snapshot). */
  saleTotal?: number | null;
  petId?: string | null;
  guardianId?: string | null;
};

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function minutesSinceDayStart(d: Date, dayStart: Date): number {
  return Math.round((d.getTime() - dayStart.getTime()) / 60_000);
}

export function formatHm(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatWeekdayShort(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'short' });
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const wd = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - wd);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function monthMatrix(anchor: Date): Date[][] {
  const first = startOfMonth(anchor);
  const startGrid = startOfWeekMonday(first);
  const weeks: Date[][] = [];
  let cur = new Date(startGrid);
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) {
      row.push(new Date(cur));
      cur = addDays(cur, 1);
    }
    weeks.push(row);
  }
  return weeks;
}

export function laneKeyForAppointment(a: AgendaAppointment, groupMode: AgendaGroupMode): string {
  if (groupMode === 'professional') return a.professionalId ?? '__na__';
  if (groupMode === 'category') return a.group;
  const r = (a.resourceLabel ?? '').trim();
  if (!r || r === '—') return '__none__';
  return r;
}

function apptIntervalsOverlap(a: AgendaAppointment, b: AgendaAppointment): boolean {
  return a.start.getTime() < b.end.getTime() && a.end.getTime() > b.start.getTime();
}

/** IDs com sobreposição de horário na mesma linha/coluna (exclui cancelados). */
export function computeOverlapConflictIds(list: AgendaAppointment[], groupMode: AgendaGroupMode): Set<string> {
  const active = list.filter((x) => x.status !== 'cancelled');
  const byLane = new Map<string, AgendaAppointment[]>();
  for (const a of active) {
    const k = laneKeyForAppointment(a, groupMode);
    const arr = byLane.get(k) ?? [];
    arr.push(a);
    byLane.set(k, arr);
  }
  const bad = new Set<string>();
  for (const arr of byLane.values()) {
    arr.sort((x, y) => x.start.getTime() - y.start.getTime());
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[j]!.start.getTime() >= arr[i]!.end.getTime()) break;
        if (apptIntervalsOverlap(arr[i]!, arr[j]!)) {
          bad.add(arr[i]!.id);
          bad.add(arr[j]!.id);
        }
      }
    }
  }
  return bad;
}

export { serviceGroupLabel };
