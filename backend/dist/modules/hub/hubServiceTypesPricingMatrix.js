"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pricingMatrixSchema = exports.pricingMatrixKmBandaSchema = exports.pricingMatrixConsultaSchema = exports.pricingMatrixPeriodoSchema = exports.pricingMatrixPortePelagemSchema = exports.pricingMatrixPelagemSchema = exports.pricingMatrixPorteSchema = exports.COAT_TYPE_VALUES = exports.PORTE_VALUES = void 0;
exports.roundMoney2 = roundMoney2;
exports.computeReferenceAmountsFromMatrix = computeReferenceAmountsFromMatrix;
exports.serviceGroupAllowsPricingMatrix = serviceGroupAllowsPricingMatrix;
exports.pricingMatrixKindMatchesGroup = pricingMatrixKindMatchesGroup;
exports.assertUniqueTierKeys = assertUniqueTierKeys;
exports.parsePricingMatrixJson = parsePricingMatrixJson;
const zod_1 = require("zod");
const moneyAmountSchema = zod_1.z.coerce.number().finite().min(0).max(99_999_999.99);
exports.PORTE_VALUES = ['filhote', 'mini', 'pequeno', 'medio', 'grande', 'gigante'];
const porteEnum = zod_1.z.enum(exports.PORTE_VALUES);
exports.COAT_TYPE_VALUES = ['curto', 'medio', 'longo', 'duplo', 'encaracolado', 'sem_pelo', 'outro'];
const coatTypeEnum = zod_1.z.enum(exports.COAT_TYPE_VALUES);
exports.pricingMatrixPorteSchema = zod_1.z.object({
    kind: zod_1.z.literal('porte'),
    tiers: zod_1.z
        .array(zod_1.z.object({
        porte: porteEnum,
        cost_amount: moneyAmountSchema,
        sale_amount: moneyAmountSchema,
    }))
        .min(1),
});
exports.pricingMatrixPelagemSchema = zod_1.z.object({
    kind: zod_1.z.literal('pelagem'),
    tiers: zod_1.z
        .array(zod_1.z.object({
        coat_type: coatTypeEnum,
        cost_amount: moneyAmountSchema,
        sale_amount: moneyAmountSchema,
    }))
        .min(1),
});
exports.pricingMatrixPortePelagemSchema = zod_1.z.object({
    kind: zod_1.z.literal('porte_pelagem'),
    tiers: zod_1.z
        .array(zod_1.z.object({
        porte: porteEnum,
        coat_type: coatTypeEnum,
        cost_amount: moneyAmountSchema,
        sale_amount: moneyAmountSchema,
    }))
        .min(1),
});
exports.pricingMatrixPeriodoSchema = zod_1.z.object({
    kind: zod_1.z.literal('periodo'),
    tiers: zod_1.z
        .array(zod_1.z.object({
        period: zod_1.z.enum(['full_day', 'half_day']),
        cost_amount: moneyAmountSchema,
        sale_amount: moneyAmountSchema,
    }))
        .min(1),
});
exports.pricingMatrixConsultaSchema = zod_1.z.object({
    kind: zod_1.z.literal('consulta'),
    tiers: zod_1.z
        .array(zod_1.z.object({
        consult_type: zod_1.z.enum(['padrao', 'retorno']),
        cost_amount: moneyAmountSchema,
        /** Consulta de retorno gratuita: use 0. */
        sale_amount: moneyAmountSchema,
    }))
        .min(1),
});
exports.pricingMatrixKmBandaSchema = zod_1.z.object({
    kind: zod_1.z.literal('km_banda'),
    tiers: zod_1.z
        .array(zod_1.z.object({
        label: zod_1.z.string().trim().min(1).max(120),
        km_min: zod_1.z.number().finite().min(0).nullable().optional(),
        km_max: zod_1.z.number().finite().min(0).nullable().optional(),
        cost_amount: moneyAmountSchema,
        sale_amount: moneyAmountSchema,
    }))
        .min(1),
});
exports.pricingMatrixSchema = zod_1.z.discriminatedUnion('kind', [
    exports.pricingMatrixPorteSchema,
    exports.pricingMatrixPelagemSchema,
    exports.pricingMatrixPortePelagemSchema,
    exports.pricingMatrixPeriodoSchema,
    exports.pricingMatrixConsultaSchema,
    exports.pricingMatrixKmBandaSchema,
]);
function roundMoney2(n) {
    return Math.round(n * 100) / 100;
}
/** Menor venda entre tiers + custo do mesmo tier (primeiro em empate de venda). Usado para preencher cost_amount/sale_amount de referência. */
function computeReferenceAmountsFromMatrix(matrix) {
    const tiers = matrix.tiers;
    if (tiers.length === 0)
        return { cost_amount: 0, sale_amount: 0 };
    let bestIdx = 0;
    let bestSale = tiers[0].sale_amount;
    for (let i = 1; i < tiers.length; i++) {
        if (tiers[i].sale_amount < bestSale) {
            bestSale = tiers[i].sale_amount;
            bestIdx = i;
        }
    }
    return {
        cost_amount: roundMoney2(tiers[bestIdx].cost_amount),
        sale_amount: roundMoney2(tiers[bestIdx].sale_amount),
    };
}
function serviceGroupAllowsPricingMatrix(g) {
    return g === 'banho_tosa' || g === 'hotel' || g === 'creche' || g === 'clinica' || g === 'leva_traz';
}
function pricingMatrixKindMatchesGroup(group, matrix) {
    if (!serviceGroupAllowsPricingMatrix(group)) {
        return { error: 'Este grupo não suporta matriz de preços' };
    }
    if (group === 'banho_tosa') {
        if (matrix.kind !== 'porte' && matrix.kind !== 'pelagem' && matrix.kind !== 'porte_pelagem') {
            return { error: 'Para Banho & Tosa, use preços por porte, pelagem ou porte + pelagem' };
        }
        return true;
    }
    if (group === 'hotel') {
        if (matrix.kind !== 'porte')
            return { error: 'Para Hotel, a matriz deve ser por porte' };
        return true;
    }
    if (group === 'creche') {
        if (matrix.kind !== 'periodo')
            return { error: 'Para Creche, a matriz deve ser por período (dia completo / meio dia)' };
        return true;
    }
    if (group === 'clinica') {
        if (matrix.kind !== 'consulta')
            return { error: 'Para Clínica, a matriz deve ser por tipo de consulta' };
        return true;
    }
    if (group === 'leva_traz') {
        if (matrix.kind !== 'km_banda')
            return { error: 'Para Leva e Traz, a matriz deve ser por faixa de quilometragem' };
        return true;
    }
    return true;
}
function tierKeys(matrix) {
    switch (matrix.kind) {
        case 'porte':
            return matrix.tiers.map((t) => t.porte);
        case 'pelagem':
            return matrix.tiers.map((t) => t.coat_type);
        case 'porte_pelagem':
            return matrix.tiers.map((t) => `${t.porte}|${t.coat_type}`);
        case 'periodo':
            return matrix.tiers.map((t) => t.period);
        case 'consulta':
            return matrix.tiers.map((t) => t.consult_type);
        case 'km_banda':
            return matrix.tiers.map((t, i) => `${t.label}#${i}`);
        default:
            return [];
    }
}
/** Rejeita chaves duplicadas (mesmo porte, mesmo período, etc.). */
function assertUniqueTierKeys(matrix) {
    const keys = tierKeys(matrix);
    const seen = new Set();
    for (const k of keys) {
        if (seen.has(k)) {
            return { error: 'Cada linha da matriz deve ter uma chave distinta (sem portes ou períodos duplicados)' };
        }
        seen.add(k);
    }
    return true;
}
function parsePricingMatrixJson(raw) {
    if (raw === null || raw === undefined)
        return null;
    const parsed = exports.pricingMatrixSchema.safeParse(raw);
    if (!parsed.success) {
        return { error: 'Matriz de preços inválida' };
    }
    const uniq = assertUniqueTierKeys(parsed.data);
    if (uniq !== true)
        return uniq;
    return parsed.data;
}
