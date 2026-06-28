import type { HubComandaEditScopes } from '../../api/hubComandaApi';
import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';

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
