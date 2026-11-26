/**
 * Cálculo puro de comissão (sem I/O) — usado na apuração e nos testes.
 *
 * Bases:
 * - percent_of_sale: % da base líquida da linha (já escala com qty via line_total)
 * - fixed_per_sale: valor fixo uma vez por linha
 * - fixed_per_unit: valor fixo × quantidade da linha (teto = base líquida)
 */
import { round2Money } from './hubReceivableFinancialBalance';

export type CommissionRuleBasis = 'percent_of_sale' | 'fixed_per_sale' | 'fixed_per_unit';

export type CommissionRuleRow = {
  id: string;
  hub_service_type_id: string | null;
  hub_inventory_item_id: string | null;
  basis: CommissionRuleBasis;
  rate: number;
};

function normalizeQty(quantity: number | null | undefined): number {
  const q = Number(quantity ?? 1);
  if (!Number.isFinite(q) || q <= 0) return 1;
  return q;
}

export function computeCommissionAmount(
  rule: { basis: string; rate: number } | null | undefined,
  liquidBase: number,
  quantity: number = 1,
): number {
  if (!rule || liquidBase <= 0.009) return 0;
  const rate = Number(rule.rate ?? 0);
  if (rule.basis === 'percent_of_sale') {
    return round2Money(liquidBase * (rate / 100));
  }
  if (rule.basis === 'fixed_per_unit') {
    return round2Money(Math.min(rate * normalizeQty(quantity), liquidBase));
  }
  // fixed_per_sale
  return round2Money(Math.min(rate, liquidBase));
}

export function matchRuleForLine(
  rules: CommissionRuleRow[],
  line: { hub_service_type_id: string | null; hub_inventory_item_id: string | null },
): CommissionRuleRow | null {
  if (line.hub_service_type_id) {
    const bySvc = rules.find((r) => r.hub_service_type_id === line.hub_service_type_id);
    if (bySvc) return bySvc;
  }
  if (line.hub_inventory_item_id) {
    const byProd = rules.find((r) => r.hub_inventory_item_id === line.hub_inventory_item_id);
    if (byProd) return byProd;
  }
  return null;
}
