"use strict";
/**
 * Política de preço na landing pública — Resolução CFMV nº 1.649/2025 art. 6º, V.
 * Só serviços padronizados podem expor valor; clínicos ficam sob avaliação.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLIC_PRICE_EVALUATION_NOTE = exports.PUBLIC_PRICE_ALLOWED_SERVICE_GROUPS = void 0;
exports.normalizeServiceGroupSlug = normalizeServiceGroupSlug;
exports.allowsPublicServicePrice = allowsPublicServicePrice;
exports.PUBLIC_PRICE_ALLOWED_SERVICE_GROUPS = [
    'banho_tosa',
    'hotel',
    'creche',
    'leva_traz',
];
exports.PUBLIC_PRICE_EVALUATION_NOTE = 'Valor sob avaliação veterinária.';
function normalizeServiceGroupSlug(raw) {
    const s = (raw ?? '').trim();
    return s || 'outros';
}
function allowsPublicServicePrice(group) {
    const g = normalizeServiceGroupSlug(group);
    return exports.PUBLIC_PRICE_ALLOWED_SERVICE_GROUPS.includes(g);
}
