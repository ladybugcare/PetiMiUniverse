/**
 * Cobertura de itens da comanda após cancelamento/estorno do recebível.
 * Cancelamento puro com reissue reabre itens; void_sale mantém cobertos.
 */

export type ReceivableCoverageRow = {
  status?: unknown;
  returned_amount?: unknown;
  /** true = reissue; false = void_sale; null/undefined = legado (trata como reissue). */
  cancel_rebill?: unknown;
};

export function receivableClosedByReturn(row: ReceivableCoverageRow): boolean {
  const status = String(row.status ?? '');
  const returned = Number(row.returned_amount ?? 0);
  return returned > 0.009 || status === 'refunded';
}

/** Cancelamento financeiro sem devolução comercial (void ou reissue). */
export function isFinancialCancelWithoutReturn(row: ReceivableCoverageRow): boolean {
  return String(row.status ?? '') === 'cancelled' && !receivableClosedByReturn(row);
}

/**
 * Reissue / legado: cancelamento puro que devolve itens a cobráveis.
 * void_sale (`cancel_rebill === false`) não reabre.
 */
export function isReissueCancel(row: ReceivableCoverageRow): boolean {
  if (!isFinancialCancelWithoutReturn(row)) return false;
  return row.cancel_rebill !== false;
}

/** void_sale: anula cobrança sem reabrir faturamento dos itens. */
export function isVoidSaleCancel(row: ReceivableCoverageRow): boolean {
  if (!isFinancialCancelWithoutReturn(row)) return false;
  return row.cancel_rebill === false;
}

/** Recebível ainda “cobre” o item da comanda (não entra em open_item_ids). */
export function receivableBillsComandaItem(row: ReceivableCoverageRow): boolean {
  return !isReissueCancel(row);
}

/**
 * Listável na ficha financeira ativa.
 * Qualquer cancelamento sem devolução (void ou reissue) sai da lista ativa.
 */
export function receivableListableOnComanda(row: ReceivableCoverageRow): boolean {
  return !isFinancialCancelWithoutReturn(row);
}

/** Residual a cobrar do recebível: refunded fecha financeiramente sem reabrir itens. */
export function receivableResidualCountsTowardBalance(row: ReceivableCoverageRow): boolean {
  const status = String(row.status ?? '');
  if (status === 'refunded') return false;
  if (isFinancialCancelWithoutReturn(row)) return false;
  return true;
}
