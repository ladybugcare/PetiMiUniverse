const BALANCE_EPSILON = 0.02;

export type ComandaHandoffDetail = {
  open_item_ids?: string[];
  active_receivable_ids?: string[];
  balance_due?: number;
};

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Desconto de cabeçalho ainda aplicável às linhas em aberto.
 * Se todas as linhas estão abertas, aplica o desconto integral; se só uma fração
 * resta aberta, rateia pelo valor bruto das linhas.
 */
export function openLinesHeaderDiscount(opts: {
  openLinesTotal: number;
  allLinesTotal: number;
  headerDiscount: number;
  openItemsCount: number;
  allItemsCount: number;
}): number {
  const header = Math.max(0, Number(opts.headerDiscount ?? 0));
  if (header <= 0 || opts.openItemsCount <= 0) return 0;
  if (opts.openItemsCount >= opts.allItemsCount) {
    return roundMoney2(Math.min(header, Math.max(0, opts.openLinesTotal)));
  }
  const all = Math.max(0, Number(opts.allLinesTotal ?? 0));
  if (all <= 0) return 0;
  const open = Math.max(0, Number(opts.openLinesTotal ?? 0));
  return roundMoney2(Math.min(open, (header * open) / all));
}

/**
 * Saldo cobrável: linhas abertas líquidas do desconto de cabeçalho + resíduo de recebíveis.
 * Corrige a divergência total_amount (com desconto) vs soma bruta das linhas.
 */
export function computeBalanceDueFromParts(opts: {
  openLinesTotal: number;
  allLinesTotal: number;
  headerDiscount: number;
  openItemsCount: number;
  allItemsCount: number;
  receivableResidual: number;
}): number {
  const discount = openLinesHeaderDiscount(opts);
  const openNet = roundMoney2(Math.max(0, Number(opts.openLinesTotal ?? 0) - discount));
  return roundMoney2(openNet + Math.max(0, Number(opts.receivableResidual ?? 0)));
}

/** Handoff ao financeiro quando itens já foram faturados e ainda há saldo em recebíveis. */
export function canHandoffExistingReceivables(detail: ComandaHandoffDetail): boolean {
  return (
    (detail.open_item_ids ?? []).length === 0 &&
    (detail.active_receivable_ids ?? []).length > 0 &&
    Number(detail.balance_due ?? 0) > BALANCE_EPSILON
  );
}

/** Erros de leave_pending sem valor a faturar — não devem falhar o lote/encerrar turno. */
export function isSkippableLeavePendingHandoffError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('não há itens em aberto para faturar') ||
    normalized.includes('não há itens em aberto para enviar ao financeiro') ||
    normalized.includes('nenhum recebível gerado (valores zerados)')
  );
}
