"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeComandaEditScopes = computeComandaEditScopes;
exports.editScopeErrorMessage = editScopeErrorMessage;
/**
 * Quitada + operação concluída só quando há valor real na comanda.
 * Comanda vazia (total 0) continua editável — ex.: manual aberta pelo perfil do pet ou do tutor.
 */
function computeComandaEditScopes(comandaRow, operationalComplete, balanceDue) {
    const status = String(comandaRow.status ?? '');
    const financeHandoffAt = comandaRow.finance_handoff_at;
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
function editScopeErrorMessage(scopes, context) {
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
