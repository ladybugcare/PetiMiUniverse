import {
  computeReceivableFinancialAfterReturn,
  commercialReturnForLines,
  allocateLiquidLineAmounts,
  attachReceivableBalanceFields,
  commissionAdjustmentForReturn,
  eligibleFinancialRefundCap,
  netPaidEffective,
  balanceDue,
  receivableBalanceFields,
} from '../hubReceivableFinancialBalance';

describe('hubReceivableFinancialBalance — matriz comercial × financeiro', () => {
  const base = {
    netAmountAtSale: 150,
    returnedAmountBefore: 0,
    commercialReturnNow: 100,
    lineRefundsAlreadyPaidOut: 0,
  };

  const cases: Array<{
    paid: number;
    refund: number;
    due: number;
    netPaid: number;
    status: string;
  }> = [
    { paid: 0, refund: 0, due: 50, netPaid: 0, status: 'pending' },
    { paid: 30, refund: 0, due: 20, netPaid: 30, status: 'partially_paid' },
    { paid: 50, refund: 0, due: 0, netPaid: 50, status: 'paid' },
    { paid: 80, refund: 30, due: 0, netPaid: 50, status: 'paid' },
    { paid: 150, refund: 100, due: 0, netPaid: 50, status: 'paid' },
  ];

  it.each(cases)(
    'pago $paid → refund $refund, líquido $netPaid, a receber $due, status $status',
    ({ paid, refund, due, netPaid, status }) => {
      const snap = computeReceivableFinancialAfterReturn({
        ...base,
        postedPayments: paid,
      });
      expect(snap.commercialReturnedNow).toBe(100);
      expect(snap.finalAmountAfter).toBe(50);
      expect(snap.financialRefundNow).toBe(refund);
      expect(snap.netPaidEffectiveAfter).toBe(netPaid);
      expect(snap.balanceDueAfter).toBe(due);
      expect(snap.suggestedStatus).toBe(status);
    },
  );

  it('após devolução parcial paga: vigente 50, líquido 50, a receber 0, elegível restante 50', () => {
    // Venda 150, pago 150, devolução comercial 100 com refund financeiro 100 já liquidado.
    const posted = 150;
    const final = 50;
    const lineRefunds = 100;
    expect(netPaidEffective({ postedPayments: posted, lineRefundsAlreadyPaidOut: lineRefunds })).toBe(50);
    expect(balanceDue({ finalAmount: final, postedPayments: posted, lineRefundsAlreadyPaidOut: lineRefunds })).toBe(0);
    expect(
      eligibleFinancialRefundCap({
        postedPayments: posted,
        finalAmount: final,
        lineRefundsAlreadyPaidOut: lineRefunds,
      }),
    ).toBe(0);
    // Saldo comercial restante ainda elegível se devolver o resto (50).
    const next = computeReceivableFinancialAfterReturn({
      netAmountAtSale: 150,
      returnedAmountBefore: 100,
      commercialReturnNow: 50,
      postedPayments: posted,
      lineRefundsAlreadyPaidOut: lineRefunds,
    });
    expect(next.financialRefundNow).toBe(50);
    expect(next.finalAmountAfter).toBe(0);
    expect(next.netPaidEffectiveAfter).toBe(0);
    expect(next.balanceDueAfter).toBe(0);
  });

  it('segunda devolução não double-count de line refunds já liquidados', () => {
    const snap = computeReceivableFinancialAfterReturn({
      netAmountAtSale: 150,
      returnedAmountBefore: 50,
      commercialReturnNow: 50,
      postedPayments: 150,
      lineRefundsAlreadyPaidOut: 50,
    });
    expect(snap.finalAmountAfter).toBe(50);
    expect(snap.financialRefundNow).toBe(50);
    expect(snap.suggestedStatus).toBe('paid');
  });

  it('venda não paga e integralmente desfeita → cancelled', () => {
    const snap = computeReceivableFinancialAfterReturn({
      netAmountAtSale: 100,
      returnedAmountBefore: 0,
      commercialReturnNow: 100,
      postedPayments: 0,
      lineRefundsAlreadyPaidOut: 0,
    });
    expect(snap.finalAmountAfter).toBe(0);
    expect(snap.financialRefundNow).toBe(0);
    expect(snap.suggestedStatus).toBe('cancelled');
  });

  it('venda paga e integralmente reembolsada → refunded', () => {
    const snap = computeReceivableFinancialAfterReturn({
      netAmountAtSale: 100,
      returnedAmountBefore: 0,
      commercialReturnNow: 100,
      postedPayments: 100,
      lineRefundsAlreadyPaidOut: 0,
    });
    expect(snap.financialRefundNow).toBe(100);
    expect(snap.suggestedStatus).toBe('refunded');
  });

  it('eligibleFinancialRefundCap não usa payments reversed', () => {
    expect(
      eligibleFinancialRefundCap({
        postedPayments: 150,
        finalAmount: 50,
        lineRefundsAlreadyPaidOut: 100,
      }),
    ).toBe(0);
  });

  it('commercialReturnForLines aplica fator de desconto', () => {
    expect(
      commercialReturnForLines({
        lineTotals: [100],
        originalAmount: 200,
        netAmountAtSale: 150,
      }),
    ).toBe(75);
  });

  it('allocateLiquidLineAmounts soma exatamente o líquido (maior resto)', () => {
    const liquids = allocateLiquidLineAmounts({
      lineTotals: [100, 100, 100],
      originalAmount: 300,
      netAmountAtSale: 100,
    });
    expect(liquids).toEqual([33.34, 33.33, 33.33]);
    expect(liquids.reduce((s, n) => s + n, 0)).toBeCloseTo(100, 2);
  });

  it('allocateLiquidLineAmounts inclui linhas não comissionáveis no rateio', () => {
    const liquids = allocateLiquidLineAmounts({
      lineTotals: [80, 20],
      originalAmount: 100,
      netAmountAtSale: 90,
    });
    expect(liquids[0]).toBe(72);
    expect(liquids[1]).toBe(18);
    expect(liquids.reduce((s, n) => s + n, 0)).toBe(90);
  });

  it('allocateLiquidLineAmounts sem desconto devolve line_totals', () => {
    expect(
      allocateLiquidLineAmounts({
        lineTotals: [50, 25],
        originalAmount: 75,
        netAmountAtSale: 75,
      }),
    ).toEqual([50, 25]);
  });

  it('commissionAdjustmentForReturn é proporcional (percent e fixo)', () => {
    expect(
      commissionAdjustmentForReturn({
        commissionOriginalAmount: 10,
        commissionBasisAmount: 100,
        returnedCommercial: 50,
      }),
    ).toBe(5);
    expect(
      commissionAdjustmentForReturn({
        commissionOriginalAmount: 15,
        commissionBasisAmount: 80,
        returnedCommercial: 80,
      }),
    ).toBe(15);
    expect(
      commissionAdjustmentForReturn({
        commissionOriginalAmount: 15,
        commissionBasisAmount: 80,
        returnedCommercial: 40,
      }),
    ).toBe(7.5);
  });
});

describe('receivableBalanceFields / attachReceivableBalanceFields — paridade list/aging/detalhe', () => {
  it('P0 parcial: final 100, posted 40 → saldo 60', () => {
    const fields = receivableBalanceFields({
      finalAmount: 100,
      postedPayments: 40,
      lineRefundsAlreadyPaidOut: 0,
    });
    expect(fields.posted_amount).toBe(40);
    expect(fields.line_refunds_amount).toBe(0);
    expect(fields.paid_amount).toBe(40);
    expect(fields.balance_amount).toBe(60);
    expect(
      balanceDue({ finalAmount: 100, postedPayments: 40, lineRefundsAlreadyPaidOut: 0 }),
    ).toBe(fields.balance_amount);
  });

  it('parcial + reembolso de linha: list = aging = detalhe', () => {
    // final 100, pago 100, line refund 40 → pago líquido 60 → saldo 40
    const input = {
      finalAmount: 100,
      postedPayments: 100,
      lineRefundsAlreadyPaidOut: 40,
    };
    const fields = receivableBalanceFields(input);
    const due = balanceDue(input);
    expect(fields.paid_amount).toBe(60);
    expect(fields.balance_amount).toBe(40);
    expect(fields.balance_amount).toBe(due);
    // aging soma o mesmo valor por linha
    expect(due).toBe(40);
  });

  it('attachReceivableBalanceFields em array bate com os mapas', () => {
    const rows = [
      { id: 'a', final_amount: 100 },
      { id: 'b', final_amount: 50 },
    ];
    const postedByRec = new Map([
      ['a', 40],
      ['b', 50],
    ]);
    const lineRefundByRec = new Map([['a', 0]]);
    const enriched = attachReceivableBalanceFields(rows, postedByRec, lineRefundByRec);
    expect(enriched[0].balance_amount).toBe(60);
    expect(enriched[0].paid_amount).toBe(40);
    expect(enriched[1].balance_amount).toBe(0);
    expect(enriched[1].paid_amount).toBe(50);
    // soma dos saldos = o que o aging agregaria para as mesmas linhas
    const agingTotal = enriched.reduce((s, r) => s + (r.balance_amount > 0.009 ? r.balance_amount : 0), 0);
    expect(agingTotal).toBe(60);
  });
});
