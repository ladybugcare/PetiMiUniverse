import type { DayBoardItem } from '../../../api/hubClinicalApi';
import type { HubEncounterOperationalPhase } from '../../../api/hubClinicalApi';

export type VetCockpitViewMode = 'queue' | 'agenda' | 'operation';

const FINAL_STATUSES = new Set(['completed', 'done', 'cancelled']);

export function itemOperationalStatus(item: DayBoardItem): string {
  const base = (item.status as string) || item.appointment_status || 'waiting';
  const phase = (item as { operational_phase?: HubEncounterOperationalPhase | null }).operational_phase;
  if (base === 'in_progress' && phase === 'awaiting_exams') return 'awaiting_exams';
  if (base === 'in_progress' && phase === 'exams_returned') return 'exams_returned';
  return base;
}

export const VET_QUEUE_STATUS_LABEL: Record<string, string> = {
  waiting: 'Aguardando',
  checked_in: 'Tutor chegou',
  confirmed: 'Confirmado',
  pending_confirm: 'A confirmar',
  in_progress: 'Em atendimento',
  awaiting_exams: 'Em exames',
  exams_returned: 'Retornou dos exames',
  completed: 'Finalizado',
  done: 'Finalizado',
  cancelled: 'Cancelado',
};

export function formatQueueTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function itemStartsAt(item: DayBoardItem): string | undefined {
  return (
    item.starts_at ||
    item.started_at ||
    (item.appointment as { starts_at?: string })?.starts_at
  );
}

export function isItemLate(item: DayBoardItem, now = Date.now()): boolean {
  const st = itemOperationalStatus(item);
  if (FINAL_STATUSES.has(st)) return false;
  const iso = itemStartsAt(item);
  if (!iso) return false;
  return new Date(iso).getTime() < now;
}

export function isItemEmergency(item: DayBoardItem): boolean {
  const kind =
    item.appointment_kind ??
    (item as { appointment?: { appointment_kind?: string } }).appointment?.appointment_kind;
  return kind === 'clinical_emergency';
}

export type TurnSummary = {
  remaining: number;
  current: DayBoardItem | null;
  next: DayBoardItem | null;
  late: number;
  total: number;
};

export function computeTurnSummary(items: DayBoardItem[], selected?: DayBoardItem | null): TurnSummary {
  const pending = items.filter((i) => !FINAL_STATUSES.has(itemOperationalStatus(i)));
  const inProgress = items.filter((i) => itemOperationalStatus(i) === 'in_progress');
  const current =
    selected && !FINAL_STATUSES.has(itemOperationalStatus(selected))
      ? selected
      : inProgress[0] ?? null;
  const currentIdx = current ? items.indexOf(current) : -1;
  let next: DayBoardItem | null = null;
  for (let i = currentIdx + 1; i < items.length; i += 1) {
    const st = itemOperationalStatus(items[i]!);
    if (!FINAL_STATUSES.has(st) && items[i] !== current) {
      next = items[i]!;
      break;
    }
  }
  if (!next) {
    next =
      pending.find((i) => i !== current && itemOperationalStatus(i) !== 'in_progress') ?? null;
  }
  const late = items.filter((i) => isItemLate(i)).length;
  return {
    remaining: pending.length,
    current,
    next,
    late,
    total: items.length,
  };
}

export function itemKey(item: DayBoardItem): string {
  return item.encounter_id || item.appointment_id || `${item.pet_id}-${itemStartsAt(item)}`;
}

export const VET_COCKPIT_SELECTION_KEY = 'hub-vet-cockpit-selected';

export function readStoredSelection(): string | null {
  try {
    return sessionStorage.getItem(VET_COCKPIT_SELECTION_KEY);
  } catch {
    return null;
  }
}

export function writeStoredSelection(key: string | null) {
  try {
    if (key) sessionStorage.setItem(VET_COCKPIT_SELECTION_KEY, key);
    else sessionStorage.removeItem(VET_COCKPIT_SELECTION_KEY);
  } catch {
    /* ignore */
  }
}

export function sexLabel(sex?: string | null): string {
  if (sex === 'M') return 'Macho';
  if (sex === 'F') return 'Fêmea';
  return '—';
}
