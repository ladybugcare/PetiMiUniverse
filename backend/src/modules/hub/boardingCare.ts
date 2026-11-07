/**
 * Regras puras de Hotel & Creche: ficha de cuidados → plano da estadia → tarefas,
 * pendências, atenção, relatório ao tutor e linha do tempo.
 * Sem acesso a banco: tudo aqui é testável isoladamente.
 */
import { boardingLocalParts } from './boardingBilling';

// ─── Tipos ────────────────────────────────────────────────────────────────

export type CareMeal = { time: string; amount?: string | null; notes?: string | null };
export type CareFeeding = {
  food_source?: 'own' | 'house' | null;
  food_name?: string | null;
  meals?: CareMeal[];
  restrictions?: string | null;
};
export type CareMedication = {
  name: string;
  dose?: string | null;
  times?: string[];
  instructions?: string | null;
};
export type CareWalks = { times?: string[]; notes?: string | null };
export type CareHandling = {
  sociability?: 'sociable' | 'selective' | 'isolated' | null;
  group_play_allowed?: boolean | null;
  contact_restrictions?: string | null;
  special_care?: string | null;
};
export type CareRecreation = { allowed?: boolean | null; times?: string[] };

export type CareProfileBlocks = {
  feeding: CareFeeding | null;
  medications: CareMedication[] | null;
  walks: CareWalks | null;
  handling: CareHandling | null;
};

export type CarePlanBlocks = CareProfileBlocks & { recreation: CareRecreation | null };

export const CARE_BLOCK_KEYS = ['feeding', 'medications', 'walks', 'handling', 'recreation'] as const;
export type CareBlockKey = (typeof CARE_BLOCK_KEYS)[number];
export const PROFILE_BLOCK_KEYS = ['feeding', 'medications', 'walks', 'handling'] as const;
export type ProfileBlockKey = (typeof PROFILE_BLOCK_KEYS)[number];

/** Blocos que precisam estar confirmados para a estadia ficar "pronta". */
export const ESSENTIAL_BLOCKS: CareBlockKey[] = ['feeding', 'medications', 'handling'];

export type BlockStatus = 'inherited' | 'confirmed' | 'overridden' | 'pending';
export type BlockStatusMap = Partial<Record<CareBlockKey, BlockStatus>>;

export const BLOCK_LABELS: Record<CareBlockKey, string> = {
  feeding: 'Alimentação',
  medications: 'Medicação',
  walks: 'Passeios',
  handling: 'Manejo',
  recreation: 'Recreação',
};

// ─── Normalização ─────────────────────────────────────────────────────────

const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeTime(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, 5);
  return HM_RE.test(t) ? t : null;
}

function normalizeTimes(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = v.map(normalizeTime).filter((t): t is string => Boolean(t));
  return [...new Set(out)].sort();
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

export function normalizeFeeding(v: unknown): CareFeeding | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const meals = Array.isArray(o.meals)
    ? (o.meals as unknown[])
        .map((m) => {
          const mm = (m ?? {}) as Record<string, unknown>;
          const time = normalizeTime(mm.time);
          if (!time) return null;
          return { time, amount: str(mm.amount), notes: str(mm.notes) };
        })
        .filter((m): m is { time: string; amount: string | null; notes: string | null } => m != null)
        .sort((a, b) => a.time.localeCompare(b.time))
    : [];
  const src = o.food_source === 'own' || o.food_source === 'house' ? o.food_source : null;
  return { food_source: src, food_name: str(o.food_name), meals, restrictions: str(o.restrictions) };
}

export function normalizeMedications(v: unknown): CareMedication[] | null {
  if (v == null) return null;
  if (!Array.isArray(v)) return null;
  return v
    .map((m) => {
      const mm = (m ?? {}) as Record<string, unknown>;
      const name = str(mm.name);
      if (!name) return null;
      return {
        name,
        dose: str(mm.dose),
        times: normalizeTimes(mm.times),
        instructions: str(mm.instructions),
      };
    })
    .filter((m): m is NonNullable<typeof m> => m != null);
}

export function normalizeWalks(v: unknown): CareWalks | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return { times: normalizeTimes(o.times), notes: str(o.notes) };
}

export function normalizeHandling(v: unknown): CareHandling | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const soc =
    o.sociability === 'sociable' || o.sociability === 'selective' || o.sociability === 'isolated'
      ? o.sociability
      : null;
  return {
    sociability: soc,
    group_play_allowed: typeof o.group_play_allowed === 'boolean' ? o.group_play_allowed : null,
    contact_restrictions: str(o.contact_restrictions),
    special_care: str(o.special_care),
  };
}

export function normalizeRecreation(v: unknown): CareRecreation | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return {
    allowed: typeof o.allowed === 'boolean' ? o.allowed : null,
    times: normalizeTimes(o.times),
  };
}

export function normalizeBlock(key: CareBlockKey, v: unknown): unknown {
  switch (key) {
    case 'feeding':
      return normalizeFeeding(v);
    case 'medications':
      return normalizeMedications(v);
    case 'walks':
      return normalizeWalks(v);
    case 'handling':
      return normalizeHandling(v);
    case 'recreation':
      return normalizeRecreation(v);
  }
}

export function normalizeProfileBlocks(raw: Record<string, unknown> | null | undefined): CareProfileBlocks {
  return {
    feeding: normalizeFeeding(raw?.feeding),
    medications: normalizeMedications(raw?.medications),
    walks: normalizeWalks(raw?.walks),
    handling: normalizeHandling(raw?.handling),
  };
}

export function normalizePlanBlocks(raw: Record<string, unknown> | null | undefined): CarePlanBlocks {
  return { ...normalizeProfileBlocks(raw), recreation: normalizeRecreation(raw?.recreation) };
}

/** Bloco sem informação útil (equivale a "não informado"). */
export function isBlockEmpty(key: CareBlockKey, v: unknown): boolean {
  if (v == null) return true;
  switch (key) {
    case 'feeding': {
      const f = v as CareFeeding;
      return !(f.meals?.length || f.food_name || f.restrictions || f.food_source);
    }
    case 'medications':
      return !Array.isArray(v);
    case 'walks': {
      const w = v as CareWalks;
      return !(w.times?.length || w.notes);
    }
    case 'handling': {
      const h = v as CareHandling;
      return !(h.sociability || h.group_play_allowed != null || h.contact_restrictions || h.special_care);
    }
    case 'recreation':
      return (v as CareRecreation).allowed == null;
  }
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export function blocksEqual(key: CareBlockKey, a: unknown, b: unknown): boolean {
  return stableStringify(normalizeBlock(key, a)) === stableStringify(normalizeBlock(key, b));
}

// ─── Herança: ficha → plano ───────────────────────────────────────────────

function recreationFromHandling(h: CareHandling | null): CareRecreation | null {
  if (!h || h.group_play_allowed == null) return null;
  return { allowed: h.group_play_allowed, times: [] };
}

/** Plano inicial a partir da ficha: o que existe vem "herdado", o resto fica "pendente". */
export function buildPlanFromProfile(profile: CareProfileBlocks | null): {
  blocks: CarePlanBlocks;
  block_status: BlockStatusMap;
} {
  const p = profile ?? { feeding: null, medications: null, walks: null, handling: null };
  const blocks: CarePlanBlocks = {
    feeding: p.feeding,
    medications: p.medications,
    walks: p.walks,
    handling: p.handling,
    recreation: recreationFromHandling(p.handling),
  };
  const block_status: BlockStatusMap = {};
  for (const key of CARE_BLOCK_KEYS) {
    block_status[key] = isBlockEmpty(key, blocks[key]) ? 'pending' : 'inherited';
  }
  return { blocks, block_status };
}

/**
 * Aplica a edição da recepção no plano.
 * - Bloco vazio → pendente.
 * - Diferente da ficha → alterado (só nesta estadia; conta como confirmado).
 * - Igual à ficha → confirmado se a recepção confirmou, senão mantém o estado anterior.
 */
export function applyPlanEdit(args: {
  current: CarePlanBlocks;
  currentStatus: BlockStatusMap;
  patch: Partial<Record<CareBlockKey, unknown>>;
  profile: CareProfileBlocks | null;
  confirmBlocks: CareBlockKey[];
}): { blocks: CarePlanBlocks; block_status: BlockStatusMap } {
  const blocks: CarePlanBlocks = { ...args.current };
  const status: BlockStatusMap = { ...args.currentStatus };
  const confirm = new Set(args.confirmBlocks);
  const profileRec = recreationFromHandling(args.profile?.handling ?? null);

  for (const key of CARE_BLOCK_KEYS) {
    const touched = Object.prototype.hasOwnProperty.call(args.patch, key);
    if (touched) {
      (blocks as Record<string, unknown>)[key] = normalizeBlock(key, args.patch[key]);
    }
    const value = blocks[key];
    if (isBlockEmpty(key, value)) {
      status[key] = 'pending';
      continue;
    }
    const base =
      key === 'recreation' ? profileRec : (args.profile as Record<string, unknown> | null)?.[key] ?? null;
    const baseEmpty = isBlockEmpty(key, base);
    const sameAsProfile =
      !baseEmpty &&
      (key === 'recreation'
        ? (value as CareRecreation).allowed === (base as CareRecreation).allowed
        : blocksEqual(key, value, base));

    if (!sameAsProfile) {
      // Ficha vazia: o que a recepção informou já vale como confirmado.
      if (baseEmpty) status[key] = touched || confirm.has(key) || !status[key] ? 'confirmed' : status[key];
      else if (touched || status[key] === 'overridden' || !status[key]) status[key] = 'overridden';
    } else if (confirm.has(key) || status[key] === 'confirmed') {
      status[key] = 'confirmed';
    } else {
      status[key] = 'inherited';
    }
  }
  return { blocks, block_status: status };
}

export type PlanPendency = { block: CareBlockKey; kind: 'missing' | 'unconfirmed'; label: string };

/** Pendências dos blocos essenciais (sem plano = tudo pendente). */
export function computePlanPendencies(
  plan: { block_status?: BlockStatusMap | null } | null,
  mode: 'hotel' | 'daycare' | string = 'hotel',
): PlanPendency[] {
  const st = plan?.block_status ?? {};
  const essentials: CareBlockKey[] =
    mode === 'daycare' ? ['feeding', 'medications', 'handling'] : ESSENTIAL_BLOCKS;
  const out: PlanPendency[] = [];
  for (const key of essentials) {
    const s = plan ? st[key] ?? 'pending' : 'pending';
    if (s === 'pending') out.push({ block: key, kind: 'missing', label: PENDENCY_LABELS[key].missing });
    else if (s === 'inherited') out.push({ block: key, kind: 'unconfirmed', label: PENDENCY_LABELS[key].unconfirmed });
  }
  return out;
}

const PENDENCY_LABELS: Record<CareBlockKey, { missing: string; unconfirmed: string }> = {
  feeding: { missing: 'Alimentação não informada', unconfirmed: 'Alimentação não confirmada' },
  medications: { missing: 'Medicação não informada', unconfirmed: 'Medicação não confirmada' },
  walks: { missing: 'Passeios não informados', unconfirmed: 'Passeios não confirmados' },
  handling: { missing: 'Manejo não informado', unconfirmed: 'Manejo não confirmado' },
  recreation: { missing: 'Recreação não definida', unconfirmed: 'Recreação não confirmada' },
};

// ─── Geração de tarefas ───────────────────────────────────────────────────

export type BoardingTaskKind = 'feeding' | 'medication' | 'walk' | 'recreation' | 'custom';

export type TaskSpec = {
  kind: BoardingTaskKind;
  title: string;
  details: Record<string, unknown>;
  scheduled_for: string;
  task_date: string;
  plan_key: string;
};

export type RecreationWindow = { start: string; end?: string | null; label?: string | null };

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Instante ISO de HH:MM em uma data local de São Paulo (UTC-3). */
export function localDateTimeToIso(ymd: string, hm: string): string {
  return new Date(`${ymd}T${hm}:00-03:00`).toISOString();
}

const MAX_TASK_DAYS = 60;

/**
 * Tarefas desejadas para a estadia: cada item do plano em cada dia, dentro da janela [start, end].
 * Recreação só entra se o plano permitir; sem horários próprios usa os horários da unidade.
 */
export function generatePlanTasks(args: {
  plan: CarePlanBlocks;
  start: string;
  end: string | null;
  recreationWindows?: RecreationWindow[];
}): TaskSpec[] {
  const startParts = boardingLocalParts(args.start);
  if (!startParts) return [];
  const startMs = new Date(args.start).getTime();
  const endIso = args.end ?? new Date(startMs + 24 * 3600_000).toISOString();
  const endMs = new Date(endIso).getTime();
  const endParts = boardingLocalParts(endIso);
  if (!endParts || endMs < startMs) return [];

  const specs: TaskSpec[] = [];
  const push = (ymd: string, hm: string, s: Omit<TaskSpec, 'scheduled_for' | 'task_date'>) => {
    const iso = localDateTimeToIso(ymd, hm);
    const t = new Date(iso).getTime();
    if (t < startMs || t > endMs) return;
    specs.push({ ...s, scheduled_for: iso, task_date: ymd });
  };

  const { feeding, medications, walks, recreation } = args.plan;
  let ymd = startParts.ymd;
  for (let i = 0; i <= MAX_TASK_DAYS && ymd <= endParts.ymd; i++, ymd = addDaysYmd(ymd, 1)) {
    (feeding?.meals ?? []).forEach((meal, idx) => {
      push(ymd, meal.time, {
        kind: 'feeding',
        title: `Refeição das ${meal.time}`,
        plan_key: `feeding:${idx}:${meal.time}`,
        details: {
          amount: meal.amount ?? null,
          notes: meal.notes ?? null,
          food_name: feeding?.food_name ?? null,
          food_source: feeding?.food_source ?? null,
          restrictions: feeding?.restrictions ?? null,
        },
      });
    });
    (medications ?? []).forEach((med, idx) => {
      for (const time of med.times ?? []) {
        push(ymd, time, {
          kind: 'medication',
          title: med.dose ? `${med.name} — ${med.dose}` : med.name,
          plan_key: `medication:${idx}:${time}`,
          details: { name: med.name, dose: med.dose ?? null, instructions: med.instructions ?? null },
        });
      }
    });
    for (const time of walks?.times ?? []) {
      push(ymd, time, {
        kind: 'walk',
        title: `Passeio das ${time}`,
        plan_key: `walk:${time}`,
        details: { notes: walks?.notes ?? null },
      });
    }
    if (recreation?.allowed) {
      const own = recreation.times ?? [];
      const times = own.length
        ? own.map((t) => ({ start: t, label: null as string | null }))
        : (args.recreationWindows ?? [])
            .map((w) => ({ start: normalizeTime(w.start), label: w.label ?? null }))
            .filter((w): w is { start: string; label: string | null } => Boolean(w.start));
      for (const w of times) {
        push(ymd, w.start, {
          kind: 'recreation',
          title: w.label ? `Recreação — ${w.label}` : `Recreação das ${w.start}`,
          plan_key: `recreation:${w.start}`,
          details: {},
        });
      }
    }
  }
  return specs.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
}

export type ExistingTaskRow = {
  id: string;
  plan_key: string | null;
  task_date: string;
  status: string;
  source: string;
  title: string;
  scheduled_for: string | null;
  details?: Record<string, unknown> | null;
};

/**
 * Reconciliação plano × tarefas existentes. Executadas nunca mudam.
 * Pendentes geradas pelo plano são atualizadas ou removidas quando o plano mudar.
 */
export function diffPlanTasks(
  existing: ExistingTaskRow[],
  desired: TaskSpec[],
): { toInsert: TaskSpec[]; toUpdate: Array<{ id: string; spec: TaskSpec }>; toDelete: string[] } {
  const key = (k: string | null, d: string) => `${k}|${d}`;
  const byKey = new Map<string, ExistingTaskRow>();
  for (const t of existing) {
    if (t.source === 'plan' && t.plan_key) byKey.set(key(t.plan_key, t.task_date), t);
  }
  const desiredKeys = new Set<string>();
  const toInsert: TaskSpec[] = [];
  const toUpdate: Array<{ id: string; spec: TaskSpec }> = [];
  for (const spec of desired) {
    const k = key(spec.plan_key, spec.task_date);
    desiredKeys.add(k);
    const row = byKey.get(k);
    if (!row) {
      toInsert.push(spec);
      continue;
    }
    if (row.status !== 'pending') continue;
    const changed =
      row.title !== spec.title ||
      (row.scheduled_for ? new Date(row.scheduled_for).toISOString() : null) !== spec.scheduled_for ||
      stableStringify(row.details ?? {}) !== stableStringify(spec.details);
    if (changed) toUpdate.push({ id: row.id, spec });
  }
  const toDelete = existing
    .filter((t) => t.source === 'plan' && t.status === 'pending' && t.plan_key)
    .filter((t) => !desiredKeys.has(key(t.plan_key, t.task_date)))
    .map((t) => t.id);
  return { toInsert, toUpdate, toDelete };
}

// ─── Execução ─────────────────────────────────────────────────────────────

export const OUTCOMES_BY_KIND: Record<BoardingTaskKind, string[]> = {
  feeding: ['ate_all', 'ate_partial', 'refused'],
  medication: ['given', 'not_given'],
  walk: ['done', 'not_done'],
  recreation: ['done', 'not_done'],
  custom: ['done', 'not_done'],
};

export const OUTCOME_LABELS: Record<string, string> = {
  ate_all: 'Comeu tudo',
  ate_partial: 'Comeu parte',
  refused: 'Recusou',
  given: 'Medicação dada',
  not_given: 'Medicação não dada',
  done: 'Feito',
  not_done: 'Não feito',
};

export function isValidOutcome(kind: string, outcome: string): boolean {
  return (OUTCOMES_BY_KIND[kind as BoardingTaskKind] ?? []).includes(outcome);
}

/** Atividades coletivas aceitas no registro em lote. Alimentação e medicação são sempre individuais. */
export const BATCH_TASK_KINDS: BoardingTaskKind[] = ['recreation', 'walk', 'custom'];

/** Resultado que merece atenção da equipe. */
export function isConcerningOutcome(kind: string, outcome: string | null | undefined): boolean {
  if (!outcome) return false;
  if (kind === 'feeding') return outcome === 'refused' || outcome === 'ate_partial';
  if (kind === 'medication') return outcome === 'not_given';
  return false;
}

/** Tolerância antes de uma tarefa pendente contar como atrasada. */
export const TASK_OVERDUE_GRACE_MIN = 30;

export function isTaskOverdue(
  t: { status: string; scheduled_for: string | null },
  nowMs: number = Date.now(),
): boolean {
  if (t.status !== 'pending' || !t.scheduled_for) return false;
  return new Date(t.scheduled_for).getTime() + TASK_OVERDUE_GRACE_MIN * 60_000 < nowMs;
}

/** Recreação coletiva exige manejo liberado. */
export function canJoinGroupRecreation(handling: CareHandling | null | undefined): boolean {
  if (!handling) return true;
  if (handling.group_play_allowed === false) return false;
  if (handling.sociability === 'isolated') return false;
  return true;
}

// ─── Atenção ──────────────────────────────────────────────────────────────

export type AttentionReason = {
  key: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
};

export function computeAttention(args: {
  stage: string;
  pendencies: PlanPendency[];
  tutorSubmissionPending?: boolean;
  openIncidents: Array<{ severity: string }>;
  tasks: Array<{ kind: string; status: string; scheduled_for: string | null; outcome?: string | null }>;
  isLate?: boolean;
  missingBelongings?: number;
  nowMs?: number;
}): AttentionReason[] {
  const now = args.nowMs ?? Date.now();
  const out: AttentionReason[] = [];
  const active = args.stage === 'checked_in';
  const upcoming = args.stage === 'reserved';

  if (args.openIncidents.length) {
    const high = args.openIncidents.some((i) => i.severity === 'high');
    const n = args.openIncidents.length;
    out.push({
      key: 'incident',
      label: n === 1 ? 'Intercorrência aberta' : `${n} intercorrências abertas`,
      severity: high ? 'high' : 'medium',
    });
  }
  if (active) {
    const overdueMed = args.tasks.filter((t) => t.kind === 'medication' && isTaskOverdue(t, now)).length;
    const overdueOther = args.tasks.filter((t) => t.kind !== 'medication' && isTaskOverdue(t, now)).length;
    if (overdueMed) out.push({ key: 'medication_overdue', label: 'Medicação atrasada', severity: 'high' });
    if (overdueOther)
      out.push({
        key: 'task_overdue',
        label: overdueOther === 1 ? '1 tarefa atrasada' : `${overdueOther} tarefas atrasadas`,
        severity: 'medium',
      });
    if (args.tasks.some((t) => t.kind === 'medication' && t.outcome === 'not_given'))
      out.push({ key: 'medication_not_given', label: 'Medicação não dada', severity: 'high' });
    if (args.tasks.some((t) => t.kind === 'feeding' && t.outcome === 'refused'))
      out.push({ key: 'feeding_refused', label: 'Recusou refeição', severity: 'medium' });
    else if (args.tasks.some((t) => t.kind === 'feeding' && t.outcome === 'ate_partial'))
      out.push({ key: 'feeding_partial', label: 'Comeu parte', severity: 'low' });
    if (args.isLate) out.push({ key: 'late_checkout', label: 'Saída prevista passou', severity: 'medium' });
  }
  if (active || upcoming) {
    if (args.pendencies.length) {
      out.push({
        key: 'plan_pending',
        label:
          args.pendencies.length === 1
            ? args.pendencies[0].label
            : `${args.pendencies.length} cuidados sem confirmação`,
        severity: active ? 'medium' : 'low',
      });
    }
    if (args.tutorSubmissionPending)
      out.push({ key: 'tutor_submission', label: 'Tutor enviou cuidados para revisar', severity: 'low' });
  }
  if (args.missingBelongings)
    out.push({ key: 'belongings_missing', label: 'Pertence não encontrado na saída', severity: 'medium' });

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ─── Relatório ao tutor ───────────────────────────────────────────────────

export type ReportTask = {
  kind: string;
  title: string;
  status: string;
  outcome: string | null;
  task_date: string;
  scheduled_for: string | null;
  last_notes?: string | null;
};

export type ReportIncident = {
  description: string;
  severity: string;
  status: string;
  occurred_at: string;
  action_taken?: string | null;
};

function hmFromIso(iso: string | null): string {
  if (!iso) return '';
  const p = boardingLocalParts(iso);
  if (!p) return '';
  const h = Math.floor(p.minutes / 60);
  const m = p.minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function brDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

function feedingLine(tasks: ReportTask[]): string | null {
  const feeds = tasks.filter((t) => t.kind === 'feeding' && t.status === 'done');
  if (!feeds.length) return null;
  const all = feeds.filter((t) => t.outcome === 'ate_all').length;
  const partial = feeds.filter((t) => t.outcome === 'ate_partial').length;
  const refused = feeds.filter((t) => t.outcome === 'refused').length;
  if (all === feeds.length) {
    return feeds.length === 1 ? 'Alimentação: comeu tudo.' : `Alimentação: comeu tudo nas ${feeds.length} refeições.`;
  }
  const parts = [
    all ? `comeu tudo em ${all}` : null,
    partial ? `comeu parte em ${partial}` : null,
    refused ? `recusou ${refused}` : null,
  ].filter(Boolean);
  return `Alimentação: ${parts.join(', ')}.`;
}

/**
 * Texto do relatório ao tutor, derivado da operação (não é um formulário à parte).
 * Usa só o que foi registrado; tarefas pendentes não aparecem.
 */
export function buildTutorReportText(args: {
  kind: 'daily' | 'stay_summary' | 'pickup';
  petName: string;
  guardianFirstName?: string | null;
  clinicName?: string | null;
  reportDate?: string | null;
  tasks: ReportTask[];
  incidents: ReportIncident[];
  photoUrls?: string[];
  extraNote?: string | null;
}): string {
  const tasks = args.reportDate ? args.tasks.filter((t) => t.task_date === args.reportDate) : args.tasks;
  const incidents = args.reportDate
    ? args.incidents.filter((i) => boardingLocalParts(i.occurred_at)?.ymd === args.reportDate)
    : args.incidents;
  const lines: string[] = [];
  const hello = args.guardianFirstName ? `Olá, ${args.guardianFirstName}!` : 'Olá!';

  if (args.kind === 'pickup') {
    lines.push(`${hello} ${args.petName} está pronto(a) para voltar para casa.`);
  } else if (args.kind === 'stay_summary') {
    lines.push(`${hello} Segue o resumo da estadia do(a) ${args.petName}.`);
  } else {
    const when = args.reportDate ? ` de ${brDate(args.reportDate)}` : '';
    lines.push(`${hello} Como foi o dia${when} do(a) ${args.petName}:`);
  }

  const feed = feedingLine(tasks);
  if (feed) lines.push(feed);

  const meds = tasks.filter((t) => t.kind === 'medication' && t.status === 'done');
  if (meds.length) {
    const given = meds.filter((t) => t.outcome === 'given');
    const missed = meds.filter((t) => t.outcome === 'not_given');
    if (given.length) {
      const times = given.map((t) => hmFromIso(t.scheduled_for)).filter(Boolean);
      lines.push(`Medicação: dada${times.length ? ` às ${times.join(', ')}` : ''}.`);
    }
    if (missed.length) {
      const notes = missed.map((t) => t.last_notes).filter(Boolean);
      lines.push(`Medicação não dada${notes.length ? `: ${notes.join('; ')}` : ''}.`);
    }
  }

  const walks = tasks.filter((t) => t.kind === 'walk' && t.outcome === 'done').length;
  if (walks) lines.push(`Passeios: ${walks}.`);
  const rec = tasks.filter((t) => t.kind === 'recreation' && t.outcome === 'done').length;
  if (rec) lines.push(`Recreação: participou de ${rec === 1 ? '1 atividade' : `${rec} atividades`}.`);

  for (const inc of incidents) {
    const text = inc.description.replace(/[.\s]+$/, '');
    const action = inc.action_taken ? ` — ${inc.action_taken.replace(/[.\s]+$/, '')}` : '';
    const status = inc.status === 'resolved' ? ' (resolvido)' : '';
    lines.push(`Observação: ${text}${action}${status}.`);
  }

  const photos = (args.photoUrls ?? []).slice(0, 6);
  if (photos.length) lines.push(`Fotos:\n${photos.join('\n')}`);
  if (args.extraNote?.trim()) lines.push(args.extraNote.trim());

  if (lines.length === 1 && args.kind !== 'pickup') lines.push('Tudo tranquilo por aqui.');
  if (args.clinicName) lines.push(`— ${args.clinicName}`);
  return lines.join('\n');
}

// ─── Passagem de turno ────────────────────────────────────────────────────

export type HandoffSnapshot = {
  generated_at: string;
  present_count: number;
  attention: Array<{ pet_name: string; reasons: string[] }>;
  pending_tasks: Array<{ pet_name: string; title: string; scheduled_for: string | null; overdue: boolean }>;
  open_incidents: Array<{ pet_name: string; description: string; severity: string }>;
};

export function buildHandoffSnapshot(args: {
  nowIso: string;
  stays: Array<{
    pet_name: string;
    stage: string;
    attention: AttentionReason[];
  }>;
  tasks: Array<{ pet_name: string; title: string; scheduled_for: string | null; status: string }>;
  incidents: Array<{ pet_name: string; description: string; severity: string; status: string }>;
  horizonHours?: number;
}): HandoffSnapshot {
  const now = new Date(args.nowIso).getTime();
  const horizon = now + (args.horizonHours ?? 8) * 3600_000;
  return {
    generated_at: args.nowIso,
    present_count: args.stays.filter((s) => s.stage === 'checked_in').length,
    attention: args.stays
      .filter((s) => s.attention.length)
      .map((s) => ({ pet_name: s.pet_name, reasons: s.attention.map((a) => a.label) })),
    pending_tasks: args.tasks
      .filter((t) => t.status === 'pending')
      .filter((t) => !t.scheduled_for || new Date(t.scheduled_for).getTime() <= horizon)
      .map((t) => ({
        pet_name: t.pet_name,
        title: t.title,
        scheduled_for: t.scheduled_for,
        overdue: isTaskOverdue(t, now),
      }))
      .sort((a, b) => (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? '')),
    open_incidents: args.incidents
      .filter((i) => i.status === 'open')
      .map((i) => ({ pet_name: i.pet_name, description: i.description, severity: i.severity })),
  };
}

// ─── Linha do tempo ───────────────────────────────────────────────────────

export type TimelineEntry = {
  id: string;
  at: string;
  type:
    | 'reservation'
    | 'task'
    | 'incident'
    | 'incident_resolved'
    | 'photo'
    | 'tutor_report'
    | 'belonging'
    | 'legacy_log';
  title: string;
  detail?: string | null;
  severity?: string | null;
  photo_url?: string | null;
  actor_user_id?: string | null;
};

export function buildBoardingTimeline(src: {
  reservation: {
    id: string;
    created_at?: string | null;
    checked_in_at?: string | null;
    checked_out_at?: string | null;
    mode: string;
  };
  executions: Array<{
    id: string;
    executed_at: string;
    outcome: string | null;
    undone?: boolean;
    notes?: string | null;
    task_title: string;
    executed_by_user_id?: string | null;
  }>;
  incidents: Array<{
    id: string;
    occurred_at: string;
    description: string;
    severity: string;
    resolved_at?: string | null;
    resolution_notes?: string | null;
    created_by_user_id?: string | null;
  }>;
  media: Array<{ id: string; created_at: string; url: string; caption?: string | null; created_by_user_id?: string | null }>;
  tutorReports: Array<{ id: string; sent_at: string; kind: string; sent_by_user_id?: string | null }>;
  belongings?: Array<{ id: string; created_at: string; description: string; quantity: number }>;
  legacyLogs?: Array<{ id: string; log_date: string; notes?: string | null; created_at?: string | null }>;
}): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const r = src.reservation;
  const label = r.mode === 'daycare' ? 'creche' : 'hospedagem';
  if (r.created_at) out.push({ id: `res-created-${r.id}`, at: r.created_at, type: 'reservation', title: `Reserva de ${label} criada` });
  if (r.checked_in_at) out.push({ id: `res-in-${r.id}`, at: r.checked_in_at, type: 'reservation', title: 'Entrada (check-in)' });
  if (r.checked_out_at) out.push({ id: `res-out-${r.id}`, at: r.checked_out_at, type: 'reservation', title: 'Saída (check-out)' });

  for (const e of src.executions) {
    out.push({
      id: `exec-${e.id}`,
      at: e.executed_at,
      type: 'task',
      title: e.undone ? `${e.task_title}: registro desfeito` : `${e.task_title}: ${OUTCOME_LABELS[e.outcome ?? ''] ?? 'registrado'}`,
      detail: e.notes ?? null,
      actor_user_id: e.executed_by_user_id ?? null,
    });
  }
  for (const i of src.incidents) {
    out.push({
      id: `inc-${i.id}`,
      at: i.occurred_at,
      type: 'incident',
      title: 'Intercorrência',
      detail: i.description,
      severity: i.severity,
      actor_user_id: i.created_by_user_id ?? null,
    });
    if (i.resolved_at) {
      out.push({
        id: `inc-res-${i.id}`,
        at: i.resolved_at,
        type: 'incident_resolved',
        title: 'Intercorrência resolvida',
        detail: i.resolution_notes ?? null,
      });
    }
  }
  for (const m of src.media) {
    out.push({
      id: `media-${m.id}`,
      at: m.created_at,
      type: 'photo',
      title: 'Foto',
      detail: m.caption ?? null,
      photo_url: m.url,
      actor_user_id: m.created_by_user_id ?? null,
    });
  }
  const reportTitle: Record<string, string> = {
    daily: 'Relatório do dia enviado ao tutor',
    stay_summary: 'Resumo da estadia enviado ao tutor',
    pickup: 'Tutor avisado para buscar',
  };
  for (const t of src.tutorReports) {
    out.push({
      id: `rep-${t.id}`,
      at: t.sent_at,
      type: 'tutor_report',
      title: reportTitle[t.kind] ?? 'Mensagem ao tutor',
      actor_user_id: t.sent_by_user_id ?? null,
    });
  }
  for (const b of src.belongings ?? []) {
    out.push({
      id: `bel-${b.id}`,
      at: b.created_at,
      type: 'belonging',
      title: 'Pertence recebido',
      detail: b.quantity > 1 ? `${b.quantity}× ${b.description}` : b.description,
    });
  }
  for (const l of src.legacyLogs ?? []) {
    out.push({
      id: `log-${l.id}`,
      at: l.created_at ?? `${l.log_date}T12:00:00-03:00`,
      type: 'legacy_log',
      title: `Relatório diário (${brDate(l.log_date)})`,
      detail: l.notes ?? null,
    });
  }
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
