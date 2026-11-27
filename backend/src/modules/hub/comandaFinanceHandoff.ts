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

/** Códigos estáveis de skip/falha no handoff leave_pending (UI + auto-close). */
export const LEAVE_PENDING_HANDOFF_CODES = [
  'ALREADY_HANDED_OFF',
  'COMANDA_NOT_OPEN',
  'NO_OPEN_ITEMS',
  'ZERO_AMOUNT',
  'SYNC_NOT_READY',
  'OPERATIONAL_NOT_READY',
  'COMMISSION_EXECUTOR_REQUIRED',
  'HANDOFF_ERROR',
] as const;

export type LeavePendingHandoffCode = (typeof LEAVE_PENDING_HANDOFF_CODES)[number];

const SKIPPABLE_HANDOFF_CODES = new Set<LeavePendingHandoffCode>([
  'ALREADY_HANDED_OFF',
  'NO_OPEN_ITEMS',
  'ZERO_AMOUNT',
  'SYNC_NOT_READY',
  'OPERATIONAL_NOT_READY',
]);

/** Erros de leave_pending sem valor a faturar — não devem falhar o lote/encerrar turno. */
export function isSkippableLeavePendingHandoffError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('não há itens em aberto para faturar') ||
    normalized.includes('não há itens em aberto para enviar ao financeiro') ||
    normalized.includes('nenhum recebível gerado (valores zerados)') ||
    normalized.includes('origem ainda não está pronta') ||
    normalized.includes('operação ainda não concluída')
  );
}

export function isSkippableLeavePendingHandoffCode(
  code: LeavePendingHandoffCode | string | null | undefined,
): boolean {
  if (!code) return false;
  return SKIPPABLE_HANDOFF_CODES.has(code as LeavePendingHandoffCode);
}

/** Formato curto para notes de auto-close: `abc12345:CODE:mensagem`. */
export function formatHandoffResultForNotes(opts: {
  comandaId: string;
  code?: string | null;
  error?: string | null;
}): string {
  const shortId = opts.comandaId.slice(0, 8);
  const code = opts.code?.trim() || 'HANDOFF_ERROR';
  const msg = (opts.error ?? '').replace(/\s+/g, ' ').trim();
  return msg ? `${shortId}:${code}:${msg}` : `${shortId}:${code}`;
}
