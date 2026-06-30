"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.round2 = round2;
exports.resolveBoardingCheckInOut = resolveBoardingCheckInOut;
exports.computeBoardingNights = computeBoardingNights;
exports.computeBoardingQuantity = computeBoardingQuantity;
exports.computeBoardingLineAmount = computeBoardingLineAmount;
exports.buildBoardingDescription = buildBoardingDescription;
exports.buildBoardingComandaLine = buildBoardingComandaLine;
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
function computeBoardingNights(checkIn, checkOut) {
    if (!checkIn || !checkOut)
        return 0;
    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
}
function computeBoardingQuantity(mode, checkIn, checkOut) {
    if (mode === 'hotel') {
        return Math.max(1, computeBoardingNights(checkIn, checkOut));
    }
    return 1;
}
function computeBoardingLineAmount(dailyRateCents, quantity) {
    const unitAmount = round2(dailyRateCents / 100);
    const lineTotal = round2(quantity * unitAmount);
    return { unitAmount, lineTotal };
}
function buildBoardingDescription(mode, quantity) {
    const label = mode === 'hotel' ? 'Hotel' : 'Creche';
    if (mode === 'hotel') {
        return `${label} — ${quantity} ${quantity === 1 ? 'diária' : 'diárias'}`;
    }
    return `${label} — ${quantity} bloco(s)`;
}
function buildBoardingComandaLine(reservation) {
    const { checkIn, checkOut } = resolveBoardingCheckInOut(reservation);
    const dailyRateCents = reservation.daily_rate_cents ?? 0;
    const quantity = computeBoardingQuantity(reservation.mode, checkIn, checkOut);
    const { unitAmount, lineTotal } = computeBoardingLineAmount(dailyRateCents, quantity);
    const line = {
        pet_id: reservation.pet_id ?? null,
        item_kind: 'service',
        hub_service_type_id: null,
        hub_inventory_item_id: null,
        hub_inventory_lot_id: null,
        description: buildBoardingDescription(reservation.mode, quantity),
        quantity,
        unit_amount: unitAmount,
        discount_amount: 0,
        line_total: lineTotal,
        service_date: checkIn ? checkIn.slice(0, 10) : null,
        origin_type: 'boarding_reservation',
        origin_id: reservation.id,
        sort_order: 0,
    };
    return { line, subtotal: lineTotal };
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
function estimateBoardingUnbilledAmount(reservation) {
    const { checkIn, checkOut } = resolveBoardingCheckInOut(reservation);
    const quantity = computeBoardingQuantity(reservation.mode, checkIn, checkOut);
    const dailyRateCents = reservation.daily_rate_cents ?? 0;
    return computeBoardingLineAmount(dailyRateCents, quantity).lineTotal;
}
function isBilledViaComandaHandoff(billing) {
    if (billing.finance_handoff_at)
        return true;
    if (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid')
        return true;
    return false;
}
