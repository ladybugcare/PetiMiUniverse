/**
 * Plano de medicação da internação: geração de doses (horários fixos / intervalo)
 * e reconciliação com doses existentes. Sem I/O — testável isoladamente.
 * Fuso: America/Sao_Paulo (mesma convenção do boarding/finanças no MVP).
 */

export const HOSP_MED_TZ = 'America/Sao_Paulo';

export type MedScheduleKind = 'fixed_times' | 'interval';

export type MedOrderVersionSnapshot = {
  id: string;
  order_id: string;
  schedule_kind: MedScheduleKind;
  times: string[];
  interval_hours: number | null;
  starts_at: string;
  ends_at: string | null;
};

export type DoseSpec = {
  order_id: string;
  order_version_id: string;
  task_date: string;
  scheduled_for: string;
  plan_key: string;
};

export type ExistingMedDose = {
  id: string;
  order_id: string;
  order_version_id: string;
  plan_key: string;
  task_date: string;
  scheduled_for: string;
  status: 'pending' | 'administered' | 'not_administered' | 'cancelled';
};

export type DoseReconcilePlan = {
  toInsert: DoseSpec[];
  toCancel: Array<{ id: string; reason: 'superseded_schedule' | 'order_suspended' }>;
  toTouchVersion: Array<{ id: string; order_version_id: string }>;
  /** Cancelada pelo plano e o horário voltou — reabre como pending. */
  toReactivate: Array<{ id: string; order_version_id: string; scheduled_for: string }>;
};

const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeHm(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!HM_RE.test(s)) return null;
  return s;
}

export function normalizeTimes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const hm = normalizeHm(t);
    if (!hm || seen.has(hm)) continue;
    seen.add(hm);
    out.push(hm);
  }
  return out.sort();
}

/** YYYY-MM-DD do instante no fuso America/Sao_Paulo. */
export function civilYmdInSp(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat('en-CA', { timeZone: HOSP_MED_TZ }).format(d);
}

/** Instante ISO de HH:MM em uma data civil de São Paulo (UTC-3 fixo, igual boarding). */
export function localDateTimeToIsoSp(ymd: string, hm: string): string {
  return new Date(`${ymd}T${hm}:00-03:00`).toISOString();
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function todayYmdSp(now = new Date()): string {
  return civilYmdInSp(now);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** HH:MM no fuso SP a partir de um Date. */
export function hmInSp(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HOSP_MED_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/**
 * Horizonte de materialização: hoje e amanhã (civil SP), cortado por ends_at.
 */
export function materializationWindow(args: {
  now?: Date;
  endsAt?: string | null;
}): { fromYmd: string; toYmd: string; fromMs: number; toMs: number } {
  const now = args.now ?? new Date();
  const fromYmd = todayYmdSp(now);
  let toYmd = addDaysYmd(fromYmd, 1);
  if (args.endsAt) {
    const endYmd = civilYmdInSp(args.endsAt);
    if (endYmd < toYmd) toYmd = endYmd;
  }
  const fromMs = new Date(`${fromYmd}T00:00:00-03:00`).getTime();
  const toMs = new Date(`${toYmd}T23:59:59.999-03:00`).getTime();
  return { fromYmd, toYmd, fromMs, toMs };
}

export function buildDoseSpecsForVersion(
  version: MedOrderVersionSnapshot,
  opts?: { now?: Date },
): DoseSpec[] {
  const startsMs = new Date(version.starts_at).getTime();
  if (Number.isNaN(startsMs)) return [];
  const endsMs = version.ends_at ? new Date(version.ends_at).getTime() : null;
  const win = materializationWindow({ now: opts?.now, endsAt: version.ends_at });
  const specs: DoseSpec[] = [];

  const push = (scheduledFor: string, planKey: string) => {
    const t = new Date(scheduledFor).getTime();
    if (t < startsMs) return;
    if (endsMs != null && t > endsMs) return;
    if (t < win.fromMs || t > win.toMs) return;
    const task_date = civilYmdInSp(scheduledFor);
    if (task_date < win.fromYmd || task_date > win.toYmd) return;
    specs.push({
      order_id: version.order_id,
      order_version_id: version.id,
      task_date,
      scheduled_for: scheduledFor,
      plan_key: planKey,
    });
  };

  if (version.schedule_kind === 'fixed_times') {
    const times = normalizeTimes(version.times);
    for (let ymd = win.fromYmd; ymd <= win.toYmd; ymd = addDaysYmd(ymd, 1)) {
      for (const hm of times) {
        const iso = localDateTimeToIsoSp(ymd, hm);
        push(iso, `${version.order_id}:${hm}`);
      }
    }
  } else {
    const hours = Number(version.interval_hours);
    if (!Number.isFinite(hours) || hours <= 0) return [];
    const stepMs = hours * 3600_000;
    // Âncora: starts_at; gera até o fim da janela
    let t = startsMs;
    // Avança até entrar na janela
    if (t < win.fromMs) {
      const skips = Math.floor((win.fromMs - t) / stepMs);
      t += skips * stepMs;
      while (t < win.fromMs) t += stepMs;
    }
    let guard = 0;
    while (t <= win.toMs && guard < 500) {
      guard += 1;
      const iso = new Date(t).toISOString();
      const keyHm = hmInSp(new Date(t));
      // plan_key estável por instante absoluto para intervalo
      push(iso, `${version.order_id}:interval:${iso}`);
      void keyHm;
      void pad2;
      t += stepMs;
    }
  }

  return specs.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
}

/**
 * Diff plano desejado × doses existentes.
 * Executadas (administered / not_administered) nunca mudam.
 * Pendentes fora do plano → cancel (superseded_schedule).
 * Pendentes com mesmo plan_key → atualiza order_version_id se mudou.
 */
export function diffMedDoses(args: {
  desired: DoseSpec[];
  existing: ExistingMedDose[];
  /** Se true, cancela todos os pending (ex.: ordem suspensa). */
  suspendAllPending?: boolean;
}): DoseReconcilePlan {
  const existingByKey = new Map<string, ExistingMedDose>();
  for (const d of args.existing) {
    existingByKey.set(`${d.plan_key}|${d.task_date}`, d);
  }

  const desiredKeys = new Set(args.desired.map((s) => `${s.plan_key}|${s.task_date}`));
  const toInsert: DoseSpec[] = [];
  const toCancel: DoseReconcilePlan['toCancel'] = [];
  const toTouchVersion: DoseReconcilePlan['toTouchVersion'] = [];
  const toReactivate: DoseReconcilePlan['toReactivate'] = [];

  if (args.suspendAllPending) {
    for (const d of args.existing) {
      if (d.status === 'pending') {
        toCancel.push({ id: d.id, reason: 'order_suspended' });
      }
    }
    return { toInsert: [], toCancel, toTouchVersion: [], toReactivate: [] };
  }

  for (const spec of args.desired) {
    const key = `${spec.plan_key}|${spec.task_date}`;
    const ex = existingByKey.get(key);
    if (!ex) {
      toInsert.push(spec);
      continue;
    }
    if (ex.status === 'administered' || ex.status === 'not_administered') {
      continue;
    }
    if (ex.status === 'cancelled') {
      toReactivate.push({
        id: ex.id,
        order_version_id: spec.order_version_id,
        scheduled_for: spec.scheduled_for,
      });
      continue;
    }
    // pending
    if (ex.order_version_id !== spec.order_version_id) {
      toTouchVersion.push({ id: ex.id, order_version_id: spec.order_version_id });
    }
  }

  for (const d of args.existing) {
    if (d.status !== 'pending') continue;
    const key = `${d.plan_key}|${d.task_date}`;
    if (!desiredKeys.has(key)) {
      toCancel.push({ id: d.id, reason: 'superseded_schedule' });
    }
  }

  return { toInsert, toCancel, toTouchVersion, toReactivate };
}

export function formatDoseLabel(doseValue: number | string, doseUnit: string): string {
  const n = typeof doseValue === 'number' ? doseValue : Number(doseValue);
  const num = Number.isFinite(n) ? String(n).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '') : String(doseValue);
  return `${num} ${doseUnit}`.trim();
}

export const NOT_ADMIN_REASON_CODES = [
  'recusou',
  'vomito',
  'via_indisponivel',
  'medicamento_indisponivel',
  'prescritor_suspendeu',
  'outro',
] as const;

export type NotAdminReasonCode = (typeof NOT_ADMIN_REASON_CODES)[number];

export const NOT_ADMIN_REASON_LABELS: Record<NotAdminReasonCode, string> = {
  recusou: 'Recusou',
  vomito: 'Vômito',
  via_indisponivel: 'Via indisponível',
  medicamento_indisponivel: 'Medicamento indisponível',
  prescritor_suspendeu: 'Prescritor suspendeu',
  outro: 'Outro',
};

export function isDoseOverdue(status: string, scheduledFor: string, now = new Date()): boolean {
  return status === 'pending' && new Date(scheduledFor).getTime() < now.getTime();
}

export const VET_JOB_TITLE = 'Médico(a) Veterinário(a)';
