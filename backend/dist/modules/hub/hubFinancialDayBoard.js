"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDayBoardOperationallyComplete = isDayBoardOperationallyComplete;
exports.isDayBoardPaidAndComplete = isDayBoardPaidAndComplete;
exports.pickActiveReceivableId = pickActiveReceivableId;
exports.matchesFinanceiroDayBoardScope = matchesFinanceiroDayBoardScope;
exports.hasFinanceiroChargeableAmount = hasFinanceiroChargeableAmount;
exports.aggregateReceivableStatus = aggregateReceivableStatus;
const groomingStages_1 = require("./groomingStages");
function isDayBoardOperationallyComplete(originType, operationalStatus) {
    switch (originType) {
        case 'appointment':
            return operationalStatus === 'done' || operationalStatus === 'paid';
        case 'grooming_session':
            // Alinhado à comanda: Pronto (e legado entregue/encerrado) = serviço concluído.
            return (0, groomingStages_1.isGroomingServiceOperationallyDone)(operationalStatus);
        case 'encounter':
            return operationalStatus === 'completed';
        case 'boarding_reservation':
            return operationalStatus === 'checked_out';
        case 'hospitalization':
            return (operationalStatus === 'discharged' ||
                operationalStatus === 'death' ||
                operationalStatus === 'transferred');
        case 'quote':
        case 'manual':
            return true;
        default:
            return true;
    }
}
function isDayBoardPaidAndComplete(originType, operationalStatus, receivableStatus) {
    if (receivableStatus === 'refunded' || receivableStatus === 'cancelled') {
        return isDayBoardOperationallyComplete(originType, operationalStatus);
    }
    return receivableStatus === 'paid' && isDayBoardOperationallyComplete(originType, operationalStatus);
}
function pickActiveReceivableId(statusesWithIds) {
    const pending = statusesWithIds.find((r) => r.status === 'pending');
    if (pending)
        return pending.id;
    const partial = statusesWithIds.find((r) => r.status === 'partially_paid');
    if (partial)
        return partial.id;
    const paid = statusesWithIds.find((r) => r.status === 'paid');
    if (paid)
        return paid.id;
    const refunded = statusesWithIds.find((r) => r.status === 'refunded');
    if (refunded)
        return refunded.id;
    const cancelled = statusesWithIds.find((r) => r.status === 'cancelled');
    return cancelled?.id ?? null;
}
function matchesFinanceiroDayBoardScope(billing) {
    // Reembolso/cancelamento não é conta a receber — mesmo com handoff da comanda.
    if (billing.receivable_status === 'refunded' || billing.receivable_status === 'cancelled') {
        return false;
    }
    if (billing.finance_handoff_at)
        return true;
    if (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid')
        return true;
    return false;
}
/** Contas a receber: ignora títulos/estimativas com valor efetivo zerado. */
function hasFinanceiroChargeableAmount(opts) {
    const recvAmt = Number(opts.billing.receivable_amount ?? 0);
    if (opts.billing.receivable_status === 'pending' ||
        opts.billing.receivable_status === 'partially_paid') {
        return recvAmt > 0.009;
    }
    return Number(opts.estimated_amount ?? 0) > 0.009;
}
function aggregateReceivableStatus(statuses) {
    if (statuses.length === 0)
        return null;
    if (statuses.some((s) => s === 'pending'))
        return 'pending';
    if (statuses.some((s) => s === 'partially_paid'))
        return 'partially_paid';
    if (statuses.some((s) => s === 'paid'))
        return 'paid';
    if (statuses.some((s) => s === 'refunded'))
        return 'refunded';
    if (statuses.every((s) => s === 'cancelled'))
        return 'cancelled';
    return null;
}
