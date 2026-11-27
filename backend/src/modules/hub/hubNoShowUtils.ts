/** Status a partir dos quais a API aceita marcar falta. */
export const NO_SHOW_FROM_STATUSES = new Set([
  'pending_confirm',
  'confirmed',
  'checked_in',
  'in_progress',
]);

export function canTransitionToNoShow(currentStatus: string): boolean {
  return NO_SHOW_FROM_STATUSES.has(currentStatus);
}

/**
 * Une faltas explícitas e implícitas sem duplicar o mesmo agendamento.
 * Explícitas têm prioridade (já estão com status `no_show`).
 */
export function mergeExplicitAndImpliedAppointmentIds(
  explicitIds: string[],
  impliedIds: string[],
): { explicit: string[]; impliedOnly: string[] } {
  const explicitSet = new Set(explicitIds);
  return {
    explicit: [...explicitSet],
    impliedOnly: impliedIds.filter((id) => !explicitSet.has(id)),
  };
}
