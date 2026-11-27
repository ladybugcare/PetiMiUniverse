"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_SHOW_FROM_STATUSES = void 0;
exports.canTransitionToNoShow = canTransitionToNoShow;
exports.mergeExplicitAndImpliedAppointmentIds = mergeExplicitAndImpliedAppointmentIds;
/** Status a partir dos quais a API aceita marcar falta. */
exports.NO_SHOW_FROM_STATUSES = new Set([
    'pending_confirm',
    'confirmed',
    'checked_in',
    'in_progress',
]);
function canTransitionToNoShow(currentStatus) {
    return exports.NO_SHOW_FROM_STATUSES.has(currentStatus);
}
/**
 * Une faltas explícitas e implícitas sem duplicar o mesmo agendamento.
 * Explícitas têm prioridade (já estão com status `no_show`).
 */
function mergeExplicitAndImpliedAppointmentIds(explicitIds, impliedIds) {
    const explicitSet = new Set(explicitIds);
    return {
        explicit: [...explicitSet],
        impliedOnly: impliedIds.filter((id) => !explicitSet.has(id)),
    };
}
