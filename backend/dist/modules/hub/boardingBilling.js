"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.round2 = round2;
exports.resolveBoardingCheckInOut = resolveBoardingCheckInOut;
exports.boardingLocalParts = boardingLocalParts;
exports.computeBoardingNights = computeBoardingNights;
exports.isCheckoutAfterCutoff = isCheckoutAfterCutoff;
exports.computeBoardingQuantity = computeBoardingQuantity;
exports.computeBoardingLineAmount = computeBoardingLineAmount;
exports.buildBoardingDescription = buildBoardingDescription;
exports.buildBoardingComandaLine = buildBoardingComandaLine;
exports.buildBoardingExtraLines = buildBoardingExtraLines;
exports.estimateBoardingStayTotal = estimateBoardingStayTotal;
exports.isAppointmentLineReplacedByBoarding = isAppointmentLineReplacedByBoarding;
exports.shouldIncludeInUnbilledBoarding = shouldIncludeInUnbilledBoarding;
exports.estimateBoardingUnbilledAmount = estimateBoardingUnbilledAmount;
exports.isBilledViaComandaHandoff = isBilledViaComandaHandoff;
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function resolveBoardingCheckInOut(reservation) {
    const checkIn = reservation.checked_in_at ?? reservation.expected_check_in ?? null;
    const checkOut = reservation.checked_out_at ?? reservation.expected_check_out ?? null;
    return { checkIn, checkOut };
}
const BOARDING_TZ = 'America/Sao_Paulo';
const spPartsFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOARDING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});
/** Data (YYYY-MM-DD) e minutos do dia no fuso da operação. */
function boardingLocalParts(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return null;
    const parts = Object.fromEntries(spPartsFormatter.formatToParts(d).map((p) => [p.type, p.value]));
    return {
        ymd: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: Number(parts.hour) * 60 + Number(parts.minute),
    };
}
function ymdToUtcDays(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}
/** Noites = viradas de data (fuso de São Paulo) entre entrada e saída. */
function computeBoardingNights(checkIn, checkOut) {
    if (!checkIn || !checkOut)
        return 0;
    const a = boardingLocalParts(checkIn);
    const b = boardingLocalParts(checkOut);
    if (!a || !b)
        return 0;
    return Math.max(0, ymdToUtcDays(b.ymd) - ymdToUtcDays(a.ymd));
}
function cutoffToMinutes(cutoff) {
    if (!cutoff)
        return null;
    const m = /^(\d{2}):(\d{2})/.exec(cutoff);
    if (!m)
        return null;
    return Number(m[1]) * 60 + Number(m[2]);
}
/** Saída depois do horário-limite da unidade cobra uma diária extra. */
function isCheckoutAfterCutoff(checkOut, cutoffTime) {
    const limit = cutoffToMinutes(cutoffTime);
    if (limit == null || !checkOut)
        return false;
    const parts = boardingLocalParts(checkOut);
    return parts != null && parts.minutes > limit;
}
function computeBoardingQuantity(mode, checkIn, checkOut, opts) {
    if (mode === 'hotel') {
        const nights = computeBoardingNights(checkIn, checkOut);
        const extra = nights > 0 && isCheckoutAfterCutoff(checkOut, opts?.cutoffTime) ? 1 : 0;
        return Math.max(1, nights + extra);
    }
    return 1;
}
function computeBoardingLineAmount(dailyRateCents, quantity) {
    const unitAmount = round2(dailyRateCents / 100);
    const lineTotal = round2(quantity * unitAmount);
    return { unitAmount, lineTotal };
}
function buildBoardingDescription(mode, quantity, daycarePeriod) {
    if (mode === 'hotel') {
        return `Hotel — ${quantity} ${quantity === 1 ? 'diária' : 'diárias'}`;
    }
    if (daycarePeriod === 'half_day')
        return 'Creche — meio período';
    if (daycarePeriod === 'full_day')
        return 'Creche — período integral';
    return `Creche — ${quantity} ${quantity === 1 ? 'período' : 'períodos'}`;
}
function localYmdOrNull(iso) {
    if (!iso)
        return null;
    return boardingLocalParts(iso)?.ymd ?? iso.slice(0, 10);
}
function buildBoardingComandaLine(reservation, opts) {
    const { checkIn, checkOut } = resolveBoardingCheckInOut(reservation);
    const dailyRateCents = reservation.daily_rate_cents ?? 0;
    const quantity = computeBoardingQuantity(reservation.mode, checkIn, checkOut, opts);
    const { unitAmount, lineTotal } = computeBoardingLineAmount(dailyRateCents, quantity);
    const line = {
        pet_id: reservation.pet_id ?? null,
        item_kind: 'service',
        hub_service_type_id: reservation.hub_service_type_id ?? null,
        hub_inventory_item_id: null,
        hub_inventory_lot_id: null,
        description: buildBoardingDescription(reservation.mode, quantity, reservation.daycare_period),
        quantity,
        unit_amount: unitAmount,
        discount_amount: 0,
        line_total: lineTotal,
        service_date: localYmdOrNull(checkIn),
        origin_type: 'boarding_reservation',
        origin_id: reservation.id,
        sort_order: 0,
    };
    return { line, subtotal: lineTotal };
}
/** Adicionais da estadia como linhas próprias da comanda (após a linha das diárias). */
function buildBoardingExtraLines(extras, petId, startSortOrder = 1) {
    const lines = [];
    let subtotal = 0;
    let sort = startSortOrder;
    for (const ex of extras) {
        if (ex.deleted_at)
            continue;
        const quantity = round2(Number(ex.quantity) || 0);
        if (quantity <= 0)
            continue;
        const { unitAmount, lineTotal } = computeBoardingLineAmount(ex.unit_amount_cents ?? 0, quantity);
        lines.push({
            pet_id: petId,
            item_kind: 'service',
            hub_service_type_id: ex.hub_service_type_id ?? null,
            hub_inventory_item_id: null,
            hub_inventory_lot_id: null,
            description: ex.description,
            quantity,
            unit_amount: unitAmount,
            discount_amount: 0,
            line_total: lineTotal,
            service_date: ex.service_date ?? null,
            origin_type: 'boarding_extra',
            origin_id: ex.id,
            sort_order: sort++,
        });
        subtotal = round2(subtotal + lineTotal);
    }
    return { lines, subtotal };
}
/** Total estimado da estadia (diárias/período + adicionais), em reais. */
function estimateBoardingStayTotal(reservation, extras, opts) {
    const { line } = buildBoardingComandaLine(reservation, opts);
    const { subtotal } = buildBoardingExtraLines(extras, null);
    return {
        quantity: line.quantity,
        base: line.line_total,
        extras: subtotal,
        total: round2(line.line_total + subtotal),
    };
}
/**
 * Quando a reserva entra na comanda do agendamento, a linha do serviço de hospedagem
 * do agendamento é substituída pelas diárias (evita cobrança dupla).
 */
function isAppointmentLineReplacedByBoarding(lineServiceTypeId, lineServiceGroup, reservationServiceTypeId) {
    if (reservationServiceTypeId && lineServiceTypeId === reservationServiceTypeId)
        return true;
    return lineServiceGroup === 'hotel' || lineServiceGroup === 'creche';
}
function shouldIncludeInUnbilledBoarding(reservation, ctx) {
    if (reservation.status !== 'checked_out')
        return false;
    if (reservation.billing_waived_at)
        return false;
    if (reservation.deleted_at)
        return false;
    const key = `boarding_reservation:${reservation.id}`;
    if (ctx.activeReceivableKeys.has(key))
        return false;
    if (ctx.comandaOpenKeys.has(key))
        return false;
    if (ctx.billedViaComandaKeys.has(key))
        return false;
    return true;
}
function estimateBoardingUnbilledAmount(reservation, extras = [], opts) {
    return estimateBoardingStayTotal(reservation, extras, opts).total;
}
function isBilledViaComandaHandoff(billing) {
    if (billing.finance_handoff_at)
        return true;
    if (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid')
        return true;
    return false;
}
