"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundMoney2 = roundMoney2;
exports.applyQuoteDiscount = applyQuoteDiscount;
exports.quoteDiscountAmount = quoteDiscountAmount;
function roundMoney2(n) {
    return Math.round(n * 100) / 100;
}
/** Total líquido do orçamento. Sem desconto, devolve o subtotal como está. */
function applyQuoteDiscount(subtotal, kind, value) {
    const v = value ?? 0;
    if (!kind || v <= 0)
        return subtotal;
    if (kind === 'percent') {
        const pct = Math.min(100, Math.max(0, v));
        return roundMoney2(Math.max(0, subtotal - (subtotal * pct) / 100));
    }
    return roundMoney2(Math.max(0, subtotal - v));
}
/** Valor absoluto do desconto geral, arredondado em centavos. */
function quoteDiscountAmount(subtotal, kind, value) {
    return roundMoney2(Math.max(0, subtotal - applyQuoteDiscount(subtotal, kind, value)));
}
