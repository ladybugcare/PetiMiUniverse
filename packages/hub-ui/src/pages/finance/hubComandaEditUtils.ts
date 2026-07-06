import type { HubComandaDetailResponse, HubComandaEditScopes } from '../../api/hubComandaApi';
import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';

const BALANCE_EPSILON = 0.009;

export type ComandaCheckoutCTA =
  | { kind: 'none' }
  | { kind: 'checkout_drawer'; label: 'Cobrar' | 'Faturar itens' }
  | { kind: 'receivable_drawer'; label: 'Registrar pagamento' | 'Ver cobrança' };

export type ComandaCheckoutCTAInput = Pick<
  HubComandaDetailResponse,
  'open_item_ids' | 'active_receivable_ids' | 'balance_due' | 'edit_scopes'
>;

export type ComandaFinanceHandoffInput = Pick<
  HubComandaDetailResponse,
  'open_item_ids' | 'active_receivable_ids' | 'balance_due'
> & { finance_handoff_at?: string | null };

/** Exibe "Enviar ao financeiro" quando há itens em aberto ou saldo pendente (incl. parcial). */
export function canSendToFinanceiroHandoff(comanda: ComandaFinanceHandoffInput): boolean {
  if (comanda.finance_handoff_at) return false;
  const openCount = comanda.open_item_ids?.length ?? 0;
  const balanceDue = Number(comanda.balance_due ?? 0);
  return openCount > 0 || balanceDue > BALANCE_EPSILON;
}

/** Mensagem de confirmação conforme o estado da comanda. */
export function resolveSendToFinanceiroConfirmMessage(comanda: ComandaFinanceHandoffInput): string {
  const openCount = comanda.open_item_ids?.length ?? 0;
  const hasActiveRec = (comanda.active_receivable_ids?.length ?? 0) > 0;
  const balanceDue = Number(comanda.balance_due ?? 0);

  if (openCount === 0 && hasActiveRec && balanceDue > BALANCE_EPSILON) {
    return 'Enviar saldo restante ao financeiro? O recebível parcial ficará pendente para cobrança.';
  }
  return 'Enviar comanda ao financeiro? Os itens ficarão como recebíveis pendentes.';
}

/** Define o CTA principal de cobrança na ficha da comanda (caixa vs financeiro). */
export function resolveComandaCheckoutCTA(
  mode: 'caixa' | 'financeiro',
  comanda: ComandaCheckoutCTAInput,
): ComandaCheckoutCTA {
  const balanceDue = Number(comanda.balance_due ?? 0);
  const openItemIds = comanda.open_item_ids ?? [];
  const activeReceivableIds = comanda.active_receivable_ids ?? [];
  const scopes = comanda.edit_scopes;

  if (mode === 'caixa') {
    if (scopes && !scopes.caixa) return { kind: 'none' };
    if (balanceDue <= BALANCE_EPSILON) return { kind: 'none' };
    return { kind: 'checkout_drawer', label: 'Cobrar' };
  }

  if (scopes && !scopes.financeiro) return { kind: 'none' };

  if (openItemIds.length > 0) {
    return { kind: 'checkout_drawer', label: 'Faturar itens' };
  }

  if (activeReceivableIds.length > 0) {
    if (balanceDue > BALANCE_EPSILON) {
      return { kind: 'receivable_drawer', label: 'Registrar pagamento' };
    }
    return { kind: 'receivable_drawer', label: 'Ver cobrança' };
  }

  return { kind: 'none' };
}

/** Label do botão de checkout no day board (por linha). */
export function resolveDayBoardCheckoutLabel(
  mode: 'caixa' | 'financeiro',
  item: HubFinanceDayBoardItem,
): string | null {
  if (!item.billing.comanda_id) return null;

  const canCheckout =
    mode === 'caixa' ? canCaixaCheckoutDayBoardItem(item) : canFinanceiroCheckoutDayBoardItem(item);
  if (!canCheckout) return null;

  if (mode === 'caixa') return 'Receber';

  const { billing } = item;
  if (
    billing.has_receivable &&
    (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid')
  ) {
    return 'Registrar pagamento';
  }
  if (!billing.has_receivable) return 'Faturar itens';
  return null;
}

/** Espelha `isOperationalCompleteForComanda` no backend. */
export function isOriginOperationallyComplete(originType: string, operationalStatus: string): boolean {
  switch (originType) {
    case 'appointment':
      return operationalStatus === 'done' || operationalStatus === 'paid';
    case 'grooming_session':
      return operationalStatus === 'closed';
    case 'encounter':
      return operationalStatus === 'completed';
    case 'quote':
    case 'manual':
    case 'boarding_reservation':
      return true;
    default:
      return true;
  }
}

/** Comanda quitada e serviço concluído — mesma regra de `paid_and_complete` no backend. */
export function isDayBoardPaidAndComplete(item: HubFinanceDayBoardItem): boolean {
  const { billing } = item;
  if (billing.receivable_status !== 'paid') return false;
  return isOriginOperationallyComplete(item.origin_type, item.operational_status);
}

export function canCaixaEditDayBoardItem(item: HubFinanceDayBoardItem): boolean {
  const { billing } = item;
  if (!billing.comanda_id || billing.comanda_status !== 'aberta') return false;
  if (billing.finance_handoff_at) return false;
  if (isDayBoardPaidAndComplete(item)) return false;
  return true;
}

export function canCaixaCheckoutDayBoardItem(item: HubFinanceDayBoardItem): boolean {
  if (!canCaixaEditDayBoardItem(item)) return false;
  const { billing } = item;
  if (billing.has_receivable && billing.receivable_status === 'paid') return false;
  return true;
}

export function canCaixaEditOpenComanda(comanda: Record<string, unknown>): boolean {
  const scopes = comanda.edit_scopes as HubComandaEditScopes | undefined;
  if (scopes) return scopes.caixa;
  if (String(comanda.status ?? '') !== 'aberta') return false;
  if (comanda.finance_handoff_at) return false;
  const total = Number(comanda.total_amount ?? 0);
  const paid = Number(comanda.paid_total ?? 0);
  if (total > 0 && paid >= total - 0.02) return false;
  return true;
}

export function isDayBoardViewOnly(item: HubFinanceDayBoardItem): boolean {
  return isDayBoardPaidAndComplete(item);
}

export function canFinanceiroEditDayBoardItem(item: HubFinanceDayBoardItem): boolean {
  const { billing } = item;
  if (!billing.comanda_id || billing.comanda_status !== 'aberta') return false;
  if (isDayBoardPaidAndComplete(item)) return false;
  return true;
}

export function canFinanceiroCheckoutDayBoardItem(item: HubFinanceDayBoardItem): boolean {
  if (!canFinanceiroEditDayBoardItem(item)) return false;
  const { billing } = item;
  if (billing.receivable_status === 'paid') return false;
  return true;
}

export function canFinanceiroEditOpenComanda(comanda: Record<string, unknown>): boolean {
  const scopes = comanda.edit_scopes as HubComandaEditScopes | undefined;
  if (scopes) return scopes.financeiro;
  if (String(comanda.status ?? '') !== 'aberta') return false;
  const total = Number(comanda.total_amount ?? 0);
  const paid = Number(comanda.paid_total ?? 0);
  if (total > 0 && paid >= total - 0.02) return false;
  return true;
}
