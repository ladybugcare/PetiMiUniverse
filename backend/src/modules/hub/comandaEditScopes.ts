export type ComandaEditContext = 'caixa' | 'financeiro';
export type ComandaLockedReason = 'closed' | 'paid_and_complete' | 'finance_handoff' | null;

export type ComandaEditScopes = {
  caixa: boolean;
  financeiro: boolean;
  locked_reason: ComandaLockedReason;
};

/**
 * Quitada + operação concluída só quando há valor real na comanda.
 * Comanda vazia (total 0) continua editável — ex.: manual aberta pelo perfil do pet ou do tutor.
 */
export function computeComandaEditScopes(
  comandaRow: Record<string, unknown>,
  operationalComplete: boolean,
  balanceDue: number,
): ComandaEditScopes {
  const status = String(comandaRow.status ?? '');
  const financeHandoffAt = comandaRow.finance_handoff_at as string | null | undefined;
  const total = Number(comandaRow.total_amount ?? 0);
  const paidAndComplete = operationalComplete && balanceDue <= 0.02 && total > 0.02;

  if (status !== 'aberta') {
    return { caixa: false, financeiro: false, locked_reason: 'closed' };
  }
  if (paidAndComplete) {
    return { caixa: false, financeiro: false, locked_reason: 'paid_and_complete' };
  }
  if (financeHandoffAt) {
    return { caixa: false, financeiro: true, locked_reason: 'finance_handoff' };
  }
  return { caixa: true, financeiro: true, locked_reason: null };
}

export function editScopeErrorMessage(scopes: ComandaEditScopes, context: ComandaEditContext): string {
  if (scopes.locked_reason === 'paid_and_complete') {
    return 'Comanda quitada e serviço concluído. Use estorno para ajustes financeiros.';
  }
  if (scopes.locked_reason === 'finance_handoff' && context === 'caixa') {
    return 'Comanda enviada ao financeiro. Edite apenas pelo módulo Financeiro.';
  }
  if (scopes.locked_reason === 'closed') {
    return 'Comanda não está aberta';
  }
  return 'Comanda não pode ser editada neste contexto';
}
