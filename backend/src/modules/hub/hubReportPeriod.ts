/**
 * Competência de período dos relatórios financeiros: dia civil America/Sao_Paulo.
 * Pagamentos entre 21h–24h BRT não devem “trocar de dia” por corte UTC.
 */

export const REPORT_TIMEZONE = 'America/Sao_Paulo';

/** Início do dia civil SP (YYYY-MM-DD) → ISO UTC. */
export function reportDayStartIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00-03:00`).toISOString();
}

/** Fim do dia civil SP (YYYY-MM-DD) → ISO UTC. */
export function reportDayEndIso(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999-03:00`).toISOString();
}

export function reportDayBoundsIso(ymd: string): { from: string; to: string } {
  return { from: reportDayStartIso(ymd), to: reportDayEndIso(ymd) };
}

/** Dia civil atual em America/Sao_Paulo (YYYY-MM-DD). */
export function ymdTodaySaoPaulo(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: REPORT_TIMEZONE });
}

/** Converte instante ISO (ou Date) para dia civil SP. */
export function ymdSaoPauloFromIso(iso: string | Date | null | undefined): string {
  if (iso == null || iso === '') return ymdTodaySaoPaulo();
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return ymdTodaySaoPaulo();
  return d.toLocaleDateString('en-CA', { timeZone: REPORT_TIMEZONE });
}
