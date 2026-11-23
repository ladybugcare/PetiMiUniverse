/**
 * Modelo compartilhado de saldo financeiro do recebível (Etapa A).
 * Espelha a semântica da RPC hub_return_receivable_product_lines.
 *
 * - commercial_returned: valor comercial devolvido (linhas)
 * - financial_refund: caixa/crédito a devolver agora
 * - Não desconta novamente refunds já representados por payments reversed
 */

export function round2Money(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export type ReceivableFinancialInputs = {
  /** Snapshot do líquido na finalização da venda (obrigatório para operar). */
  netAmountAtSale: number;
  /** Acumulado comercial já devolvido (antes desta operação). */
  returnedAmountBefore: number;
  /** Valor comercial desta devolução. */
  commercialReturnNow: number;
  /** Soma de payments status=posted. */
  postedPayments: number;
  /**
   * Soma de adjustments adjustment_type=refund com payment_id IS NULL
   * (reembolsos de linha / caixa já liquidados sem reverter o payment).
   */
  lineRefundsAlreadyPaidOut: number;
};

export type ReceivableFinancialSnapshot = {
  commercialReturnedNow: number;
  returnedAmountAfter: number;
  finalAmountAfter: number;
  /** Quanto deve ter sido reembolsado em caixa/crédito no total após esta op. */
  overpayTarget: number;
  /** Reembolso financeiro desta operação. */
  financialRefundNow: number;
  balanceDueAfter: number;
  /** Status sugerido após a operação (sem soft-reverse extra). */
  suggestedStatus: 'pending' | 'partially_paid' | 'paid' | 'refunded' | 'cancelled';
};

/**
 * Calcula líquido vigente, reembolso financeiro e saldo a receber.
 *
 * Matriz (venda 150, devolução comercial 100 → líquido 50):
 * pago 0 → refund 0, a receber 50
 * pago 30 → refund 0, a receber 20
 * pago 50 → refund 0, quitado
 * pago 80 → refund 30, quitado
 * pago 150 → refund 100, quitado
 */
export function computeReceivableFinancialAfterReturn(
  input: ReceivableFinancialInputs,
): ReceivableFinancialSnapshot {
  const net = round2Money(input.netAmountAtSale);
  const returnedBefore = round2Money(input.returnedAmountBefore);
  const commercialNow = round2Money(input.commercialReturnNow);
  const posted = round2Money(input.postedPayments);
  const lineRefundsBefore = round2Money(input.lineRefundsAlreadyPaidOut);

  if (!(net >= 0) || !(commercialNow >= 0) || !(returnedBefore >= 0)) {
    throw new Error('Valores comerciais inválidos');
  }
  if (round2Money(returnedBefore + commercialNow) > net + 0.009) {
    throw new Error('Valor comercial devolvido excede o líquido da venda');
  }

  const returnedAfter = round2Money(returnedBefore + commercialNow);
  const finalAfter = round2Money(Math.max(0, net - returnedAfter));
  const overpayTarget = round2Money(Math.max(0, posted - finalAfter));
  const financialRefundNow = round2Money(Math.max(0, overpayTarget - lineRefundsBefore));
  const balanceDueAfter = round2Money(Math.max(0, finalAfter - posted));

  let suggestedStatus: ReceivableFinancialSnapshot['suggestedStatus'];
  if (finalAfter <= 0.009) {
    // Venda integralmente desfeita: paga+reembolsada → refunded; nunca paga → cancelled
    suggestedStatus = posted > 0.009 || lineRefundsBefore > 0.009 || financialRefundNow > 0.009
      ? 'refunded'
      : 'cancelled';
  } else if (posted <= 0.009) {
    suggestedStatus = 'pending';
  } else if (posted >= finalAfter - 0.009) {
    suggestedStatus = 'paid';
  } else {
    suggestedStatus = 'partially_paid';
  }

  return {
    commercialReturnedNow: commercialNow,
    returnedAmountAfter: returnedAfter,
    finalAmountAfter: finalAfter,
    overpayTarget,
    financialRefundNow,
    balanceDueAfter,
    suggestedStatus,
  };
}

/** Teto elegível a reembolso financeiro adicional (sem double-count de payment reversed). */
export function eligibleFinancialRefundCap(input: {
  postedPayments: number;
  finalAmount: number;
  lineRefundsAlreadyPaidOut: number;
}): number {
  const overpay = round2Money(Math.max(0, round2Money(input.postedPayments) - round2Money(input.finalAmount)));
  return round2Money(Math.max(0, overpay - round2Money(input.lineRefundsAlreadyPaidOut)));
}

/**
 * Rateio do valor comercial da linha pelo desconto da venda.
 * line_total é bruto da linha; liquid_share = line_total * (net_at_sale / original_amount).
 */
export function commercialReturnForLines(opts: {
  lineTotals: number[];
  originalAmount: number;
  netAmountAtSale: number;
}): number {
  const original = round2Money(opts.originalAmount);
  const net = round2Money(opts.netAmountAtSale);
  const sumLines = round2Money(opts.lineTotals.reduce((s, n) => s + Number(n || 0), 0));
  if (original <= 0.009) return sumLines;
  const factor = net / original;
  return round2Money(sumLines * factor);
}
