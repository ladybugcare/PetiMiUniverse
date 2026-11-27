import type { HubServiceGroupValue } from '../../utils/serviceTypeSlug';
import { SERVICE_GROUP_OPTIONS, serviceGroupLabel } from '../../utils/serviceTypeSlug';
import { isExtraBlockChildHiddenFromGrid } from './extraBlockAgendaUtils';

export type AgendaView = 'day' | 'week' | 'month';

/** Colunas no dia / linhas na semana: por profissional, grupo de serviço ou recurso/sala. */
export type AgendaGroupMode = 'professional' | 'category' | 'resource';

export type AgendaStatus =
  | 'pending_confirm'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'done'
  | 'cancelled'
  | 'paid'
  | 'no_show';

export const STATUS_OPTIONS: { value: AgendaStatus; label: string; short: string }[] = [
  { value: 'pending_confirm', label: 'A confirmar', short: '?' },
  { value: 'confirmed', label: 'Confirmado', short: 'OK' },
  { value: 'checked_in', label: 'Aguardando', short: '⏳' },
  { value: 'in_progress', label: 'Em atendimento', short: '…' },
  { value: 'done', label: 'Finalizado', short: '✓' },
  { value: 'cancelled', label: 'Cancelado', short: '×' },
  { value: 'paid', label: 'Pago', short: '$' },
  { value: 'no_show', label: 'Falta', short: 'F' },
];

export const STATUS_META: Record<
  AgendaStatus,
  { label: string; short: string; pillClass: string }
> = {
  pending_confirm: { label: 'A confirmar', short: '?', pillClass: 'hub-agenda__pill--st-pending' },
  confirmed: { label: 'Confirmado', short: 'OK', pillClass: 'hub-agenda__pill--st-confirmed' },
  checked_in: { label: 'Aguardando', short: '⏳', pillClass: 'hub-agenda__pill--st-confirmed' },
  in_progress: { label: 'Em atendimento', short: '…', pillClass: 'hub-agenda__pill--st-progress' },
  done: { label: 'Finalizado', short: '✓', pillClass: 'hub-agenda__pill--st-done' },
  cancelled: { label: 'Cancelado', short: '×', pillClass: 'hub-agenda__pill--st-cancelled' },
  paid: { label: 'Pago', short: '$', pillClass: 'hub-agenda__pill--st-paid' },
  no_show: { label: 'Falta', short: 'F', pillClass: 'hub-agenda__pill--st-noshow' },
};

export type AgendaAppointment = {
  id: string;
  serviceName: string;
  group: HubServiceGroupValue;
  agendaColor: string | null;
  professionalId: string | null;
  professionalName: string;
  resourceLabel: string;
  hubResourceId?: string | null;
  resourceReleasedAt?: string | null;
  unitName: string;
  /** UUID da unidade (agenda Hub); usado em checkout/caixa. */
  unitId?: string | null;
  care_location_kind?: 'own_unit' | 'partner_clinic';
  hub_partner_clinic_id?: string | null;
  partnerClinic?: { id: string; name: string } | null;
  petName: string;
  guardianName: string;
  /** Dados padrão do pet (porte, pelagem, comportamento…) quando a API enriquece. */
  petSpecies?: string | null;
  petBreed?: string | null;
  petSizeTier?: string | null;
  petCoatType?: string | null;
  petBehaviorTags?: string[];
  start: Date;
  end: Date;
  status: AgendaStatus;
  notes?: string;
  conflict?: boolean;
  /** standard | hotel_stay | pickup_route | clinical_walk_in | clinical_emergency (API). */
  appointment_kind?: string;
  /** UUID do tipo de serviço principal na API Hub. */
  hub_service_type_id?: string;
  /** UUID da série de recorrência (se pertencer a uma). */
  series_id?: string;
  /** Bloco adicional: aponta para o agendamento principal. */
  parent_appointment_id?: string | null;
  /** Título editável do agendamento. */
  title?: string;
  /** Serviços detalhados da linha N:M. */
  services?: Array<{
    id: string;
    hub_service_type_id: string;
    name: string;
    durationMin: number;
    saleAmount?: number | null;
    isAddon?: boolean;
    serviceGroup?: HubServiceGroupValue;
    pricingVariant?: {
      period?: 'full_day' | 'half_day';
      consult_type?: 'padrao' | 'retorno';
      km_tier_index?: number;
      custom_tier_index?: number;
    } | null;
  }>;
  /** Grupos únicos presentes nas linhas de serviço (para ícones múltiplos). */
  serviceGroups?: HubServiceGroupValue[];
  /** Rótulo de serviço para o card (sem repetir o pet). */
  displayServiceLabel?: string;
  /** Parte de série recorrente. */
  isRecurring?: boolean;
  /** L&T via checkbox: busca/retorno vinculados ao principal (badges no card). */
  pickupPackage?: { hasBefore: boolean; hasAfter: boolean } | null;
  description?: string;
  financial_notes?: string;
  /** Soma de sale_amount_applied das linhas (quando existir snapshot). */
  saleTotal?: number | null;
  petId?: string | null;
  guardianId?: string | null;
  hubEncounterId?: string | null;
  hubEncounterStatus?: string | null;
  financial_adjustment_pending?: boolean;
  comanda_id?: string | null;
  pricing_porte_tier?: string | null;
  pricing_coat_type?: string | null;
  visit_group_id?: string | null;
  visitGroupSize?: number;
  visitGroupLabel?: string;
};

export function isPartnerCareLocation(
  appt: Pick<AgendaAppointment, 'care_location_kind'>,
): boolean {
  return appt.care_location_kind === 'partner_clinic';
}

/** Statuses já encerrados — não permitem remarcar por arraste nem no painel. */
const LOCKED_AGENDA_STATUSES: AgendaStatus[] = ['done', 'cancelled', 'paid', 'no_show'];

/** Statuses selecionáveis no combo «Situação» do modal (Pago/Finalizado/Cancelado/Falta vêm de outros fluxos). */
export const MANUAL_SITUACAO_STATUSES: AgendaStatus[] = [
  'pending_confirm',
  'confirmed',
  'checked_in',
  'in_progress',
];

/** Statuses em que o backend ainda aceita patch estrutural (antes do horário). */
const STRUCTURAL_EDITABLE_AGENDA_STATUSES: AgendaStatus[] = ['pending_confirm', 'confirmed'];

/** Mensagem alinhada a `isAppointmentStructurallyEditable` no backend. */
export const AGENDA_STRUCTURAL_EDIT_BLOCK_MESSAGE =
  'Agendamento não pode ser editado após iniciado ou após o horário agendado.';

export function isLockedAgendaStatus(status: AgendaStatus): boolean {
  return LOCKED_AGENDA_STATUSES.includes(status);
}

/**
 * Motivo pelo qual o agendamento não pode ser remarcado/editado estruturalmente, ou `null` se pode.
 * Alinhado ao backend: só `pending_confirm`/`confirmed` e `starts_at` ainda no futuro.
 */
export function agendaAppointmentEditBlockReason(
  appt: Pick<AgendaAppointment, 'status' | 'start'>,
  opts: { canWrite: boolean; now?: Date },
): string | null {
  if (!opts.canWrite) return 'Você não tem permissão para remarcar';
  if (LOCKED_AGENDA_STATUSES.includes(appt.status)) {
    return `Não é possível remarcar com status “${STATUS_META[appt.status].label}”`;
  }
  if (!STRUCTURAL_EDITABLE_AGENDA_STATUSES.includes(appt.status)) {
    return AGENDA_STRUCTURAL_EDIT_BLOCK_MESSAGE;
  }
  const now = opts.now ?? new Date();
  if (appt.start.getTime() <= now.getTime()) {
    return AGENDA_STRUCTURAL_EDIT_BLOCK_MESSAGE;
  }
  return null;
}

/** Pode remarcar/editar estruturalmente (status + horário futuros) com permissão de escrita. */
export function canEditAgendaAppointment(
  appt: Pick<AgendaAppointment, 'status' | 'start'>,
  opts: { canWrite: boolean; now?: Date },
): boolean {
  return agendaAppointmentEditBlockReason(appt, opts) === null;
}

export const DEFAULT_AGENDA_START_HOUR = 7;
export const DEFAULT_AGENDA_END_HOUR = 20;

export type AgendaHourRange = { startHour: number; endHour: number };

function parseHmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Extrai janela padrão de trabalho do JSON `work_hours` do profissional. */
export function parseStaffWorkHours(raw: unknown): { start: string; end: string } {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const start = typeof o.default_start === 'string' ? o.default_start : '09:00';
    const end = typeof o.default_end === 'string' ? o.default_end : '18:00';
    return { start, end };
  }
  return { start: '09:00', end: '18:00' };
}

/**
 * Faixa visível da grade diária: padrão 7h–20h, estendida quando há atendimentos
 * ou jornada de profissionais fora desse intervalo (ex.: clínica noturna).
 */
export function computeAgendaHourRange(
  appointments: AgendaAppointment[],
  options?: {
    staffWorkHours?: Array<{ start?: string; end?: string }>;
    slotMin?: number;
  },
): AgendaHourRange {
  const slotMin = options?.slotMin ?? 30;
  let startHour = DEFAULT_AGENDA_START_HOUR;
  let endHour = DEFAULT_AGENDA_END_HOUR;

  const extendForMinutes = (startMinutes: number, endMinutes: number) => {
    if (startMinutes < startHour * 60) {
      startHour = Math.max(0, Math.floor((startMinutes - 60) / 60));
    }
    if (endMinutes > endHour * 60) {
      endHour = Math.min(24, Math.ceil((endMinutes + slotMin) / 60));
    }
  };

  for (const a of appointments) {
    if (a.status === 'cancelled' || a.status === 'no_show') continue;
    const startMinutes = a.start.getHours() * 60 + a.start.getMinutes();
    // Overnight: ignora o horário de checkout no outro dia (a grade do dia já cobre até o padrão/estendido).
    const endMinutes = isSameDay(a.start, a.end)
      ? a.end.getHours() * 60 + a.end.getMinutes()
      : DEFAULT_AGENDA_END_HOUR * 60;
    extendForMinutes(startMinutes, endMinutes);
  }

  for (const wh of options?.staffWorkHours ?? []) {
    const startM = wh.start ? parseHmToMinutes(wh.start) : null;
    const endM = wh.end ? parseHmToMinutes(wh.end) : null;
    if (startM != null && endM != null) extendForMinutes(startM, endM);
  }

  return { startHour, endHour };
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function minutesSinceDayStart(d: Date, dayStart: Date): number {
  return Math.round((d.getTime() - dayStart.getTime()) / 60_000);
}

/**
 * Limita o card à faixa visível da grade do dia (evita hospedagens/overnight
 * esticarem o scroll sem horários abaixo do fim da agenda).
 */
export function clampAppointmentToDayLane(
  start: Date,
  end: Date,
  dayStart: Date,
  dayMinutes: number,
): { startMins: number; endMins: number } | null {
  if (dayMinutes <= 0) return null;
  const rawStart = minutesSinceDayStart(start, dayStart);
  const rawEnd = minutesSinceDayStart(end, dayStart);
  const startMins = Math.max(0, Math.min(rawStart, dayMinutes));
  const endMins = Math.max(0, Math.min(rawEnd, dayMinutes));
  if (endMins <= startMins) return null;
  return { startMins, endMins };
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

/**
 * Reposiciona o intervalo no dia alvo, preservando o horário local e a duração.
 * Usado ao arrastar um card da semana/mês para outro dia.
 */
export function shiftAppointmentToDay(
  start: Date,
  end: Date,
  targetDay: Date,
): { start: Date; end: Date } {
  const origDay = startOfDay(start);
  const destDay = startOfDay(targetDay);
  const offsetMs = start.getTime() - origDay.getTime();
  const durMs = Math.max(end.getTime() - start.getTime(), 0);
  const newStart = new Date(destDay.getTime() + offsetMs);
  return { start: newStart, end: new Date(newStart.getTime() + durMs) };
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
  if (a.hubResourceId) return a.hubResourceId;
  const r = (a.resourceLabel ?? '').trim();
  if (!r || r === '—') return '__none__';
  return r;
}

function apptIntervalsOverlap(a: AgendaAppointment, b: AgendaAppointment): boolean {
  return a.start.getTime() < b.end.getTime() && a.end.getTime() > b.start.getTime();
}

function normalizeAgendaResourceLabel(label: string | null | undefined): string | null {
  const t = (label ?? '').trim();
  if (!t || t === '—') return null;
  return t;
}

/** Conflito de agenda: overlap + (mesmo profissional OU mesmo recurso). Alinhado a `scheduleConflict.ts`. */
function appointmentsShareScheduleConflict(a: AgendaAppointment, b: AgendaAppointment): boolean {
  if (!apptIntervalsOverlap(a, b)) return false;
  const staffConflict = Boolean(a.professionalId && b.professionalId && a.professionalId === b.professionalId);
  if (staffConflict) return true;

  if (a.resourceReleasedAt || b.resourceReleasedAt) return false;
  if (a.hubResourceId && b.hubResourceId) return a.hubResourceId === b.hubResourceId;
  const labelA = normalizeAgendaResourceLabel(a.resourceLabel);
  const labelB = normalizeAgendaResourceLabel(b.resourceLabel);
  return Boolean(labelA && labelB && labelA === labelB);
}

/**
 * IDs com conflito real de horário (mesmo profissional ou mesmo recurso).
 * Exclui cancelados. Não usa a coluna da vista: agendamentos sem recurso/staff
 * em comum no mesmo horário (ex. balde «Sem recurso») não contam.
 * O parâmetro `groupMode` é ignorado (mantido por compatibilidade das call sites).
 */
export function computeOverlapConflictIds(
  list: AgendaAppointment[],
  _groupMode?: AgendaGroupMode,
): Set<string> {
  const active = list
    .filter((x) => x.status !== 'cancelled' && x.status !== 'no_show')
    .slice()
    .sort((x, y) => x.start.getTime() - y.start.getTime());
  const bad = new Set<string>();
  for (let i = 0; i < active.length; i++) {
    const a = active[i]!;
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j]!;
      if (b.start.getTime() >= a.end.getTime()) break;
      if (appointmentsShareScheduleConflict(a, b)) {
        bad.add(a.id);
        bad.add(b.id);
      }
    }
  }
  return bad;
}

/** Posição horizontal de um card quando há conflitos no mesmo horário. */
export type DayLaneCardLayout = {
  column: number;
  columnCount: number;
};

type LaneLayoutInterval = { id: string; startMs: number; endMs: number };

/**
 * Empacota agendamentos sobrepostos lado a lado (estilo calendário clássico).
 * Eventos que só se tocam no limite não compartilham coluna.
 * Com `dayStart`/`dayMinutes`, usa o intervalo já cortado na grade do dia
 * (evita overnight/hotel “engolir” o empacotamento do dia inteiro).
 */
export function layoutDayLaneAppointments(
  list: Array<Pick<AgendaAppointment, 'id' | 'start' | 'end'>>,
  options?: { dayStart?: Date; dayMinutes?: number },
): Map<string, DayLaneCardLayout> {
  const result = new Map<string, DayLaneCardLayout>();
  if (list.length === 0) return result;

  const dayStart = options?.dayStart;
  const dayMinutes = options?.dayMinutes;

  const intervals: LaneLayoutInterval[] = [];
  for (const a of list) {
    if (dayStart != null && dayMinutes != null && dayMinutes > 0) {
      const clamped = clampAppointmentToDayLane(a.start, a.end, dayStart, dayMinutes);
      if (!clamped) continue;
      intervals.push({
        id: a.id,
        startMs: clamped.startMins,
        endMs: clamped.endMins,
      });
    } else {
      intervals.push({
        id: a.id,
        startMs: a.start.getTime(),
        endMs: a.end.getTime(),
      });
    }
  }

  intervals.sort((a, b) => {
    const byStart = a.startMs - b.startMs;
    if (byStart !== 0) return byStart;
    return b.endMs - a.endMs;
  });

  let cluster: LaneLayoutInterval[] = [];
  let clusterEnd = 0;

  const flushCluster = () => {
    if (cluster.length === 0) return;

    const colEnds: number[] = [];
    const assignments = new Map<string, number>();

    for (const ev of cluster) {
      let col = colEnds.findIndex((end) => end <= ev.startMs);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(ev.endMs);
      } else {
        colEnds[col] = ev.endMs;
      }
      assignments.set(ev.id, col);
    }

    const columnCount = Math.max(colEnds.length, 1);
    for (const ev of cluster) {
      result.set(ev.id, { column: assignments.get(ev.id) ?? 0, columnCount });
    }

    cluster = [];
    clusterEnd = 0;
  };

  for (const ev of intervals) {
    if (cluster.length === 0) {
      cluster = [ev];
      clusterEnd = ev.endMs;
      continue;
    }
    if (ev.startMs < clusterEnd) {
      cluster.push(ev);
      clusterEnd = Math.max(clusterEnd, ev.endMs);
    } else {
      flushCluster();
      cluster = [ev];
      clusterEnd = ev.endMs;
    }
  }
  flushCluster();

  return result;
}

export { serviceGroupLabel };

export type AgendaCardSize = 'compact' | 'medium' | 'tall';

/** Densidade visual da grade diária (altura do slot de 30 min). */
export type AgendaDensity = 'compact' | 'comfortable' | 'spacious';

export const AGENDA_DENSITY_SLOT_H: Record<AgendaDensity, number> = {
  compact: 22,
  comfortable: 26,
  spacious: 34,
};

export const AGENDA_DENSITY_STORAGE_KEY = 'petmi-hub-agenda-density-v1';

export const DAY_CARD_MIN_WIDTH_PX = 96;
export const DAY_CARD_FULL_WIDTH_PX = 120;
export const DAY_MAX_VISIBLE_COLUMNS = 3;
export const DAY_LANE_DEFAULT_WIDTH_PX = 200;
/** Largura reservada à direita da lane para o trilho «+N». */
export const DAY_OVERFLOW_RAIL_PX = 34;
/** A partir desta duração (na grade do dia) o atendimento vai para a faixa «Dia todo». */
export const DAY_STAY_MIN_MINUTES = 240;

/**
 * Hospedagens e atendimentos longos (≥ 4h na grade do dia) saem da timeline
 * e aparecem na faixa «Dia todo» do topo da coluna. Só apresentação.
 */
export function isAgendaDayStay(
  a: Pick<AgendaAppointment, 'start' | 'end' | 'appointment_kind'>,
  dayStart: Date,
  dayMinutes: number,
): boolean {
  if (a.appointment_kind === 'hotel_stay') return true;
  const clamped = clampAppointmentToDayLane(a.start, a.end, dayStart, dayMinutes);
  if (!clamped) return false;
  return clamped.endMins - clamped.startMins >= DAY_STAY_MIN_MINUTES;
}

/** Texto curto do período de uma estadia relativo ao dia exibido. */
export function agendaDayStayPeriodLabel(
  a: Pick<AgendaAppointment, 'start' | 'end'>,
  day: Date,
): string {
  const startsToday = isSameDay(a.start, day);
  const endsToday = isSameDay(a.end, day);
  if (startsToday && endsToday) return `${formatHm(a.start)}–${formatHm(a.end)}`;
  if (startsToday) return `entra ${formatHm(a.start)}`;
  if (endsToday) return `sai ${formatHm(a.end)}`;
  return 'dia todo';
}

/**
 * Modo do card por altura e largura útil.
 * - compacto: altura &lt; 52 (ex.: 60 min na densidade C ≈ 44px) ou largura &lt; 96 —
 *   não cabe 3 linhas sem cortar
 * - completo (tall): altura ≥ 72 e largura ≥ 120 (ou largura desconhecida)
 * - médio: demais casos (ex.: 60 min na densidade M ≈ 52px)
 */
export function agendaCardSizeFromHeight(heightPx: number, widthPx?: number): AgendaCardSize {
  if (heightPx < 52 || (widthPx != null && widthPx < DAY_CARD_MIN_WIDTH_PX)) return 'compact';
  if (heightPx >= 72 && (widthPx == null || widthPx >= DAY_CARD_FULL_WIDTH_PX)) return 'tall';
  return 'medium';
}

/** Quantas colunas cabem sem ficar ilegível (piso de largura + teto de cards). */
export function dayLaneVisibleColumnCap(
  columnCount: number,
  opts?: { maxVisible?: number; minWidthPx?: number; laneWidthPx?: number },
): number {
  const maxVisible = opts?.maxVisible ?? DAY_MAX_VISIBLE_COLUMNS;
  const minWidth = opts?.minWidthPx ?? DAY_CARD_MIN_WIDTH_PX;
  const laneW = opts?.laneWidthPx ?? DAY_LANE_DEFAULT_WIDTH_PX;
  const byWidth = Math.max(1, Math.floor(laneW / minWidth));
  return Math.max(1, Math.min(columnCount, maxVisible, byWidth));
}

export type DayLaneOverflowGroup = {
  /** Todos os ids do cluster de overlap. */
  allIds: string[];
  visibleIds: string[];
  hiddenIds: string[];
  hasConflict: boolean;
  /** Intervalo coberto pelos ocultos (posição do trilho «+N»). */
  startMs: number;
  endMs: number;
};

export type DayLaneDisplayPlan = {
  /** Layout remapeado só para cards visíveis (columnCount = cap). */
  display: Map<string, { column: number; columnCount: number }>;
  overflows: DayLaneOverflowGroup[];
};

/**
 * Aplica teto de colunas / piso de largura sobre o packing existente,
 * sem alterar horários nem `layoutDayLaneAppointments`.
 */
export function planDayLaneOverflowDisplay(
  appointments: Array<{ id: string; start: Date; end: Date; conflict?: boolean }>,
  layouts: Map<string, { column: number; columnCount: number }>,
  opts?: { maxVisible?: number; minWidthPx?: number; laneWidthPx?: number },
): DayLaneDisplayPlan {
  const display = new Map<string, { column: number; columnCount: number }>();
  const overflows: DayLaneOverflowGroup[] = [];
  const byId = new Map(appointments.map((a) => [a.id, a]));

  // Componentes conexos por sobreposição temporal (mesma noção de cluster do packing).
  const ids = appointments.filter((a) => layouts.has(a.id)).map((a) => a.id);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(x, p);
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of ids) parent.set(id, id);

  for (let i = 0; i < ids.length; i++) {
    const a = byId.get(ids[i]!)!;
    const aStart = a.start.getTime();
    const aEnd = a.end.getTime();
    for (let j = i + 1; j < ids.length; j++) {
      const b = byId.get(ids[j]!)!;
      if (aStart < b.end.getTime() && b.start.getTime() < aEnd) {
        union(ids[i]!, ids[j]!);
      }
    }
  }

  const clusters = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const arr = clusters.get(root) ?? [];
    arr.push(id);
    clusters.set(root, arr);
  }

  for (const clusterIds of clusters.values()) {
    const pack0 = layouts.get(clusterIds[0]!) ?? { column: 0, columnCount: 1 };
    const columnCount = Math.max(
      pack0.columnCount,
      ...clusterIds.map((id) => layouts.get(id)?.columnCount ?? 1),
    );
    const cap = dayLaneVisibleColumnCap(columnCount, opts);
    const sorted = [...clusterIds].sort((a, b) => {
      const ca = layouts.get(a)?.column ?? 0;
      const cb = layouts.get(b)?.column ?? 0;
      if (ca !== cb) return ca - cb;
      const sa = byId.get(a)!.start.getTime();
      const sb = byId.get(b)!.start.getTime();
      return sa - sb;
    });

    const visibleIds: string[] = [];
    const hiddenIds: string[] = [];
    for (const id of sorted) {
      const col = layouts.get(id)?.column ?? 0;
      if (col < cap) {
        visibleIds.push(id);
        display.set(id, { column: col, columnCount: cap });
      } else {
        hiddenIds.push(id);
      }
    }

    if (hiddenIds.length === 0) {
      for (const id of sorted) {
        const pack = layouts.get(id) ?? { column: 0, columnCount: 1 };
        display.set(id, { column: pack.column, columnCount: Math.min(pack.columnCount, cap) });
      }
      continue;
    }

    let startMs = Number.POSITIVE_INFINITY;
    let endMs = 0;
    let hasConflict = false;
    for (const id of hiddenIds) {
      const ap = byId.get(id)!;
      startMs = Math.min(startMs, ap.start.getTime());
      endMs = Math.max(endMs, ap.end.getTime());
    }
    for (const id of clusterIds) {
      if (byId.get(id)!.conflict) hasConflict = true;
    }

    const allIds = [...clusterIds].sort(
      (a, b) => byId.get(a)!.start.getTime() - byId.get(b)!.start.getTime(),
    );

    overflows.push({
      allIds,
      visibleIds,
      hiddenIds,
      hasConflict,
      startMs,
      endMs,
    });
  }

  return { display, overflows };
}

/** Primeiro nome do tutor para cards compactos. */
export function guardianFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed || trimmed === '—') return trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function stripPetSuffixFromLabel(label: string, petName: string): string {
  const pet = petName.trim();
  if (!pet || pet === '—') return label;
  const suffix = ` — ${pet}`;
  if (label.endsWith(suffix)) return label.slice(0, -suffix.length).trim();
  const suffix2 = ` - ${pet}`;
  if (label.endsWith(suffix2)) return label.slice(0, -suffix2.length).trim();
  return label;
}

/** Monta rótulo de serviço sem repetir o nome do pet. */
export function computeDisplayServiceLabel(appt: Pick<AgendaAppointment, 'title' | 'serviceName' | 'petName' | 'services'>): string {
  const services = appt.services ?? [];
  const mainLines = services.filter((s) => !s.isAddon && s.name);
  const addonLines = services.filter((s) => s.isAddon && s.name);

  if (appt.title?.trim()) {
    return stripPetSuffixFromLabel(appt.title.trim(), appt.petName);
  }

  if (mainLines.length > 0) {
    const first = mainLines[0]!.name;
    const extraMain = mainLines.length - 1;
    const addonCount = addonLines.length;
    let label = first;
    if (extraMain > 0) label += ` +${extraMain}`;
    else if (addonCount > 0) label += ` +${addonCount} adic.`;
    return label;
  }

  if (addonLines.length > 0) {
    return addonLines.length === 1 ? `Adicional: ${addonLines[0]!.name}` : `${addonLines.length} adicionais`;
  }

  return stripPetSuffixFromLabel(appt.serviceName || 'Serviço', appt.petName);
}

function isMainAppointmentKind(kind: string | undefined): boolean {
  return kind !== 'pickup_route';
}

/** Oculta perna L&T criada pelo checkbox quando há card principal na mesma série/dia. */
export function isPickupLegHiddenFromGrid(
  appt: Pick<AgendaAppointment, 'id' | 'appointment_kind' | 'series_id' | 'start'>,
  allAppts: Array<Pick<AgendaAppointment, 'id' | 'appointment_kind' | 'series_id' | 'start'>>,
): boolean {
  if (appt.appointment_kind !== 'pickup_route' || !appt.series_id) return false;
  return allAppts.some(
    (sibling) =>
      sibling.id !== appt.id &&
      sibling.series_id === appt.series_id &&
      isMainAppointmentKind(sibling.appointment_kind) &&
      isSameDay(sibling.start, appt.start),
  );
}

function computePickupPackage(
  appt: AgendaAppointment,
  allAppts: AgendaAppointment[],
): { hasBefore: boolean; hasAfter: boolean } | null {
  if (!isMainAppointmentKind(appt.appointment_kind)) return null;
  if (appt.group === 'leva_traz') return null;

  const legs = allAppts.filter(
    (s) => s.parent_appointment_id === appt.id && s.appointment_kind === 'pickup_route',
  );
  if (legs.length === 0) return null;

  const hasBefore = legs.some((leg) => leg.end.getTime() <= appt.start.getTime());
  const hasAfter = legs.some((leg) => leg.start.getTime() >= appt.end.getTime());
  if (!hasBefore && !hasAfter) return null;
  return { hasBefore, hasAfter };
}

function uniqueServiceGroups(services: AgendaAppointment['services'], fallback: HubServiceGroupValue): HubServiceGroupValue[] {
  const groups: HubServiceGroupValue[] = [];
  const seen = new Set<string>();
  for (const s of services ?? []) {
    const g = s.serviceGroup ?? fallback;
    if (seen.has(g)) continue;
    seen.add(g);
    groups.push(g);
  }
  if (groups.length === 0) groups.push(fallback);
  return groups.slice(0, 3);
}

/** Enriquece agendamentos com metadados de card e filtra pernas L&T ocultas. */
export function enrichAgendaCardsForGrid(list: AgendaAppointment[]): AgendaAppointment[] {
  /** Conta pets únicos (não blocos): Banho+Consulta do mesmo pet ≠ «2 pets». */
  const visitGroupPetKeys = new Map<string, Set<string>>();
  const visitGroupPetNames = new Map<string, string[]>();
  for (const appt of list) {
    const vg = appt.visit_group_id;
    if (!vg) continue;
    const key = appt.petId || `name:${appt.petName || appt.id}`;
    const keys = visitGroupPetKeys.get(vg) ?? new Set<string>();
    const isNew = !keys.has(key);
    keys.add(key);
    visitGroupPetKeys.set(vg, keys);
    if (isNew && appt.petName && appt.petName !== '—') {
      const names = visitGroupPetNames.get(vg) ?? [];
      names.push(appt.petName);
      visitGroupPetNames.set(vg, names);
    }
  }

  const enriched = list.map((appt) => {
    const serviceGroups = uniqueServiceGroups(appt.services, appt.group);
    const displayServiceLabel = computeDisplayServiceLabel(appt);
    const pickupPackage = computePickupPackage(appt, list);
    const vg = appt.visit_group_id;
    const uniquePets = vg ? visitGroupPetKeys.get(vg)?.size ?? 1 : 1;
    const visitGroupSize = vg && uniquePets > 1 ? uniquePets : undefined;
    const visitGroupLabel =
      vg && visitGroupSize && visitGroupSize > 1
        ? (visitGroupPetNames.get(vg) ?? []).join(' · ')
        : undefined;
    return {
      ...appt,
      serviceGroups,
      displayServiceLabel,
      isRecurring: Boolean(appt.series_id),
      pickupPackage,
      visitGroupSize,
      visitGroupLabel,
    };
  });
  return enriched.filter(
    (appt) =>
      !isPickupLegHiddenFromGrid(appt, enriched) && !isExtraBlockChildHiddenFromGrid(appt, enriched),
  );
}

/** Filtra lista já enriquecida para exibição na grade (alias de enrich). */
export function filterAppointmentsForGrid(list: AgendaAppointment[]): AgendaAppointment[] {
  return enrichAgendaCardsForGrid(list);
}
