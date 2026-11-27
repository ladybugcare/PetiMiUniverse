"use strict";
/**
 * Cobertura de itens da comanda após cancelamento/estorno do recebível.
 * Cancelamento puro com reissue reabre itens; void_sale mantém cobertos.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.receivableClosedByReturn = receivableClosedByReturn;
exports.isFinancialCancelWithoutReturn = isFinancialCancelWithoutReturn;
exports.isReissueCancel = isReissueCancel;
exports.isVoidSaleCancel = isVoidSaleCancel;
exports.receivableBillsComandaItem = receivableBillsComandaItem;
exports.receivableListableOnComanda = receivableListableOnComanda;
exports.receivableResidualCountsTowardBalance = receivableResidualCountsTowardBalance;
exports.receivableKeepsComandaChargeable = receivableKeepsComandaChargeable;
function receivableClosedByReturn(row) {
    const status = String(row.status ?? '');
    const returned = Number(row.returned_amount ?? 0);
    return returned > 0.009 || status === 'refunded';
}
/** Cancelamento financeiro sem devolução comercial (void ou reissue). */
function isFinancialCancelWithoutReturn(row) {
    return String(row.status ?? '') === 'cancelled' && !receivableClosedByReturn(row);
}
/**
 * Reissue / legado: cancelamento puro que devolve itens a cobráveis.
 * void_sale (`cancel_rebill === false`) não reabre.
 */
function isReissueCancel(row) {
    if (!isFinancialCancelWithoutReturn(row))
        return false;
    return row.cancel_rebill !== false;
}
/** void_sale: anula cobrança sem reabrir faturamento dos itens. */
function isVoidSaleCancel(row) {
    if (!isFinancialCancelWithoutReturn(row))
        return false;
    return row.cancel_rebill === false;
}
/** Recebível ainda “cobre” o item da comanda (não entra em open_item_ids). */
function receivableBillsComandaItem(row) {
    return !isReissueCancel(row);
}
/**
 * Listável na ficha financeira ativa.
 * Qualquer cancelamento sem devolução (void ou reissue) sai da lista ativa.
 */
function receivableListableOnComanda(row) {
    return !isFinancialCancelWithoutReturn(row);
}
/** Residual a cobrar do recebível: refunded fecha financeiramente sem reabrir itens. */
function receivableResidualCountsTowardBalance(row) {
    const status = String(row.status ?? '');
    if (status === 'refunded')
        return false;
    if (isFinancialCancelWithoutReturn(row))
        return false;
    return true;
}
/**
 * Recebível que ainda “segura” a comanda como cobrança viva.
 * `refunded` permanece listável na ficha, mas não deve impedir anular a comanda
 * após estorno/reembolso total (senão a venda volta em “Pendentes de dias anteriores”).
 */
function receivableKeepsComandaChargeable(row) {
    const status = String(row.status ?? '');
    return status === 'pending' || status === 'partially_paid' || status === 'paid';
}
