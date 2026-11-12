import { hubFinancialApi } from '../../api/hubFinancialApi';
import { canCaixaEditOpenComanda } from './hubComandaEditUtils';

const BALANCE_EPSILON = 0.02;

function ymdToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type HandoffResult = {
  success: boolean;
  handoffCount: number;
  errors: string[];
};

export function isSkippableFinanceHandoffError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('não há itens em aberto para faturar') ||
    normalized.includes('não há itens em aberto para enviar ao financeiro') ||
    normalized.includes('nenhum recebível gerado (valores zerados)')
  );
}

/** Só envia comandas com saldo ou total em aberto — evita checkout inútil (e lento). */
export function canHandoffOpenComandaInBatch(comanda: Record<string, unknown>): boolean {
  if (String(comanda.status ?? '') !== 'aberta') return false;
  if (!canCaixaEditOpenComanda(comanda)) return false;
  if (comanda.finance_handoff_at) return false;

  const balanceRaw = comanda.balance_due;
  if (balanceRaw !== undefined && balanceRaw !== null && balanceRaw !== '') {
    return Number(balanceRaw) > BALANCE_EPSILON;
  }
  const total = Number(comanda.total_amount ?? 0);
  const paid = Number(comanda.paid_total ?? 0);
  return total - paid > BALANCE_EPSILON;
}

/**
 * Envia ao financeiro as comandas abertas da unidade em **uma** chamada server-side
 * (`POST /finance/handoff-pending` → leave_pending com recebível + linhas).
 */
export async function enviarPendentesAoFinanceiro(
  clinicId: string,
  unitId: string,
): Promise<HandoffResult> {
  try {
    const res = await hubFinancialApi.handoffPending({
      clinic_id: clinicId,
      unit_id: unitId,
      due_date: ymdToday(),
    });
    const errors = (res.errors ?? []).filter((e) => !isSkippableFinanceHandoffError(e));
    return {
      success: errors.length === 0,
      handoffCount: res.handoff_count ?? 0,
      errors,
    };
  } catch (e: unknown) {
    const message = (e as Error)?.message ?? 'Erro';
    if (isSkippableFinanceHandoffError(message)) {
      return { success: true, handoffCount: 0, errors: [] };
    }
    return { success: false, handoffCount: 0, errors: [message] };
  }
}

/**
 * @deprecated Preferir `enviarPendentesAoFinanceiro(clinicId, unitId)` (endpoint único).
 * Mantido para chamadas que só têm a lista local — redireciona se `unitId` for passado.
 */
export async function enviarComandasAbertasAoFinanceiro(
  comandas: Array<Record<string, unknown>>,
  clinicId: string,
  unitId?: string | null,
): Promise<HandoffResult> {
  if (unitId) {
    return enviarPendentesAoFinanceiro(clinicId, unitId);
  }
  const abertas = comandas.filter(canHandoffOpenComandaInBatch);
  if (abertas.length === 0) {
    return { success: true, handoffCount: 0, errors: [] };
  }
  // Sem unitId: uma chamada server-side ainda é possível se todas as comandas
  // forem da mesma unidade — mas o Encerrar turno deve passar unitId.
  return {
    success: false,
    handoffCount: 0,
    errors: ['unit_id obrigatório para enviar comandas ao financeiro em lote.'],
  };
}

/** Conta comandas abertas editáveis no caixa (para exibir em modais de confirmação). */
export function contarComandasAbertasEditaveis(
  comandas: Array<Record<string, unknown>>,
): number {
  return comandas.filter(
    (c) => c.status === 'aberta' && canCaixaEditOpenComanda(c),
  ).length;
}
