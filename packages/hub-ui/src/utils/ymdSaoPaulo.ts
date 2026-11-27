/** Dia civil em America/Sao_Paulo (YYYY-MM-DD). */
export function ymdSaoPaulo(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Compara se `openedAtIso` é de um dia civil SP anterior a `today` (padrão: agora). */
export function isPreviousDaySaoPaulo(
  openedAtIso: string | null | undefined,
  today: Date = new Date(),
): boolean {
  if (!openedAtIso) return false;
  const opened = new Date(openedAtIso);
  if (Number.isNaN(opened.getTime())) return false;
  return ymdSaoPaulo(opened) < ymdSaoPaulo(today);
}
