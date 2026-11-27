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
  /**
   * Pago líquido efetivo após a operação (= posted − line_refunds_after).
   * Não confundir com Σ payments posted bruto quando há refunds de linha.
   */
  netPaidEffectiveAfter: number;
  balanceDueAfter: number;
  /** Status sugerido após a operação (sem soft-reverse extra). */
  suggestedStatus: 'pending' | 'partially_paid' | 'paid' | 'refunded' | 'cancelled';
};

/**
 * Pago líquido efetivo: posted ativo menos reembolsos de linha já liquidados
 * (que não revertem o payment). Refunds de payment reverse já saem de posted.
 */
export function netPaidEffective(input: {
  postedPayments: number;
  lineRefundsAlreadyPaidOut: number;
}): number {
  return round2Money(
    Math.max(0, round2Money(input.postedPayments) - round2Money(input.lineRefundsAlreadyPaidOut)),
  );
}

/**
 * Saldo a receber coerente com refunds de linha:
 * max(0, final − net_paid_effective).
 * Equivale a max(0, final − posted) quando não há line refunds;
 * com line refunds, evita “crédito fictício” e AR negativo enganoso.
 */
export function balanceDue(input: {
  finalAmount: number;
  postedPayments: number;
  lineRefundsAlreadyPaidOut: number;
}): number {
  return round2Money(
    Math.max(
      0,
      round2Money(input.finalAmount) -
        netPaidEffective({
          postedPayments: input.postedPayments,
          lineRefundsAlreadyPaidOut: input.lineRefundsAlreadyPaidOut,
        }),
    ),
  );
}

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
  const lineRefundsAfter = round2Money(lineRefundsBefore + financialRefundNow);
  const netPaidAfter = netPaidEffective({
    postedPayments: posted,
    lineRefundsAlreadyPaidOut: lineRefundsAfter,
  });
  const balanceDueAfter = balanceDue({
    finalAmount: finalAfter,
    postedPayments: posted,
    lineRefundsAlreadyPaidOut: lineRefundsAfter,
  });

  let suggestedStatus: ReceivableFinancialSnapshot['suggestedStatus'];
  if (finalAfter <= 0.009) {
    // Venda integralmente desfeita: paga+reembolsada → refunded; nunca paga → cancelled
    suggestedStatus = posted > 0.009 || lineRefundsBefore > 0.009 || financialRefundNow > 0.009
      ? 'refunded'
      : 'cancelled';
  } else if (netPaidAfter <= 0.009) {
    suggestedStatus = 'pending';
  } else if (netPaidAfter >= finalAfter - 0.009) {
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
    netPaidEffectiveAfter: netPaidAfter,
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

/**
 * Distribui o líquido comercial (após desconto de cabeçalho) entre as linhas.
 * Usa arredondamento round2 com método do maior resto para que
 * Σ liquid_i = netAmountAtSale (quando original > 0).
 *
 * Inclui linhas não comissionáveis no rateio — o desconto cabeçalho
 * aplica-se a todas as linhas do recebível.
 */
export function allocateLiquidLineAmounts(opts: {
  lineTotals: number[];
  originalAmount: number;
  netAmountAtSale: number;
}): number[] {
  const totals = opts.lineTotals.map((n) => round2Money(Number(n || 0)));
  const original = round2Money(opts.originalAmount);
  const net = round2Money(opts.netAmountAtSale);

  if (totals.length === 0) return [];
  if (original <= 0.009) return totals.map((t) => round2Money(t));

  const factor = net / original;
  const floored = totals.map((t) => {
    const raw = t * factor;
    return Math.floor(raw * 100 + Number.EPSILON) / 100;
  });
  const sumFloored = round2Money(floored.reduce((s, n) => s + n, 0));
  let remainderCents = Math.round((net - sumFloored) * 100);

  // Ordena por maior fração residual (maior resto) para distribuir centavos.
  const remainders = totals.map((t, i) => {
    const raw = t * factor;
    const frac = raw * 100 - Math.floor(raw * 100 + Number.EPSILON);
    return { i, frac, lineTotal: t };
  });
  remainders.sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    if (b.lineTotal !== a.lineTotal) return b.lineTotal - a.lineTotal;
    return a.i - b.i;
  });

  const result = [...floored];
  let idx = 0;
  while (remainderCents > 0 && remainders.length > 0) {
    const target = remainders[idx % remainders.length]!.i;
    result[target] = round2Money(result[target]! + 0.01);
    remainderCents -= 1;
    idx += 1;
  }
  // Se net < sumFloored (arredondamento para cima improvável com floor), remove centavos.
  while (remainderCents < 0 && remainders.length > 0) {
    const target = remainders[(remainders.length - 1 - (idx % remainders.length) + remainders.length) % remainders.length]!.i;
    if (result[target]! >= 0.01) {
      result[target] = round2Money(result[target]! - 0.01);
      remainderCents += 1;
    }
    idx += 1;
    if (idx > remainders.length * 3) break;
  }

  return result.map((n) => round2Money(n));
}

/** Base líquida de uma única linha (atalho quando o rateio do grupo já não importa). */
export function liquidAmountForLine(opts: {
  lineTotal: number;
  originalAmount: number;
  netAmountAtSale: number;
}): number {
  return commercialReturnForLines({
    lineTotals: [opts.lineTotal],
    originalAmount: opts.originalAmount,
    netAmountAtSale: opts.netAmountAtSale,
  });
}

/**
 * Campos de saldo alinhados ao detalhe do recebível / aging.
 * `paid_amount` = pago líquido efetivo (posted − line refunds).
 */
export type ReceivableBalanceFields = {
  posted_amount: number;
  line_refunds_amount: number;
  paid_amount: number;
  balance_amount: number;
};

export function receivableBalanceFields(input: {
  finalAmount: number;
  postedPayments: number;
  lineRefundsAlreadyPaidOut: number;
}): ReceivableBalanceFields {
  const posted_amount = round2Money(input.postedPayments);
  const line_refunds_amount = round2Money(input.lineRefundsAlreadyPaidOut);
  const paid_amount = netPaidEffective({
    postedPayments: posted_amount,
    lineRefundsAlreadyPaidOut: line_refunds_amount,
  });
  const balance_amount = balanceDue({
    finalAmount: input.finalAmount,
    postedPayments: posted_amount,
    lineRefundsAlreadyPaidOut: line_refunds_amount,
  });
  return { posted_amount, line_refunds_amount, paid_amount, balance_amount };
}

/** Anexa campos de saldo a uma lista de recebíveis usando mapas de agregação. */
export function attachReceivableBalanceFields<T extends { id: string; final_amount?: number | null }>(
  rows: T[],
  postedByRec: Map<string, number>,
  lineRefundByRec: Map<string, number>,
): Array<T & ReceivableBalanceFields> {
  return rows.map((row) => {
    const fields = receivableBalanceFields({
      finalAmount: Number(row.final_amount ?? 0),
      postedPayments: postedByRec.get(row.id) ?? 0,
      lineRefundsAlreadyPaidOut: lineRefundByRec.get(row.id) ?? 0,
    });
    return { ...row, ...fields };
  });
}

/**
 * Ajuste de comissão em devolução, proporcional ao valor comercial devolvido
 * sobre a base líquida original da linha (vale para % e fixo).
 * `alreadyAdjusted` limita o acumulado a no máximo a comissão original (múltiplas parciais).
 */
export function commissionAdjustmentForReturn(opts: {
  commissionOriginalAmount: number;
  commissionBasisAmount: number;
  returnedCommercial: number;
  /** Soma dos ajustes já aplicados nesta linha (outras devoluções). */
  alreadyAdjusted?: number;
}): number {
  const original = round2Money(opts.commissionOriginalAmount);
  const basis = round2Money(opts.commissionBasisAmount);
  const returned = round2Money(opts.returnedCommercial);
  const already = round2Money(Math.max(0, opts.alreadyAdjusted ?? 0));
  if (original <= 0.009 || basis <= 0.009 || returned <= 0.009) return 0;
  const remaining = round2Money(Math.max(0, original - already));
  if (remaining <= 0.009) return 0;
  const ratio = Math.min(1, returned / basis);
  return round2Money(Math.min(remaining, original * ratio));
}
