/** Status agregado da devolução física de produtos do recebível. */
export type StockReturnStatus = 'pending' | 'partial' | 'returned' | 'unsellable' | 'mixed' | null;

export function isProductStockLine(line: {
  line_kind?: unknown;
  hub_inventory_item_id?: unknown;
  hub_inventory_lot_id?: unknown;
  quantity?: unknown;
}): boolean {
  return (
    String(line.line_kind ?? '') === 'product' &&
    Boolean(line.hub_inventory_item_id) &&
    Boolean(line.hub_inventory_lot_id) &&
    Number(line.quantity ?? 0) > 0
  );
}

/**
 * Agrega linhas de produto × eventos de devolução.
 * Em venda aberta (paid/pending sem estorno) sem eventos → null (baixa esperada).
 * Em cancelled/refunded sem eventos → pending.
 */
export function computeStockReturnStatus(opts: {
  productLineIds: string[];
  returns: Array<{ receivable_line_id: string; condition: string }>;
  receivableStatus?: string | null;
}): StockReturnStatus {
  const ids = opts.productLineIds;
  if (ids.length === 0) return null;

  const byLine = new Map(opts.returns.map((r) => [r.receivable_line_id, r.condition]));
  const covered = ids.filter((id) => byLine.has(id));
  const pendingCount = ids.length - covered.length;

  if (pendingCount === ids.length) {
    const st = String(opts.receivableStatus ?? '');
    if (st === 'cancelled' || st === 'refunded') return 'pending';
    return null;
  }
  if (pendingCount > 0) return 'partial';

  const conditions = ids.map((id) => String(byLine.get(id) ?? ''));
  if (conditions.every((c) => c === 'unsellable')) return 'unsellable';
  if (conditions.every((c) => c === 'sellable')) return 'returned';
  return 'mixed';
}
