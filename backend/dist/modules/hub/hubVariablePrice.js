"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundMoney2 = roundMoney2;
exports.resolvePriceStatus = resolvePriceStatus;
exports.canAutoApproveFinancial = canAutoApproveFinancial;
const authMiddleware_1 = require("../../middleware/authMiddleware");
function roundMoney2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
/**
 * Decide se o valor informado na hora fica confirmado ou pendente de aprovação financeira.
 * - Quem tem hub.financial.write confirma sempre.
 * - price_mode = fixed: usa catálogo (não deveria chegar override fora).
 * - price_mode = variable: dentro da faixa → confirmed; fora da faixa ou sem faixa → pending_approval.
 */
function resolvePriceStatus(opts) {
    if (opts.canAutoApprove)
        return 'confirmed';
    const mode = String(opts.service.price_mode ?? 'fixed');
    if (mode !== 'variable') {
        // Fixed: override manual fora do catálogo exige aprovação.
        const catalog = roundMoney2(Number(opts.service.sale_amount ?? 0));
        return roundMoney2(opts.unitAmount) === catalog ? 'confirmed' : 'pending_approval';
    }
    const min = opts.service.price_min == null ? null : roundMoney2(Number(opts.service.price_min));
    const max = opts.service.price_max == null ? null : roundMoney2(Number(opts.service.price_max));
    const amount = roundMoney2(opts.unitAmount);
    if (min == null && max == null)
        return 'pending_approval';
    if (min != null && amount < min)
        return 'pending_approval';
    if (max != null && amount > max)
        return 'pending_approval';
    return 'confirmed';
}
async function canAutoApproveFinancial(userId, clinicId) {
    if (!userId)
        return false;
    return (0, authMiddleware_1.checkPermission)(userId, clinicId, 'hub.financial.write');
}
