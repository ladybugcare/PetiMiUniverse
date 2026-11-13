import type {
  HubHospMedDose,
  HubHospMedDoseStatus,
  HubHospMedNotAdminReason,
  HubHospMedOrderVersion,
  HubHospMedScheduleKind,
} from '../../../api/hubClinicalApi';

export const NOT_ADMIN_REASON_OPTIONS: Array<{ key: HubHospMedNotAdminReason; label: string }> = [
  { key: 'recusou', label: 'Recusou' },
  { key: 'vomito', label: 'Vômito' },
  { key: 'via_indisponivel', label: 'Via indisponível' },
  { key: 'medicamento_indisponivel', label: 'Medicamento indisponível' },
  { key: 'prescritor_suspendeu', label: 'Prescritor suspendeu' },
  { key: 'outro', label: 'Outro' },
];

export const DOSE_STATUS_LABEL: Record<HubHospMedDoseStatus, string> = {
  pending: 'Pendente',
  administered: 'Administrado',
  not_administered: 'Não administrado',
  cancelled: 'Cancelado',
};

export type FreqPreset = 'once' | '12h' | '8h' | '6h' | 'fixed';

export const FREQ_PRESET_OPTIONS: Array<{ key: FreqPreset; label: string }> = [
  { key: 'once', label: '1x ao dia' },
  { key: '12h', label: '12/12h' },
  { key: '8h', label: '8/8h' },
  { key: '6h', label: '6/6h' },
  { key: 'fixed', label: 'Horários fixos' },
];

const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeStartHm(raw: string, fallback = '08:00'): string {
  const t = raw.trim();
  return HM_RE.test(t) ? t : fallback;
}

/** Horários do ciclo de 24h a partir do início (ex.: 08:00 + 8h → 08:00, 16:00, 00:00). */
export function timesInDayFromStart(startHm: string, intervalHours: number): string[] {
  const start = normalizeStartHm(startHm);
  const stepH = Number(intervalHours);
  if (!Number.isFinite(stepH) || stepH <= 0) return [start];
  const [sh, sm] = start.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const stepMin = Math.round(stepH * 60);
  if (stepMin <= 0 || stepMin > 24 * 60) return [start];
  const out: string[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < 48; i++) {
    const mins = (startMin + i * stepMin) % (24 * 60);
    if (seen.has(mins)) break;
    seen.add(mins);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    out.push(`${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`);
  }
  return out;
}

export function intervalHoursFromPreset(preset: FreqPreset): number | null {
  if (preset === '12h') return 12;
  if (preset === '8h') return 8;
  if (preset === '6h') return 6;
  return null;
}

export function scheduleFromPreset(
  preset: FreqPreset,
  times: string[],
  startHm = '08:00',
): { schedule_kind: HubHospMedScheduleKind; times: string[]; interval_hours: number | null } {
  const start = normalizeStartHm(startHm);
  if (preset === 'fixed') {
    return { schedule_kind: 'fixed_times', times, interval_hours: null };
  }
  if (preset === 'once') {
    return {
      schedule_kind: 'fixed_times',
      times: [start],
      interval_hours: null,
    };
  }
  const hours = intervalHoursFromPreset(preset) ?? 8;
  return { schedule_kind: 'interval', times: [], interval_hours: hours };
}

/** Instante ISO de HH:MM no dia civil de hoje em America/Sao_Paulo. */
export function startsAtIsoFromHm(startHm: string, now = new Date()): string {
  const hm = normalizeStartHm(startHm);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  return new Date(`${ymd}T${hm}:00-03:00`).toISOString();
}

export function presetFromVersion(v: Pick<HubHospMedOrderVersion, 'schedule_kind' | 'interval_hours' | 'times'>): FreqPreset {
  if (v.schedule_kind === 'interval') {
    const h = Number(v.interval_hours);
    if (h === 12) return '12h';
    if (h === 8) return '8h';
    if (h === 6) return '6h';
    return '8h';
  }
  if ((v.times?.length ?? 0) <= 1) return 'once';
  return 'fixed';
}

export function formatScheduleSummary(
  v: Pick<HubHospMedOrderVersion, 'schedule_kind' | 'interval_hours' | 'times' | 'starts_at'>,
): string {
  if (v.schedule_kind === 'interval') {
    const h = Number(v.interval_hours);
    const start = v.starts_at ? formatHmFromIso(v.starts_at) : null;
    const base = Number.isFinite(h) ? `${h}/${h}h` : 'Intervalo';
    if (start && Number.isFinite(h)) {
      const preview = timesInDayFromStart(start, h).join(', ');
      return `${base} a partir de ${start} (${preview})`;
    }
    return start ? `${base} a partir de ${start}` : base;
  }
  const times = (v.times ?? []).filter(Boolean);
  return times.length ? times.join(', ') : 'Sem horários';
}

export function formatHmFromIso(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

export function doseUiStatus(dose: HubHospMedDose): HubHospMedDoseStatus | 'overdue' {
  if (dose.status === 'pending' && dose.overdue) return 'overdue';
  return dose.status;
}

export const DOSE_UI_LABEL: Record<HubHospMedDoseStatus | 'overdue', string> = {
  ...DOSE_STATUS_LABEL,
  overdue: 'Atrasado',
};

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `dose-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
