/** Statuses que o painel «Concluir» pode aplicar via PATCH. */
const DONE_FROM_STATUSES = new Set(['checked_in', 'in_progress']);

/**
 * Valida transição manual de status via create/patch de agendamento.
 * `paid` nunca vem do PATCH (só espelho financeiro).
 * `done` só a partir de aguardando / em atendimento (ação Concluir).
 * Retorna mensagem de erro ou null se ok.
 */
export function manualAppointmentStatusError(
  requested: string | null | undefined,
  opts: { mode: 'create' | 'patch'; currentStatus?: string | null },
): string | null {
  if (!requested) return null;
  if (requested === 'paid') {
    return 'Status Pago só após quitação no caixa.';
  }
  if (opts.mode === 'create' && (requested === 'done' || requested === 'paid')) {
    return 'Não é possível criar agendamento já finalizado ou pago.';
  }
  if (opts.mode === 'patch' && requested === 'done') {
    const current = String(opts.currentStatus ?? '');
    if (!DONE_FROM_STATUSES.has(current)) {
      return 'Só é possível marcar Finalizado a partir de Aguardando ou Em atendimento.';
    }
  }
  return null;
}
