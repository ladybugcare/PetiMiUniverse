"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_STATUS_TRANSITIONS = exports.BOARDING_ACTIVE_CUSTODY_STATUSES = exports.BOARDING_STATUSES = exports.BOARDING_MODES = exports.BOARDING_APPOINTMENT_KINDS = exports.BOARDING_SERVICE_GROUPS = void 0;
exports.isBoardingActiveCustody = isBoardingActiveCustody;
exports.isValidStatusTransition = isValidStatusTransition;
exports.dayBoundsFromYmdSaoPaulo = dayBoundsFromYmdSaoPaulo;
exports.resolveDayBoardRange = resolveDayBoardRange;
exports.appointmentMatchesBoardingTypes = appointmentMatchesBoardingTypes;
exports.modeFromAppointmentKind = modeFromAppointmentKind;
exports.stageFromAppointmentStatus = stageFromAppointmentStatus;
exports.calcBoardingNights = calcBoardingNights;
exports.boardingStayWindow = boardingStayWindow;
exports.reservationOverlapsRange = reservationOverlapsRange;
const boardingBilling_1 = require("./boardingBilling");
exports.BOARDING_SERVICE_GROUPS = ['hotel', 'creche'];
exports.BOARDING_APPOINTMENT_KINDS = ['hotel_stay', 'daycare_block'];
exports.BOARDING_MODES = ['hotel', 'daycare', 'all'];
exports.BOARDING_STATUSES = [
    'reserved',
    'checked_in',
    'checkout_preparing',
    'ready_for_handoff',
    'checked_out',
    'cancelled',
    'no_show',
];
/** Pet ainda sob custódia do hotel/creche (banho não gera retirada ao tutor). */
exports.BOARDING_ACTIVE_CUSTODY_STATUSES = [
    'checked_in',
    'checkout_preparing',
    'ready_for_handoff',
];
exports.VALID_STATUS_TRANSITIONS = {
    reserved: ['checked_in', 'cancelled', 'no_show'],
    checked_in: ['checkout_preparing', 'ready_for_handoff', 'checked_out', 'reserved'],
    checkout_preparing: ['ready_for_handoff', 'checked_in', 'checked_out'],
    ready_for_handoff: ['checkout_preparing', 'checked_out', 'checked_in'],
    checked_out: ['checked_in'],
    cancelled: [],
    no_show: ['reserved'],
};
function isBoardingActiveCustody(status) {
    return exports.BOARDING_ACTIVE_CUSTODY_STATUSES.includes(status);
}
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
/** Noites entre check-in e check-out (ou agora). Mesma regra da cobrança: viradas de data em São Paulo. */
function calcBoardingNights(checkedInAt, checkedOutAt) {
    if (!checkedInAt)
        return 0;
    return (0, boardingBilling_1.computeBoardingNights)(checkedInAt, checkedOutAt ?? new Date().toISOString());
}
/** Intervalo em que o pet está (ou estará) sob responsabilidade da unidade. */
function boardingStayWindow(r, nowIso = new Date().toISOString()) {
    const start = r.checked_in_at ?? r.expected_check_in ?? r.created_at ?? null;
    if (!start)
        return null;
    let end;
    if (r.checked_out_at) {
        end = r.checked_out_at;
    }
    else if (isBoardingActiveCustody(r.status)) {
        const expected = r.expected_check_out ?? null;
        end = expected && expected > nowIso ? expected : nowIso;
    }
    else {
        end = r.expected_check_out ?? start;
    }
    if (end < start)
        end = start;
    return { start, end };
}
/** A estadia cobre algum instante do intervalo [from, to]? (estadias de vários dias aparecem em todos os dias) */
function reservationOverlapsRange(r, from, to, nowIso) {
    const w = boardingStayWindow(r, nowIso);
    if (!w)
        return false;
    return new Date(w.start).getTime() <= new Date(to).getTime() && new Date(w.end).getTime() >= new Date(from).getTime();
}
