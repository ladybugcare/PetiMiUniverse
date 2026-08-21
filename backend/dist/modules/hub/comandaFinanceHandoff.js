"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canHandoffExistingReceivables = canHandoffExistingReceivables;
const BALANCE_EPSILON = 0.02;
/** Handoff ao financeiro quando itens já foram faturados e ainda há saldo em recebíveis. */
function canHandoffExistingReceivables(detail) {
    return ((detail.open_item_ids ?? []).length === 0 &&
        (detail.active_receivable_ids ?? []).length > 0 &&
        Number(detail.balance_due ?? 0) > BALANCE_EPSILON);
}
