"use strict";
/**
 * Helpers de conteúdo por embalagem (ex.: 10 ml por frasco).
 * Compartilhado conceitualmente entre backend e UI.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEARLY_EMPTY_FRACTION = exports.STOCK_UNITS_REQUIRING_CONTENT = exports.STOCK_UNITS_THAT_ARE_CONSUMPTION = void 0;
exports.normalizeUnitLabel = normalizeUnitLabel;
exports.stockUnitRequiresContent = stockUnitRequiresContent;
exports.stockUnitIsConsumption = stockUnitIsConsumption;
exports.stockQtyFromConsumption = stockQtyFromConsumption;
exports.isNearlyEmptyLotBalance = isNearlyEmptyLotBalance;
exports.crossedNearlyEmptyThreshold = crossedNearlyEmptyThreshold;
exports.roundStockQty = roundStockQty;
/** Unidades de estoque que já são unidade de consumo — sem campo de conteúdo. */
exports.STOCK_UNITS_THAT_ARE_CONSUMPTION = new Set([
    'ml',
    'litro',
    'l',
    'g',
    'kg',
]);
/** Unidades de estoque que exigem conteúdo (ml) no cadastro. */
exports.STOCK_UNITS_REQUIRING_CONTENT = new Set(['frasco', 'ampola']);
exports.NEARLY_EMPTY_FRACTION = 0.2;
function normalizeUnitLabel(unit) {
    return String(unit ?? '')
        .trim()
        .toLowerCase();
}
function stockUnitRequiresContent(unitLabel) {
    return exports.STOCK_UNITS_REQUIRING_CONTENT.has(normalizeUnitLabel(unitLabel));
}
function stockUnitIsConsumption(unitLabel) {
    return exports.STOCK_UNITS_THAT_ARE_CONSUMPTION.has(normalizeUnitLabel(unitLabel));
}
/**
 * Converte quantidade digitada na unidade de conteúdo para a unidade de estoque.
 * Sem contentQty: quantidade já está na unidade de estoque.
 */
function stockQtyFromConsumption(consumed, contentQty) {
    const c = Number(consumed);
    if (!Number.isFinite(c) || c <= 0)
        return NaN;
    const content = contentQty == null ? null : Number(contentQty);
    if (content == null || !Number.isFinite(content) || content <= 0) {
        return Math.round(c * 10000) / 10000;
    }
    return Math.round((c / content) * 10000) / 10000;
}
/** Lote “quase vazio”: 0 < saldo < 20% de 1 unidade de estoque (só faz sentido com conteúdo). */
function isNearlyEmptyLotBalance(lotQty, hasContent, fraction = exports.NEARLY_EMPTY_FRACTION) {
    if (!hasContent)
        return false;
    const q = Number(lotQty);
    if (!Number.isFinite(q))
        return false;
    return q > 0 && q < fraction;
}
/** Travessia do limiar: antes >= 20%, depois < 20% (e ainda > 0). */
function crossedNearlyEmptyThreshold(qtyBefore, qtyAfter, hasContent, fraction = exports.NEARLY_EMPTY_FRACTION) {
    if (!hasContent)
        return false;
    const before = Number(qtyBefore);
    const after = Number(qtyAfter);
    if (!Number.isFinite(before) || !Number.isFinite(after))
        return false;
    return before >= fraction && after > 0 && after < fraction;
}
function roundStockQty(n) {
    return Math.round((n + Number.EPSILON) * 10000) / 10000;
}
