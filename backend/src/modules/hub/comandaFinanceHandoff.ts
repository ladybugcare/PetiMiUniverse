const BALANCE_EPSILON = 0.02;

export type ComandaHandoffDetail = {
  open_item_ids?: string[];
  active_receivable_ids?: string[];
  balance_due?: number;
};

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
