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
  | 'paid';

export const STATUS_OPTIONS: { value: AgendaStatus; label: string; short: string }[] = [
  { value: 'pending_confirm', label: 'A confirmar', short: '?' },
  { value: 'confirmed', label: 'Confirmado', short: 'OK' },
  { value: 'checked_in', label: 'Aguardando', short: '⏳' },
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
  checked_in: { label: 'Aguardando', short: '⏳', pillClass: 'hub-agenda__pill--st-confirmed' },
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
  /** UUID da unidade (agenda Hub); usado em checkout/caixa. */
  unitId?: string | null;
  care_location_kind?: 'own_unit' | 'partner_clinic';
  hub_partner_clinic_id?: string | null;
  partnerClinic?: { id: string; name: string } | null;
  petName: string;
  guardianName: string;
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

const EDITABLE_AGENDA_STATUSES: AgendaStatus[] = ['pending_confirm', 'confirmed'];

/** Agendamento editável antes do horário marcado e antes de iniciar atendimento. */
export function canEditAgendaAppointment(
  appt: Pick<AgendaAppointment, 'status' | 'start'>,
  opts: { canWrite: boolean; now?: Date },
): boolean {
  if (!opts.canWrite) return false;
  if (!EDITABLE_AGENDA_STATUSES.includes(appt.status)) return false;
  const now = opts.now ?? new Date();
  return now.getTime() < appt.start.getTime();
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
    if (a.status === 'cancelled') continue;
    extendForMinutes(
      a.start.getHours() * 60 + a.start.getMinutes(),
      a.end.getHours() * 60 + a.end.getMinutes(),
    );
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

export type AgendaCardSize = 'compact' | 'medium' | 'tall';

export function agendaCardSizeFromHeight(heightPx: number): AgendaCardSize {
  if (heightPx < 40) return 'compact';
  if (heightPx <= 64) return 'medium';
  return 'tall';
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
  const visitGroupCounts = new Map<string, number>();
  const visitGroupPets = new Map<string, string[]>();
  for (const appt of list) {
    const vg = appt.visit_group_id;
    if (!vg) continue;
    visitGroupCounts.set(vg, (visitGroupCounts.get(vg) ?? 0) + 1);
    const names = visitGroupPets.get(vg) ?? [];
    if (appt.petName && appt.petName !== '—') names.push(appt.petName);
    visitGroupPets.set(vg, names);
  }

  const enriched = list.map((appt) => {
    const serviceGroups = uniqueServiceGroups(appt.services, appt.group);
    const displayServiceLabel = computeDisplayServiceLabel(appt);
    const pickupPackage = computePickupPackage(appt, list);
    const vg = appt.visit_group_id;
    const visitGroupSize = vg ? visitGroupCounts.get(vg) ?? 1 : undefined;
    const visitGroupLabel =
      vg && visitGroupSize && visitGroupSize > 1
        ? (visitGroupPets.get(vg) ?? []).join(' · ')
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
    (appt) => !isPickupLegHiddenFromGrid(appt, enriched) && !isExtraBlockChildHiddenFromGrid(appt),
  );
}

/** Filtra lista já enriquecida para exibição na grade (alias de enrich). */
export function filterAppointmentsForGrid(list: AgendaAppointment[]): AgendaAppointment[] {
  return enrichAgendaCardsForGrid(list);
}
