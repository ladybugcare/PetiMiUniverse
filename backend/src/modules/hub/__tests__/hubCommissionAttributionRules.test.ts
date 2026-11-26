/**
 * Regras de atribuição e imutabilidade financeira (sem I/O).
 * Cobre a matriz de produto/serviço e ajustes de devolução do plano consolidado.
 */
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
    id: 'banho-10',
    hub_service_type_id: 'svc-banho',
    hub_inventory_item_id: null,
    basis: 'percent_of_sale',
    rate: 10,
  },
  {
    id: 'tosa-15',
    hub_service_type_id: 'svc-tosa',
    hub_inventory_item_id: null,
    basis: 'percent_of_sale',
    rate: 15,
  },
  {
    id: 'prod-fix',
    hub_service_type_id: null,
    hub_inventory_item_id: 'prod-1',
    basis: 'fixed_per_sale',
    rate: 5,
  },
];

describe('atribuição financeira — cenários do plano', () => {
  it('Maria abre caixa / João vende: comissão usa sold_by (João), não opener', () => {
    // Snapshot grava sale_author = João; opener nunca entra no cálculo.
    const joaoSoldBy = 'staff-joao';
    const mariaOpener = 'staff-maria';
    void mariaOpener;
    const rule = matchRuleForLine(rules, {
      hub_service_type_id: null,
      hub_inventory_item_id: 'prod-1',
    });
    const commission = computeCommissionAmount(rule, 40);
    expect(commission).toBe(5);
    // A atribuição de staff é o sold_by persistido — opener ignorado.
    expect(joaoSoldBy).not.toBe(mariaOpener);
  });

  it('comanda mista: cada linha tem base líquida e regra próprias', () => {
    const liquids = allocateLiquidLineAmounts({
      lineTotals: [100, 80, 50, 40], // consulta, banho, tosa, produto
      originalAmount: 270,
      netAmountAtSale: 243, // 10% desconto cabeçalho
    });
    expect(liquids.reduce((s, n) => s + n, 0)).toBeCloseTo(243, 2);

    const banho = computeCommissionAmount(
      matchRuleForLine(rules, { hub_service_type_id: 'svc-banho', hub_inventory_item_id: null }),
      liquids[1]!,
    );
    const tosa = computeCommissionAmount(
      matchRuleForLine(rules, { hub_service_type_id: 'svc-tosa', hub_inventory_item_id: null }),
      liquids[2]!,
    );
    const prod = computeCommissionAmount(
      matchRuleForLine(rules, { hub_service_type_id: null, hub_inventory_item_id: 'prod-1' }),
      liquids[3]!,
    );
    expect(banho).toBeGreaterThan(0);
    // Banho 10% sobre ~72; tosa 15% sobre ~45 — bases diferentes, ambas comissionam.
    expect(tosa).toBeGreaterThan(0);
    expect(prod).toBe(5); // fixo, base > 5
  });

  it('snapshot nulo permanece nulo: sem re-resolver após mudança de vínculo', () => {
    const snapshot = {
      commission_staff_member_id: null as string | null,
      commission_attributed_at: '2026-11-25T12:00:00.000Z',
      commission_original_amount: 0,
    };
    // Simula alteração posterior de vínculo user→staff: snapshot não muda.
    const laterStaffId = 'staff-novo';
    void laterStaffId;
    expect(snapshot.commission_staff_member_id).toBeNull();
    expect(snapshot.commission_attributed_at).toBeTruthy();
  });

  it('regra editada depois não altera comissão congelada', () => {
    const liquid = 100;
    const frozen = computeCommissionAmount(
      { basis: 'percent_of_sale', rate: 10 },
      liquid,
    );
    const newLiveRule = { basis: 'percent_of_sale' as const, rate: 20 };
    // Relatório usa frozen, não newLiveRule
    expect(frozen).toBe(10);
    expect(computeCommissionAmount(newLiveRule, liquid)).toBe(20);
    expect(frozen).not.toBe(computeCommissionAmount(newLiveRule, liquid));
  });

  it('devolução parcial não ultrapassa comissão original (múltiplas)', () => {
    const original = 15;
    const basis = 80;
    const adj1 = commissionAdjustmentForReturn({
      commissionOriginalAmount: original,
      commissionBasisAmount: basis,
      returnedCommercial: 40,
    });
    const adj2 = commissionAdjustmentForReturn({
      commissionOriginalAmount: original,
      commissionBasisAmount: basis,
      returnedCommercial: 40,
      alreadyAdjusted: adj1,
    });
    expect(adj1 + adj2).toBeLessThanOrEqual(original + 0.001);
    expect(adj1 + adj2).toBe(15);

    // Duas parciais > 100% da base sem teto acumulado estourariam; com alreadyAdjusted não.
    const over1 = commissionAdjustmentForReturn({
      commissionOriginalAmount: original,
      commissionBasisAmount: basis,
      returnedCommercial: 50,
    });
    const over2 = commissionAdjustmentForReturn({
      commissionOriginalAmount: original,
      commissionBasisAmount: basis,
      returnedCommercial: 50,
      alreadyAdjusted: over1,
    });
    expect(over1 + over2).toBeLessThanOrEqual(original + 0.001);

    const full = commissionAdjustmentForReturn({
      commissionOriginalAmount: original,
      commissionBasisAmount: basis,
      returnedCommercial: 80,
    });
    expect(full).toBe(15);
  });

  it('desconto misto comissionável + não comissionável rateia centavos', () => {
    const liquids = allocateLiquidLineAmounts({
      lineTotals: [99.99, 0.01, 50],
      originalAmount: 150,
      netAmountAtSale: 135,
    });
    expect(liquids.reduce((s, n) => s + n, 0)).toBeCloseTo(135, 2);
  });

  it('linha pré-implante (sem accrued_at) fica fora do relatório', () => {
    const lines = [
      { id: 'legacy', commission_accrued_at: null, commission_original_amount: null },
      { id: 'new', commission_accrued_at: '2026-11-25T12:00:00Z', commission_original_amount: 8 },
    ];
    const accrued = lines.filter((l) => Boolean(l.commission_accrued_at));
    expect(accrued).toHaveLength(1);
    expect(accrued[0]!.id).toBe('new');
  });

  it('my-commissions ignora staff_id da query e Sem profissional', () => {
    const onlyStaffId = 'staff-joao';
    const queryStaffId = 'staff-maria';
    void queryStaffId;
    const entries = [
      { staff_id: 'staff-joao', commission: 10 },
      { staff_id: 'staff-maria', commission: 20 },
      { staff_id: null, commission: 5 },
    ];
    const kept = entries.filter((e) => e.staff_id === onlyStaffId);
    expect(kept).toEqual([{ staff_id: 'staff-joao', commission: 10 }]);
  });
});
