import type {
  BoardingBelongingCategory,
  BoardingBelongingCheckout,
  BoardingBlockStatus,
  BoardingCareBlockKey,
  BoardingCareFeeding,
  BoardingCareHandling,
  BoardingCareMealSlot,
  BoardingCareMedication,
  BoardingCarePlanBlocks,
  BoardingCareWalks,
  BoardingIncidentKind,
  BoardingOpsStay,
  BoardingSeverity,
  BoardingSociability,
  BoardingSpaceKind,
  BoardingSpaceMode,
  BoardingTask,
  BoardingTaskKind,
  BoardingTaskOutcome,
} from '../../api/hubBoardingApi';

// ─── Rótulos ────────────────────────────────────────────────────────────────

export const CARE_BLOCK_LABELS: Record<BoardingCareBlockKey, string> = {
  feeding: 'Alimentação',
  medications: 'Medicação',
  walks: 'Passeios',
  handling: 'Manejo',
  recreation: 'Atividades',
};

export const CARE_MEAL_SLOTS: BoardingCareMealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export const CARE_MEAL_SLOT_LABELS: Record<BoardingCareMealSlot, string> = {
  breakfast: 'Café da manhã',
  lunch: 'Almoço',
  snack: 'Lanche',
  dinner: 'Janta',
};

/** Horário padrão até a unidade configurar o dela. */
export const DEFAULT_MEAL_SLOT_TIMES: Record<BoardingCareMealSlot, string> = {
  breakfast: '08:00',
  lunch: '12:00',
  snack: '16:00',
  dinner: '19:00',
};

/** Ficha permanente / formulário do tutor: sem passeios (atividades vêm da unidade). */
export const PROFILE_BLOCK_KEYS = ['feeding', 'medications', 'handling'] as const;
export type ProfileBlockKey = (typeof PROFILE_BLOCK_KEYS)[number];

/** Blocos do plano na estadia (atividades = recreação da unidade; sem passeios do tutor). */
export function stayCarePlanBlocks(_mode?: string): BoardingCareBlockKey[] {
  return ['feeding', 'medications', 'handling', 'recreation'];
}

export const BLOCK_STATUS_LABELS: Record<BoardingBlockStatus, string> = {
  inherited: 'Herdado',
  confirmed: 'Confirmado',
  overridden: 'Alterado',
  pending: 'Pendente',
};

/** Variante visual do selo (classes `hub-grooming-drawer__stage--*`). */
export function blockStatusVariant(status: BoardingBlockStatus | undefined): string {
  if (status === 'confirmed') return 'done';
  if (status === 'overridden') return 'progress';
  if (status === 'inherited') return 'waiting';
  return 'paused';
}

export const TASK_KIND_LABELS: Record<BoardingTaskKind, string> = {
  feeding: 'Alimentação',
  medication: 'Medicação',
  walk: 'Atividade',
  recreation: 'Atividade',
  custom: 'Tarefa',
};

export const OUTCOMES_BY_KIND: Record<BoardingTaskKind, BoardingTaskOutcome[]> = {
  feeding: ['ate_all', 'ate_partial', 'refused'],
  medication: ['given', 'not_given'],
  walk: ['done', 'not_done'],
  recreation: ['done', 'not_done'],
  custom: ['done', 'not_done'],
};

/** Rótulo curto do botão de resultado. */
export const OUTCOME_BUTTON_LABELS: Record<BoardingTaskOutcome, string> = {
  ate_all: 'Comeu tudo',
  ate_partial: 'Comeu parte',
  refused: 'Recusou',
  given: 'Dada',
  not_given: 'Não dada',
  done: 'Feito',
  not_done: 'Não feito',
};

/** Rótulo do resultado registrado (lista, histórico). */
export const OUTCOME_LABELS: Record<BoardingTaskOutcome, string> = {
  ate_all: 'Comeu tudo',
  ate_partial: 'Comeu parte',
  refused: 'Recusou',
  given: 'Medicação dada',
  not_given: 'Medicação não dada',
  done: 'Feito',
  not_done: 'Não feito',
};

export const BATCH_TASK_KINDS: BoardingTaskKind[] = ['recreation', 'walk', 'custom'];

export function isConcerningOutcome(kind: string, outcome: string | null | undefined): boolean {
  if (!outcome) return false;
  if (kind === 'feeding') return outcome === 'refused' || outcome === 'ate_partial';
  if (kind === 'medication') return outcome === 'not_given';
  return false;
}

export const INCIDENT_KIND_LABELS: Record<BoardingIncidentKind, string> = {
  health: 'Saúde',
  injury: 'Machucado',
  behavior: 'Comportamento',
  feeding: 'Alimentação',
  elimination: 'Fezes / urina',
  escape: 'Fuga',
  property: 'Pertence danificado',
  other: 'Outro',
};

export const SEVERITY_LABELS: Record<BoardingSeverity, string> = {
  low: 'Leve',
  medium: 'Moderada',
  high: 'Grave',
};

export const BELONGING_CATEGORY_LABELS: Record<BoardingBelongingCategory, string> = {
  food: 'Ração',
  medication: 'Medicamento',
  bed: 'Caminha',
  toy: 'Brinquedo',
  leash_collar: 'Guia / coleira',
  clothing: 'Roupa',
  bowl: 'Comedouro',
  other: 'Outro',
};

export const BELONGING_CHECKOUT_LABELS: Record<BoardingBelongingCheckout, string> = {
  pending: 'A devolver',
  returned: 'Devolvido',
  missing: 'Não encontrado',
  consumed: 'Consumido',
};

export const SOCIABILITY_LABELS: Record<BoardingSociability, string> = {
  sociable: 'Sociável',
  selective: 'Seletivo',
  isolated: 'Isolado',
};

export const SPACE_KIND_LABELS: Record<BoardingSpaceKind, string> = {
  kennel: 'Baia',
  suite: 'Suíte',
  room: 'Sala',
  yard: 'Pátio',
  other: 'Outro',
};

export const SPACE_MODE_LABELS: Record<BoardingSpaceMode, string> = {
  hotel: 'Hotel',
  daycare: 'Creche',
  shared: 'Hotel e creche',
};

export function boardingModeLabel(mode: string | null | undefined): string {
  if (mode === 'hotel') return 'Hotel';
  if (mode === 'daycare') return 'Creche';
  return mode ? String(mode) : '—';
}

export function daycarePeriodLabel(period: string | null | undefined): string | null {
  if (period === 'half_day') return 'Meio período';
  if (period === 'full_day') return 'Período integral';
  return null;
}

// ─── Formatação ─────────────────────────────────────────────────────────────

export function formatHm(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDayMonth(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function formatDateTimeShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(reais: number | null | undefined): string {
  return BRL.format(Number(reais) || 0);
}

export function formatCents(cents: number | null | undefined): string {
  return BRL.format((Number(cents) || 0) / 100);
}

/** "123,45" / "123.45" / "R$ 1.234,50" → centavos. Retorna null se vazio/ inválido. */
export function parseBRLToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return '';
  return ((Number(cents) || 0) / 100).toFixed(2).replace('.', ',');
}

export function petInitials(name: string | null | undefined): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

// ─── Tarefas ────────────────────────────────────────────────────────────────

export const TASK_OVERDUE_GRACE_MIN = 30;
/** Janela "Agora" da visão por tarefa. */
export const TASK_NOW_WINDOW_MIN = 60;

export function isTaskOverdue(task: Pick<BoardingTask, 'status' | 'scheduled_for'>, nowMs = Date.now()): boolean {
  if (task.status !== 'pending' || !task.scheduled_for) return false;
  const at = new Date(task.scheduled_for).getTime();
  if (Number.isNaN(at)) return false;
  return nowMs - at > TASK_OVERDUE_GRACE_MIN * 60_000;
}

export type TaskTimeGroups = {
  overdue: BoardingTask[];
  now: BoardingTask[];
  upcoming: BoardingTask[];
  done: BoardingTask[];
};

function byScheduled(a: BoardingTask, b: BoardingTask): number {
  const at = a.scheduled_for ? new Date(a.scheduled_for).getTime() : Number.MAX_SAFE_INTEGER;
  const bt = b.scheduled_for ? new Date(b.scheduled_for).getTime() : Number.MAX_SAFE_INTEGER;
  if (at !== bt) return at - bt;
  return String(a.pet_name ?? '').localeCompare(String(b.pet_name ?? ''), 'pt-BR');
}

/** Visão por tarefa: Atrasadas, Agora (até 1 h à frente), Próximas e Feitas. */
export function groupTasksByTime(tasks: BoardingTask[], nowMs = Date.now()): TaskTimeGroups {
  const out: TaskTimeGroups = { overdue: [], now: [], upcoming: [], done: [] };
  for (const t of tasks) {
    if (t.status !== 'pending') {
      out.done.push(t);
      continue;
    }
    if (isTaskOverdue(t, nowMs)) {
      out.overdue.push(t);
      continue;
    }
    const at = t.scheduled_for ? new Date(t.scheduled_for).getTime() : null;
    if (at == null || at - nowMs <= TASK_NOW_WINDOW_MIN * 60_000) out.now.push(t);
    else out.upcoming.push(t);
  }
  out.overdue.sort(byScheduled);
  out.now.sort(byScheduled);
  out.upcoming.sort(byScheduled);
  out.done.sort((a, b) => String(b.executed_at ?? '').localeCompare(String(a.executed_at ?? '')));
  return out;
}

/** Recreação, passeio e tarefas avulsas podem ser registradas em lote; alimentação e medicação não. */
export function isBatchEligible(task: Pick<BoardingTask, 'kind' | 'status'>): boolean {
  return task.status === 'pending' && BATCH_TASK_KINDS.includes(task.kind);
}

export function taskResultLabel(task: Pick<BoardingTask, 'status' | 'outcome'>): string | null {
  if (task.status === 'skipped') return 'Não se aplica';
  if (task.status === 'done' && task.outcome) return OUTCOME_LABELS[task.outcome] ?? 'Feito';
  return null;
}

// ─── Painel ─────────────────────────────────────────────────────────────────

export type StayFilter = 'all' | 'attention' | 'hotel' | 'daycare' | 'arrivals' | 'departures';

export function stayMatchesFilter(stay: BoardingOpsStay, filter: StayFilter): boolean {
  const active = stay.stage === 'reserved' || stay.stage === 'checked_in';
  switch (filter) {
    case 'attention':
      return active && stay.attention.length > 0;
    case 'hotel':
      return active && stay.mode === 'hotel';
    case 'daycare':
      return active && stay.mode === 'daycare';
    case 'arrivals':
      return stay.is_arrival;
    case 'departures':
      return stay.is_departure;
    default:
      return stay.stage !== 'cancelled' && stay.stage !== 'no_show';
  }
}

export function stayMatchesSearch(stay: BoardingOpsStay, q: string): boolean {
  const term = q.trim().toLocaleLowerCase('pt-BR');
  if (!term) return true;
  return [stay.pet?.name, stay.guardian?.full_name, stay.space?.name]
    .filter(Boolean)
    .some((v) => String(v).toLocaleLowerCase('pt-BR').includes(term));
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const STAGE_RANK: Record<string, number> = { checked_in: 0, reserved: 1, checked_out: 2 };

function stayAttentionRank(stay: BoardingOpsStay): number {
  if (!stay.attention.length) return 3;
  return Math.min(...stay.attention.map((a) => SEVERITY_RANK[a.severity] ?? 2));
}

/** Presentes primeiro; dentro do grupo, quem precisa de atenção (mais grave primeiro). */
export function sortStays(stays: BoardingOpsStay[]): BoardingOpsStay[] {
  return [...stays].sort((a, b) => {
    const sa = STAGE_RANK[a.stage] ?? 3;
    const sb = STAGE_RANK[b.stage] ?? 3;
    if (sa !== sb) return sa - sb;
    const ra = stayAttentionRank(a);
    const rb = stayAttentionRank(b);
    if (ra !== rb) return ra - rb;
    return String(a.pet?.name ?? '').localeCompare(String(b.pet?.name ?? ''), 'pt-BR');
  });
}

export function stayStageLabel(stage: string): string {
  if (stage === 'reserved') return 'Previsto';
  if (stage === 'checked_in') return 'Hospedado';
  if (stage === 'checked_out') return 'Saiu';
  if (stage === 'cancelled') return 'Cancelado';
  if (stage === 'no_show') return 'Não compareceu';
  return stage;
}

export function stayStageVariant(stage: string): string {
  if (stage === 'checked_in') return 'progress';
  if (stage === 'reserved') return 'waiting';
  if (stage === 'checked_out') return 'done';
  return 'neutral';
}

/** Mensagem do backend quando a capacidade está cheia e a política é "alertar". */
export function isCapacityWarningError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? '');
  return /Confirme para continuar/i.test(msg) || /CAPACITY_WARNING/i.test(msg);
}

/** Política "bloquear": não oferece "confirmar mesmo assim". */
export function isCapacityBlockedError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? '');
  return /Check-in bloqueado/i.test(msg) || /CAPACITY_BLOCKED/i.test(msg);
}

// ─── Ficha e plano ──────────────────────────────────────────────────────────

export function emptyPlanBlocks(): BoardingCarePlanBlocks {
  return { feeding: null, medications: null, walks: null, handling: null, recreation: null };
}

export function summarizeFeeding(f: BoardingCareFeeding | null | undefined): string | null {
  if (!f) return null;
  if (f.feeds_on_site === false) return 'Não come no estabelecimento';
  const parts: string[] = [];
  if (f.food_name) parts.push(f.food_name);
  else if (f.food_source === 'own') parts.push('Ração do tutor');
  else if (f.food_source === 'house') parts.push('Ração da casa');
  const meals = f.meals ?? [];
  if (meals.length) {
    parts.push(
      meals
        .map((m) => {
          const label =
            m.slot && CARE_MEAL_SLOT_LABELS[m.slot]
              ? CARE_MEAL_SLOT_LABELS[m.slot]
              : m.time || 'Refeição';
          return m.amount ? `${label} (${m.amount})` : label;
        })
        .join(', '),
    );
  }
  if (f.restrictions) parts.push(`Restrições: ${f.restrictions}`);
  return parts.length ? parts.join(' · ') : null;
}

export function summarizeMedications(list: BoardingCareMedication[] | null | undefined): string | null {
  if (!list || !list.length) return list && list.length === 0 ? 'Sem medicação' : null;
  return list
    .map((m) => {
      const bits = [m.name];
      if (m.dose) bits.push(m.dose);
      if (m.times?.length) bits.push(m.times.join(', '));
      return bits.join(' · ');
    })
    .join('; ');
}

export function summarizeWalks(w: BoardingCareWalks | null | undefined): string | null {
  if (!w) return null;
  const parts: string[] = [];
  if (w.times?.length) parts.push(w.times.join(', '));
  if (w.notes) parts.push(w.notes);
  return parts.length ? parts.join(' · ') : null;
}

export function summarizeHandling(h: BoardingCareHandling | null | undefined): string | null {
  if (!h) return null;
  const parts: string[] = [];
  if (h.sociability) parts.push(SOCIABILITY_LABELS[h.sociability]);
  if (h.group_play_allowed === false) parts.push('Sem recreação em grupo');
  if (h.contact_restrictions) parts.push(h.contact_restrictions);
  if (h.special_care) parts.push(h.special_care);
  return parts.length ? parts.join(' · ') : null;
}

export function summarizeBlock(key: BoardingCareBlockKey, blocks: Partial<BoardingCarePlanBlocks>): string | null {
  switch (key) {
    case 'feeding':
      return summarizeFeeding(blocks.feeding);
    case 'medications':
      return summarizeMedications(blocks.medications);
    case 'walks':
      return summarizeWalks(blocks.walks);
    case 'handling':
      return summarizeHandling(blocks.handling);
    case 'recreation': {
      const r = blocks.recreation;
      if (!r) return null;
      if (r.allowed === false) return 'Não participa das atividades';
      return r.times?.length ? r.times.join(', ') : 'Segue as atividades da unidade';
    }
    default:
      return null;
  }
}

/**
 * `hub_boarding_tasks.details` é jsonb (objeto). A UI tipa como string — nunca renderize o valor cru.
 * `{}` é truthy e quebra o React com "Objects are not valid as a React child".
 */
export function formatBoardingTaskDetails(details: unknown): string | null {
  if (details == null) return null;
  if (typeof details === 'string') {
    const t = details.trim();
    return t || null;
  }
  if (typeof details !== 'object' || Array.isArray(details)) return null;
  const d = details as Record<string, unknown>;
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
    else if (typeof v === 'number' && Number.isFinite(v)) parts.push(String(v));
  };
  push(d.food_name);
  push(d.amount);
  push(d.dose);
  push(d.instructions);
  push(d.notes);
  push(d.restrictions);
  if (parts.length === 0) {
    for (const [k, v] of Object.entries(d)) {
      if (k === 'slot' || k === 'food_source' || k === 'name') continue;
      push(v);
    }
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Manejo que exige atenção visível no card (isolado, sem grupo, restrições). */
export function handlingNeedsAttention(h: BoardingCareHandling | null | undefined): boolean {
  if (!h) return false;
  return (
    h.sociability === 'isolated' ||
    h.group_play_allowed === false ||
    (typeof h.contact_restrictions === 'string' && Boolean(h.contact_restrictions.trim()))
  );
}

export function tutorLinkUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}
