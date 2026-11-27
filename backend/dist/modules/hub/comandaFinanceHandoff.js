"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openLinesHeaderDiscount = openLinesHeaderDiscount;
exports.computeBalanceDueFromParts = computeBalanceDueFromParts;
exports.canHandoffExistingReceivables = canHandoffExistingReceivables;
exports.isSkippableLeavePendingHandoffError = isSkippableLeavePendingHandoffError;
const BALANCE_EPSILON = 0.02;
function roundMoney2(n) {
    return Math.round(n * 100) / 100;
}
/**
 * Desconto de cabeçalho ainda aplicável às linhas em aberto.
 * Se todas as linhas estão abertas, aplica o desconto integral; se só uma fração
 * resta aberta, rateia pelo valor bruto das linhas.
 */
function openLinesHeaderDiscount(opts) {
    const header = Math.max(0, Number(opts.headerDiscount ?? 0));
    if (header <= 0 || opts.openItemsCount <= 0)
        return 0;
    if (opts.openItemsCount >= opts.allItemsCount) {
        return roundMoney2(Math.min(header, Math.max(0, opts.openLinesTotal)));
    }
    const all = Math.max(0, Number(opts.allLinesTotal ?? 0));
    if (all <= 0)
        return 0;
    const open = Math.max(0, Number(opts.openLinesTotal ?? 0));
    return roundMoney2(Math.min(open, (header * open) / all));
}
/**
 * Saldo cobrável: linhas abertas líquidas do desconto de cabeçalho + resíduo de recebíveis.
 * Corrige a divergência total_amount (com desconto) vs soma bruta das linhas.
 */
function computeBalanceDueFromParts(opts) {
    const discount = openLinesHeaderDiscount(opts);
    const openNet = roundMoney2(Math.max(0, Number(opts.openLinesTotal ?? 0) - discount));
    return roundMoney2(openNet + Math.max(0, Number(opts.receivableResidual ?? 0)));
}
/** Handoff ao financeiro quando itens já foram faturados e ainda há saldo em recebíveis. */
function canHandoffExistingReceivables(detail) {
    return ((detail.open_item_ids ?? []).length === 0 &&
        (detail.active_receivable_ids ?? []).length > 0 &&
        Number(detail.balance_due ?? 0) > BALANCE_EPSILON);
}
/** Erros de leave_pending sem valor a faturar — não devem falhar o lote/encerrar turno. */
function isSkippableLeavePendingHandoffError(message) {
    const normalized = message.toLowerCase();
    return (normalized.includes('não há itens em aberto para faturar') ||
        normalized.includes('não há itens em aberto para enviar ao financeiro') ||
        normalized.includes('nenhum recebível gerado (valores zerados)'));
}
