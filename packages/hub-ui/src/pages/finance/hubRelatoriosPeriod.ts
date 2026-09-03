import { todayYmd, parseIsoYmd, formatYmd } from '../../utils/hubCalendar';

export type HubReportPeriod =
  | { mode: 'preset'; days: number }
  | { mode: 'range'; from: string; to: string };

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(value: string | null | undefined): value is string {
  return Boolean(value && YMD_RE.test(value) && parseIsoYmd(value));
}

export function addDaysToYmd(ymd: string, delta: number): string {
  const d = parseIsoYmd(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + delta);
  return formatYmd(d);
}

export function parseReportPeriodFromSearch(
  params: URLSearchParams,
  opts?: { absent?: boolean; lookahead?: boolean }
): HubReportPeriod {
  const from = params.get('from');
  const to = params.get('to');
  if (!opts?.absent && !opts?.lookahead && isValidYmd(from) && isValidYmd(to) && from <= to) {
    return { mode: 'range', from, to };
  }

  const allowed = opts?.absent
    ? [30, 60, 90, 180]
    : opts?.lookahead
      ? [7, 14, 30, 60]
      : [7, 30, 90];
  const fallback = opts?.absent ? 60 : opts?.lookahead ? 30 : 30;
  const n = Number(params.get('days') || String(fallback));
  return { mode: 'preset', days: allowed.includes(n) ? n : fallback };
}

/** Args para APIs que aceitam days | from/to. */
export function periodToApiOpts(period: HubReportPeriod): { days?: number; from?: string; to?: string } {
  if (period.mode === 'range') return { from: period.from, to: period.to };
  return { days: period.days };
}

export function periodLabel(period: HubReportPeriod): string {
  if (period.mode === 'range') return `${period.from} a ${period.to}`;
  return `últimos ${period.days} dias`;
}

export function defaultRangeForPreset(days: number): { from: string; to: string } {
  const to = todayYmd();
  const from = addDaysToYmd(to, -(days - 1));
  return { from, to };
}
