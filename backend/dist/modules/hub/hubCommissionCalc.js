"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCommissionAmount = computeCommissionAmount;
exports.matchRuleForLine = matchRuleForLine;
/**
 * Cálculo puro de comissão (sem I/O) — usado na apuração e nos testes.
 *
 * Bases:
 * - percent_of_sale: % da base líquida da linha (já escala com qty via line_total)
 * - fixed_per_sale: valor fixo uma vez por linha
 * - fixed_per_unit: valor fixo × quantidade da linha (teto = base líquida)
 */
const hubReceivableFinancialBalance_1 = require("./hubReceivableFinancialBalance");
function normalizeQty(quantity) {
    const q = Number(quantity ?? 1);
    if (!Number.isFinite(q) || q <= 0)
        return 1;
    return q;
}
function computeCommissionAmount(rule, liquidBase, quantity = 1) {
    if (!rule || liquidBase <= 0.009)
        return 0;
    const rate = Number(rule.rate ?? 0);
    if (rule.basis === 'percent_of_sale') {
        return (0, hubReceivableFinancialBalance_1.round2Money)(liquidBase * (rate / 100));
    }
    if (rule.basis === 'fixed_per_unit') {
        return (0, hubReceivableFinancialBalance_1.round2Money)(Math.min(rate * normalizeQty(quantity), liquidBase));
    }
    // fixed_per_sale
    return (0, hubReceivableFinancialBalance_1.round2Money)(Math.min(rate, liquidBase));
}
function matchRuleForLine(rules, line) {
    if (line.hub_service_type_id) {
        const bySvc = rules.find((r) => r.hub_service_type_id === line.hub_service_type_id);
        if (bySvc)
            return bySvc;
    }
    if (line.hub_inventory_item_id) {
        const byProd = rules.find((r) => r.hub_inventory_item_id === line.hub_inventory_item_id);
        if (byProd)
            return byProd;
    }
    return null;
}
