/**
 * Regras de recorrência de agendamentos (funções puras).
 *
 * A UI oferece Diária, Semanal, Quinzenal e Mensal. «Quinzenal» é apenas a forma
 * amigável de dizer «semanal a cada 2 semanas» — o banco guarda um único formato
 * (kind 'weekly' + interval_value 2), então não há duas verdades para a mesma série.
 */

export const MAX_OCCURRENCES = 52;

export type RecurrenceKind = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export type RecurrenceRule = {
  kind: RecurrenceKind;
  interval_value: number;
  days_of_week?: number[] | null;
  day_of_month?: number | null;
  until_date?: string | null;
  occurrences?: number | null;
};

export type NormalizedRecurrenceRule<T extends RecurrenceRule = RecurrenceRule> = Omit<
  T,
  'kind' | 'interval_value'
> & {
  kind: 'daily' | 'weekly' | 'monthly';
  interval_value: number;
};

/** Dia da semana ISO: 1=segunda … 7=domingo. */
export function isoWeekday(d: Date): number {
  return ((d.getUTCDay() + 6) % 7) + 1;
}

export function normalizeRecurrenceRule<T extends RecurrenceRule>(rule: T): NormalizedRecurrenceRule<T> {
  const interval = Math.max(1, Math.floor(rule.interval_value ?? 1) || 1);
  return {
    ...rule,
    kind: rule.kind === 'biweekly' ? 'weekly' : rule.kind,
    interval_value: rule.kind === 'biweekly' ? 2 : interval,
  };
}

/**
 * Dias da semana a persistir na série: quando o usuário não marca nenhum,
 * a série segue o dia da semana da primeira ocorrência.
 */
export function seriesDaysOfWeek(startDate: string, rule: RecurrenceRule): number[] | null {
  const normalized = normalizeRecurrenceRule(rule);
  if (normalized.kind !== 'weekly') return normalized.days_of_week ?? null;
  if (normalized.days_of_week && normalized.days_of_week.length > 0) {
    return [...new Set(normalized.days_of_week)].sort((a, b) => a - b);
  }
  return [isoWeekday(new Date(startDate + 'T00:00:00Z'))];
}

export function generateOccurrenceDates(startDate: string, inputRule: RecurrenceRule): string[] {
  const rule = normalizeRecurrenceRule(inputRule);
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const cap = Math.min(rule.occurrences ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const until = rule.until_date ? new Date(rule.until_date + 'T23:59:59Z') : null;

  if (rule.kind === 'weekly') {
    const targetDays = seriesDaysOfWeek(startDate, rule) ?? [isoWeekday(start)];
    // Âncora na segunda-feira da semana inicial; cada bloco avança interval_value semanas
    // (quinzenal = 2), o que mantém o espaçamento exato mesmo com vários dias marcados.
    const weekStart = new Date(start);
    weekStart.setUTCDate(weekStart.getUTCDate() - (isoWeekday(start) - 1));

    while (dates.length < cap) {
      let pastUntil = false;
      for (const dow of targetDays) {
        const d = new Date(weekStart);
        d.setUTCDate(d.getUTCDate() + (dow - 1));
        if (d < start) continue;
        if (until && d > until) {
          pastUntil = true;
          break;
        }
        dates.push(d.toISOString().slice(0, 10));
        if (dates.length >= cap) break;
      }
      if (pastUntil || dates.length >= cap) break;
      weekStart.setUTCDate(weekStart.getUTCDate() + rule.interval_value * 7);
    }
    return dates;
  }

  if (rule.kind === 'daily') {
    const current = new Date(start);
    while (dates.length < cap) {
      if (until && current > until) break;
      dates.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + rule.interval_value);
    }
    return dates;
  }

  // Mensal ancorado no mês inicial: evita o arrasto de datas quando o dia
  // escolhido não existe no mês (ex.: dia 31 em fevereiro).
  const anchorDay = rule.day_of_month || start.getUTCDate();
  for (let i = 0; dates.length < cap; i += 1) {
    const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i * rule.interval_value, 1));
    const lastDayOfMonth = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const d = i === 0 ? new Date(start) : monthStart;
    if (i > 0) d.setUTCDate(Math.min(anchorDay, lastDayOfMonth));
    if (until && d > until) break;
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
