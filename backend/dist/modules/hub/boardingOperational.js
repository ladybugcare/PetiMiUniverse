"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_STATUS_TRANSITIONS = exports.BOARDING_STATUSES = exports.BOARDING_MODES = exports.BOARDING_APPOINTMENT_KINDS = exports.BOARDING_SERVICE_GROUPS = void 0;
exports.isValidStatusTransition = isValidStatusTransition;
exports.dayBoundsFromYmdSaoPaulo = dayBoundsFromYmdSaoPaulo;
exports.resolveDayBoardRange = resolveDayBoardRange;
exports.appointmentMatchesBoardingTypes = appointmentMatchesBoardingTypes;
exports.modeFromAppointmentKind = modeFromAppointmentKind;
exports.stageFromAppointmentStatus = stageFromAppointmentStatus;
exports.calcBoardingNights = calcBoardingNights;
exports.BOARDING_SERVICE_GROUPS = ['hotel', 'creche'];
exports.BOARDING_APPOINTMENT_KINDS = ['hotel_stay', 'daycare_block'];
exports.BOARDING_MODES = ['hotel', 'daycare', 'all'];
exports.BOARDING_STATUSES = ['reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
exports.VALID_STATUS_TRANSITIONS = {
    reserved: ['checked_in', 'cancelled', 'no_show'],
    checked_in: ['checked_out', 'reserved'],
    checked_out: ['checked_in'],
    cancelled: [],
    no_show: ['reserved'],
};
function isValidStatusTransition(from, to) {
    const allowed = exports.VALID_STATUS_TRANSITIONS[from] ?? [];
    return allowed.includes(to);
}
function dayBoundsFromYmdSaoPaulo(dateYmd) {
    const from = new Date(`${dateYmd}T00:00:00-03:00`);
    const to = new Date(`${dateYmd}T23:59:59.999-03:00`);
    return { from: from.toISOString(), to: to.toISOString() };
}
function resolveDayBoardRange(query) {
    if (query.from && query.to) {
        const dateYmd = query.date ?? query.from.slice(0, 10);
        return { from: query.from, to: query.to, dateYmd };
    }
    const dateYmd = query.date;
    const bounds = dayBoundsFromYmdSaoPaulo(dateYmd);
    return { ...bounds, dateYmd };
}
function appointmentMatchesBoardingTypes(appt, boardingTypeIds, lineTypeIdsByAppt) {
    const kind = appt.appointment_kind;
    if (kind && exports.BOARDING_APPOINTMENT_KINDS.includes(kind))
        return true;
    const primary = appt.hub_service_type_id;
    if (primary && boardingTypeIds.has(primary))
        return true;
    const lines = lineTypeIdsByAppt.get(appt.id) ?? [];
    return lines.some((id) => boardingTypeIds.has(id));
}
function modeFromAppointmentKind(kind) {
    return kind === 'daycare_block' ? 'daycare' : 'hotel';
}
function stageFromAppointmentStatus(status) {
    switch (status) {
        case 'in_progress':
            return 'checked_in';
        case 'done':
        case 'paid':
            return 'checked_out';
        case 'cancelled':
            return 'cancelled';
        default:
            return 'reserved';
    }
}
/** Número de noites entre check-in e check-out (ou agora). Algoritmo operacional — distinto do billing. */
function calcBoardingNights(checkedInAt, checkedOutAt) {
    if (!checkedInAt)
        return 0;
    const inMs = new Date(checkedInAt).getTime();
    const outMs = checkedOutAt ? new Date(checkedOutAt).getTime() : Date.now();
    if (isNaN(inMs) || isNaN(outMs))
        return 0;
    const nights = Math.floor((outMs - inMs) / (1000 * 60 * 60 * 24));
    return Math.max(0, nights);
}
