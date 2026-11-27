import type { HubComandaDetailResponse, HubComandaEditScopes } from '../../api/hubComandaApi';
import type { HubFinanceDayBoardItem } from '../../api/hubFinancialApi';

const BALANCE_EPSILON = 0.009;

export type ComandaCheckoutCTA =
  | { kind: 'none' }
  | { kind: 'checkout_drawer'; label: 'Cobrar' | 'Faturar itens' | 'Encerrar (cobertura)' }
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
    // Pacote/desconto zera o saldo, mas ainda há itens abertos → encerrar cobertura no checkout.
    if (openItemIds.length > 0 && balanceDue <= BALANCE_EPSILON) {
      return { kind: 'checkout_drawer', label: 'Encerrar (cobertura)' };
    }
    if (balanceDue <= BALANCE_EPSILON) return { kind: 'none' };
    return { kind: 'checkout_drawer', label: 'Cobrar' };
  }

  // Mesmo com comanda quitada/bloqueada para edição, o financeiro precisa abrir a
  // cobrança para devolução/estorno (Etapa A — devoluções sucessivas).
  if (activeReceivableIds.length > 0) {
    if (balanceDue > BALANCE_EPSILON && scopes?.financeiro !== false) {
      return { kind: 'receivable_drawer', label: 'Registrar pagamento' };
    }
    return { kind: 'receivable_drawer', label: 'Ver cobrança' };
  }

  if (scopes && !scopes.financeiro) return { kind: 'none' };

  if (openItemIds.length > 0) {
    return { kind: 'checkout_drawer', label: 'Faturar itens' };
  }

  return { kind: 'none' };
}

/** Label do botão de checkout no day board (por linha). */
export function resolveDayBoardCheckoutLabel(
  mode: 'caixa' | 'financeiro',
  item: HubFinanceDayBoardItem,
): string | null {
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
  // Sem comanda não há o que faturar pela UI de comanda — só pagamento de recebível direto.
  if (!billing.comanda_id) return null;
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
    case 'boarding_reservation':
      return operationalStatus === 'checked_out';
    case 'hospitalization':
      return (
        operationalStatus === 'discharged' ||
        operationalStatus === 'death' ||
        operationalStatus === 'transferred'
      );
    case 'quote':
    case 'manual':
      return true;
    default:
      return true;
  }
}

/** Comanda quitada e serviço concluído — espelha `paid_and_complete` no day board (recebível pago + origem concluída). */
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
  // Preferir saldo real (ex.: venda reembolsada/estornada com bruto histórico ainda no total).
  if (comanda.balance_due != null && Number(comanda.balance_due) <= BALANCE_EPSILON) {
    const total = Number(comanda.total_amount ?? 0);
    if (total > BALANCE_EPSILON) return false;
  }
  const total = Number(comanda.total_amount ?? 0);
  const paid = Number(comanda.paid_total ?? 0);
  if (total > 0 && paid >= total - 0.02) return false;
  return true;
}

/** Item do day board que ainda é ação do caixa — após handoff vai para o Financeiro. */
export function isCaixaOwnedDayBoardItem(item: HubFinanceDayBoardItem): boolean {
  return !item.billing.finance_handoff_at;
}

/** Comanda de dia anterior que ainda é pendência do caixa (não enviada ao financeiro). */
export function isCaixaCarryoverPendingComanda(
  comanda: Record<string, unknown>,
  todayYmd: string,
): boolean {
  if (!canCaixaEditOpenComanda(comanda)) return false;
  // Sem saldo a cobrar (estorno/reembolso total), não listar como pendência.
  if (comanda.balance_due != null && Number(comanda.balance_due) <= BALANCE_EPSILON) return false;
  const openedAt = comanda.opened_at ? String(comanda.opened_at).slice(0, 10) : null;
  return Boolean(openedAt && openedAt < todayYmd);
}

/** Classificação da conferência de carryover (duas filas + executor). */
export type CaixaCarryoverConferenceKind = 'operational_incomplete' | 'needs_executor' | 'ready';

export function resolveCaixaCarryoverConferenceKind(
  comanda: Record<string, unknown>,
): CaixaCarryoverConferenceKind {
  if (comanda.operational_complete === false) return 'operational_incomplete';
  if (comanda.handoff_block_code === 'COMMISSION_EXECUTOR_REQUIRED') return 'needs_executor';
  return 'ready';
}

export function caixaCarryoverConferenceLabel(kind: CaixaCarryoverConferenceKind): string {
  switch (kind) {
    case 'operational_incomplete':
      return 'Operação incompleta';
    case 'needs_executor':
      return 'Falta executor';
    default:
      return 'Pronta para cobrança';
  }
}

/** Deep link para o módulo operacional da origem (conferência). */
export function resolveComandaOperationalHref(
  comanda: Record<string, unknown>,
  opts?: { markExecution?: boolean },
): string | null {
  const originType = String(comanda.origin_type ?? '');
  const originId = comanda.origin_id ? String(comanda.origin_id) : '';
  if (!originId) {
    if (originType === 'grooming_session') return '/hub/banho-tosa';
    if (originType === 'appointment') return '/hub/appointments';
    if (originType === 'boarding_reservation') return '/hub/hotel-creche';
    if (originType === 'encounter') return '/hub/clinica';
    return null;
  }
  switch (originType) {
    case 'encounter':
      return `/hub/clinica/atendimentos/${originId}`;
    case 'grooming_session':
      return `/hub/banho-tosa?session=${encodeURIComponent(originId)}`;
    case 'appointment': {
      // Agenda escuta appointment_id (+ date) e abre o painel do agendamento.
      const q = new URLSearchParams({ appointment_id: originId });
      const opened = comanda.opened_at ? String(comanda.opened_at).slice(0, 10) : '';
      const starts = comanda.starts_at ? String(comanda.starts_at).slice(0, 10) : '';
      const dateYmd = /^\d{4}-\d{2}-\d{2}$/.test(starts)
        ? starts
        : /^\d{4}-\d{2}-\d{2}$/.test(opened)
          ? opened
          : '';
      if (dateYmd) q.set('date', dateYmd);
      if (opts?.markExecution) q.set('mark_execution', '1');
      return `/hub/appointments?${q.toString()}`;
    }
    case 'boarding_reservation':
      return `/hub/hotel-creche?reservation=${encodeURIComponent(originId)}`;
    case 'hospitalization':
      return `/hub/clinica/internacoes/${originId}`;
    default:
      return null;
  }
}

/** Rótulo do botão de deep link operacional (evita setinha sem contexto). */
export function resolveComandaOperationalActionLabel(comanda: Record<string, unknown>): string {
  const originType = String(comanda.origin_type ?? '');
  switch (originType) {
    case 'appointment':
      return 'Abrir na agenda';
    case 'grooming_session':
      return 'Abrir Banho & Tosa';
    case 'boarding_reservation':
      return 'Abrir Hotel & Creche';
    case 'encounter':
    case 'hospitalization':
      return 'Abrir na clínica';
    default:
      return 'Abrir operação';
  }
}

/** Carryover elegível a handoff em lote (pronta + saldo). */
export function canHandoffCarryoverComanda(comanda: Record<string, unknown>): boolean {
  if (!canCaixaEditOpenComanda(comanda)) return false;
  if (resolveCaixaCarryoverConferenceKind(comanda) !== 'ready') return false;
  if (comanda.balance_due != null && Number(comanda.balance_due) <= BALANCE_EPSILON) return false;
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
  const { billing } = item;
  if (billing.receivable_status === 'paid') return false;
  // Recebível direto (ex.: grooming_session com comanda_id null) — cobrança sem editar comanda.
  if (
    billing.active_receivable_id &&
    (billing.receivable_status === 'pending' || billing.receivable_status === 'partially_paid')
  ) {
    return true;
  }
  if (!canFinanceiroEditDayBoardItem(item)) return false;
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
