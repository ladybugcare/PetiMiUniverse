"use strict";
/**
 * Regras de preço/desconto na venda de produto de estoque.
 * Campos do catálogo: sale_amount, max_sale_discount_pct, allow_price_override_on_sale.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProductSalePricing = validateProductSalePricing;
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
/** Valida unit_amount e discount_amount de uma linha de produto contra o catálogo. */
function validateProductSalePricing(params) {
    const { item, quantity, unit_amount, discount_amount } = params;
    const catalogPrice = round2(Number(item.sale_amount ?? 0));
    const unit = round2(Number(unit_amount));
    const discount = round2(Number(discount_amount ?? 0));
    const qty = Number(quantity);
    if (!(qty > 0)) {
        return { ok: false, error: `Quantidade inválida para o produto ${item.name ?? item.id}` };
    }
    const allowOverride = Boolean(item.allow_price_override_on_sale);
    if (!allowOverride && Math.abs(unit - catalogPrice) > 0.009) {
        return {
            ok: false,
            error: `Preço do produto "${item.name ?? item.id}" não pode ser alterado (catálogo: R$ ${catalogPrice.toFixed(2)}).`,
        };
    }
    const maxPct = Math.max(0, Math.min(100, Number(item.max_sale_discount_pct ?? 0)));
    const gross = round2(qty * unit);
    const maxDiscount = round2((gross * maxPct) / 100);
    if (discount > maxDiscount + 0.009) {
        return {
            ok: false,
            error: `Desconto do produto "${item.name ?? item.id}" excede o máximo permitido (${maxPct}%).`,
        };
    }
    if (discount > gross + 0.009) {
        return {
            ok: false,
            error: `Desconto do produto "${item.name ?? item.id}" não pode exceder o total da linha.`,
        };
    }
    return { ok: true };
}
