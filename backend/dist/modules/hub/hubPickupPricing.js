"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitMoneyTotalAcrossTwoLegs = splitMoneyTotalAcrossTwoLegs;
exports.normalizePickupPriceScope = normalizePickupPriceScope;
exports.resolvePickupLegAmounts = resolvePickupLegAmounts;
const hubServiceTypesPricingMatrix_1 = require("./hubServiceTypesPricingMatrix");
/** Reparte um total comercial em duas linhas com soma exacta. */
function splitMoneyTotalAcrossTwoLegs(total) {
    const a = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(total / 2);
    const b = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(total - a);
    return [a, b];
}
function normalizePickupPriceScope(raw) {
    return String(raw ?? '').trim() === 'per_leg' ? 'per_leg' : 'round_trip';
}
/**
 * Resolve valores cobrados por perna a partir do valor cadastrado (catálogo).
 * - round_trip: catálogo = ida+volta → cada perna = metade; 1 perna = metade.
 * - per_leg: catálogo = uma perna → cada perna = catálogo; ida+volta = 2×.
 */
function resolvePickupLegAmounts(catalogSale, catalogCost, scope, legCount) {
    const sale = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(catalogSale) || 0);
    const cost = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(Number(catalogCost) || 0);
    if (scope === 'per_leg') {
        const saleLegs = legCount === 2 ? [sale, sale] : [sale];
        const costLegs = legCount === 2 ? [cost, cost] : [cost];
        return {
            saleLegs,
            costLegs,
            totalSale: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(sale * legCount),
            totalCost: (0, hubServiceTypesPricingMatrix_1.roundMoney2)(cost * legCount),
        };
    }
    // round_trip
    if (legCount === 2) {
        const saleLegs = splitMoneyTotalAcrossTwoLegs(sale);
        const costLegs = splitMoneyTotalAcrossTwoLegs(cost);
        return {
            saleLegs: [...saleLegs],
            costLegs: [...costLegs],
            totalSale: sale,
            totalCost: cost,
        };
    }
    const halfSale = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(sale / 2);
    const halfCost = (0, hubServiceTypesPricingMatrix_1.roundMoney2)(cost / 2);
    return {
        saleLegs: [halfSale],
        costLegs: [halfCost],
        totalSale: halfSale,
        totalCost: halfCost,
    };
}
