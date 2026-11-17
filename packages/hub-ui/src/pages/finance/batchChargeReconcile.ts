import type { HubComandaDetailResponse } from '../../api/hubComandaApi';
import type { BatchChargeItem } from './batchChargeItems';

export type BulkComandaSettlement = 'settled' | 'retryable' | 'blocked';

export type BulkComandaReconcileRow = {
  comandaId: string;
  itemId: string | null;
  title: string;
  settlement: BulkComandaSettlement;
  /** Evidência: total já pago na comanda (posted). */
  paidTotal: number;
  balanceDue: number;
  status: string | null;
  detail?: string;
};

export type BulkComandaReconcileResult = {
  rows: BulkComandaReconcileRow[];
  settledIds: string[];
  retryableComandaIds: string[];
  blocked: BulkComandaReconcileRow[];
};

/** Mensagem padrão do web-core quando o AbortController estoura o timeout. */
export const API_TIMEOUT_MESSAGE =
  'A requisição demorou muito para responder. Verifique sua conexão ou tente novamente.';

export function isApiTimeoutError(error: unknown): boolean {
  const msg = String((error as Error)?.message ?? error ?? '');
  return (
    /demorou muito para responder/i.test(msg) ||
    /The operation was aborted/i.test(msg) ||
    /AbortError/i.test(msg) ||
    ((error as Error)?.name === 'AbortError')
  );
}

/**
 * Timeout do cliente para checkout-bulk.
 * O backend processa comandas em série (~vários round-trips cada); 30s padrão corta o lote.
 */
export function checkoutBulkTimeoutMs(comandaCount: number): number {
  const n = Math.max(1, comandaCount);
  return Math.min(180_000, 40_000 + n * 30_000);
}

/**
 * Quitada só com evidência de pagamento (paid_total > 0 e saldo zerado).
 * Comanda fechada/cancelada sem pagamento NÃO conta como sucesso do lote.
 */
export function classifyComandaSettlement(detail: HubComandaDetailResponse): {
  settlement: BulkComandaSettlement;
  paidTotal: number;
  balanceDue: number;
  status: string | null;
  detail?: string;
} {
  const status = String((detail.comanda as { status?: string } | undefined)?.status ?? '') || null;
  const paidTotal = Number(detail.paid_total ?? 0);
  const balanceDue = Number(detail.balance_due ?? 0);

  if (paidTotal > 0.009 && balanceDue <= 0.02) {
    return { settlement: 'settled', paidTotal, balanceDue, status };
  }

  if (status === 'aberta' && (balanceDue > 0.02 || (detail.open_item_ids?.length ?? 0) > 0)) {
    return { settlement: 'retryable', paidTotal, balanceDue, status };
  }

  if (status === 'aberta' && paidTotal <= 0.009 && balanceDue <= 0.02) {
    return {
      settlement: 'retryable',
      paidTotal,
      balanceDue,
      status,
      detail: 'Comanda aberta sem saldo — confira itens antes de reenviar',
    };
  }

  if (status === 'fechada' || status === 'cancelada') {
    return {
      settlement: 'blocked',
      paidTotal,
      balanceDue,
      status,
      detail:
        paidTotal <= 0.009
          ? `Comanda ${status} sem pagamento registrado — não será reenviada como quitada`
          : `Comanda ${status} com saldo residual R$ ${balanceDue.toFixed(2)}`,
    };
  }

  return {
    settlement: 'blocked',
    paidTotal,
    balanceDue,
    status,
    detail: status ? `Status ${status} — remova do lote e confira no Caixa` : 'Estado da comanda indefinido',
  };
}

export function buildBulkReconcileResult(
  items: BatchChargeItem[],
  detailsByComandaId: Record<string, HubComandaDetailResponse | null>,
): BulkComandaReconcileResult {
  const rows: BulkComandaReconcileRow[] = [];
  const settledIds: string[] = [];
  const retryableComandaIds: string[] = [];
  const blocked: BulkComandaReconcileRow[] = [];

  for (const item of items) {
    const comandaId = item.comandaId;
    if (!comandaId) continue;
    const detail = detailsByComandaId[comandaId];
    if (!detail) {
      const row: BulkComandaReconcileRow = {
        comandaId,
        itemId: item.id,
        title: item.title,
        settlement: 'retryable',
        paidTotal: 0,
        balanceDue: item.amount,
        status: null,
        detail: 'Não foi possível consultar o status — mantenha no lote para nova tentativa',
      };
      rows.push(row);
      retryableComandaIds.push(comandaId);
      continue;
    }
    const classified = classifyComandaSettlement(detail);
    const row: BulkComandaReconcileRow = {
      comandaId,
      itemId: item.id,
      title: item.title,
      ...classified,
    };
    rows.push(row);
    if (classified.settlement === 'settled' && item.id) settledIds.push(item.id);
    else if (classified.settlement === 'retryable') retryableComandaIds.push(comandaId);
    else blocked.push(row);
  }

  return { rows, settledIds, retryableComandaIds, blocked };
}

/** Mantém chaves de idempotência só para comandas ainda elegíveis. */
export function filterIdempotencyKeysForRetry(
  keys: Record<string, string>,
  retryableComandaIds: string[],
): Record<string, string> {
  const allow = new Set(retryableComandaIds);
  const next: Record<string, string> = {};
  for (const id of allow) {
    if (keys[id]) next[id] = keys[id];
  }
  return next;
}
