import {
  computeReceivableFinancialAfterReturn,
  commercialReturnForLines,
  eligibleFinancialRefundCap,
  netPaidEffective,
  balanceDue,
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
});
