"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDayBoardOperationallyComplete = isDayBoardOperationallyComplete;
exports.isDayBoardPaidAndComplete = isDayBoardPaidAndComplete;
exports.pickActiveReceivableId = pickActiveReceivableId;
exports.matchesFinanceiroDayBoardScope = matchesFinanceiroDayBoardScope;
exports.aggregateReceivableStatus = aggregateReceivableStatus;
function isDayBoardOperationallyComplete(originType, operationalStatus) {
    switch (originType) {
        case 'appointment':
            return operationalStatus === 'done' || operationalStatus === 'paid';
        case 'grooming_session':
            return operationalStatus === 'closed';
        case 'encounter':
            return operationalStatus === 'completed';
        case 'quote':
        case 'manual':
        case 'boarding_reservation':
            return true;
        default:
            return true;
    }
}
function isDayBoardPaidAndComplete(originType, operationalStatus, receivableStatus) {
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
    return paid?.id ?? null;
}
function matchesFinanceiroDayBoardScope(billing) {
    if (billing.finance_handoff_at)
        return true;
    if (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid')
        return true;
    return false;
}
function aggregateReceivableStatus(statuses) {
    if (statuses.length === 0)
        return null;
    if (statuses.some((s) => s === 'pending'))
        return 'pending';
    if (statuses.some((s) => s === 'partially_paid'))
        return 'partially_paid';
    if (statuses.every((s) => s === 'paid'))
        return 'paid';
    return null;
}
