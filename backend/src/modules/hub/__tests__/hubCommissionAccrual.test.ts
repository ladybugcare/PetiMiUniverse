import {
  computeCommissionAmount,
  matchRuleForLine,
  type CommissionRuleRow,
} from '../hubCommissionCalc';
import {
  allocateLiquidLineAmounts,
  commissionAdjustmentForReturn,
} from '../hubReceivableFinancialBalance';

const rules: CommissionRuleRow[] = [
  {
    id: 'r-svc',
    hub_service_type_id: 'svc-1',
    hub_inventory_item_id: null,
    basis: 'percent_of_sale',
    rate: 10,
  },
  {
    id: 'r-prod',
    hub_service_type_id: null,
    hub_inventory_item_id: 'prod-1',
    basis: 'fixed_per_sale',
    rate: 15,
  },
  {
    id: 'r-zero',
    hub_service_type_id: 'svc-zero',
    hub_inventory_item_id: null,
    basis: 'percent_of_sale',
    rate: 0,
  },
];

describe('hubCommissionAccrual — cálculo puro', () => {
  it('matchRuleForLine prioriza serviço sobre produto', () => {
    expect(
      matchRuleForLine(rules, {
        hub_service_type_id: 'svc-1',
        hub_inventory_item_id: 'prod-1',
      })?.id,
    ).toBe('r-svc');
    expect(
      matchRuleForLine(rules, {
        hub_service_type_id: null,
        hub_inventory_item_id: 'prod-1',
      })?.id,
    ).toBe('r-prod');
    expect(
      matchRuleForLine(rules, {
        hub_service_type_id: 'outro',
        hub_inventory_item_id: null,
      }),
    ).toBeNull();
  });

  it('computeCommissionAmount percent e fixo com teto', () => {
    expect(computeCommissionAmount({ basis: 'percent_of_sale', rate: 10 }, 80)).toBe(8);
    expect(computeCommissionAmount({ basis: 'fixed_per_sale', rate: 15 }, 80)).toBe(15);
    expect(computeCommissionAmount({ basis: 'fixed_per_sale', rate: 15 }, 10)).toBe(10);
    expect(computeCommissionAmount({ basis: 'percent_of_sale', rate: 0 }, 100)).toBe(0);
    expect(computeCommissionAmount(null, 100)).toBe(0);
    expect(computeCommissionAmount({ basis: 'percent_of_sale', rate: 10 }, 0)).toBe(0);
  });

  it('fixed_per_unit multiplica pela quantidade e respeita teto da linha', () => {
    expect(computeCommissionAmount({ basis: 'fixed_per_unit', rate: 5 }, 500, 5)).toBe(25);
    expect(computeCommissionAmount({ basis: 'fixed_per_unit', rate: 5 }, 500, 1)).toBe(5);
    // Mesma qty=5 sem multiplicar no fixed_per_sale
    expect(computeCommissionAmount({ basis: 'fixed_per_sale', rate: 5 }, 500, 5)).toBe(5);
    // Teto: 5 × 5 = 25, mas linha só vale 12
    expect(computeCommissionAmount({ basis: 'fixed_per_unit', rate: 5 }, 12, 5)).toBe(12);
    // qty inválida cai para 1
    expect(computeCommissionAmount({ basis: 'fixed_per_unit', rate: 5 }, 100, 0)).toBe(5);
  });

  it('apuração com desconto de cabeçalho: base líquida + percent', () => {
    const liquids = allocateLiquidLineAmounts({
      lineTotals: [100, 100],
      originalAmount: 200,
      netAmountAtSale: 160,
    });
    expect(liquids).toEqual([80, 80]);
    const rule = matchRuleForLine(rules, {
      hub_service_type_id: 'svc-1',
      hub_inventory_item_id: null,
    });
    expect(computeCommissionAmount(rule, liquids[0]!)).toBe(8);
  });

  it('devolução parcial ajusta proporcionalmente (fixo e percent)', () => {
    const original = computeCommissionAmount({ basis: 'fixed_per_sale', rate: 15 }, 80);
    expect(original).toBe(15);
    expect(
      commissionAdjustmentForReturn({
        commissionOriginalAmount: original,
        commissionBasisAmount: 80,
        returnedCommercial: 40,
      }),
    ).toBe(7.5);
  });

  it('regra com rate zero produz comissão zero', () => {
    const rule = matchRuleForLine(rules, {
      hub_service_type_id: 'svc-zero',
      hub_inventory_item_id: null,
    });
    expect(rule?.rate).toBe(0);
    expect(computeCommissionAmount(rule, 100)).toBe(0);
  });
});
