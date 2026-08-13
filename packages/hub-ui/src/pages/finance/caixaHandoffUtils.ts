import { hubComandaApi } from '../../api/hubComandaApi';
import { canCaixaEditOpenComanda } from './hubComandaEditUtils';

function ymdToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type HandoffResult = {
  success: boolean;
  handoffCount: number;
  errors: string[];
};

/**
 * Envia em lote todas as comandas abertas editáveis no caixa para o financeiro
 * com `action: 'leave_pending'`. Retorna o resultado detalhado.
 */
export async function enviarComandasAbertasAoFinanceiro(
  comandas: Array<Record<string, unknown>>,
  clinicId: string,
): Promise<HandoffResult> {
  const abertas = comandas.filter(
    (c) => c.status === 'aberta' && canCaixaEditOpenComanda(c),
  );

  if (abertas.length === 0) {
    return { success: true, handoffCount: 0, errors: [] };
  }

  const today = ymdToday();
  const errors: string[] = [];
  let handoffCount = 0;

  for (const c of abertas) {
    try {
      await hubComandaApi.checkout(String(c.id), {
        clinic_id: clinicId,
        grouping: 'all',
        action: 'leave_pending',
        due_date: today,
        payment_timing: 'on_checkout',
      });
      handoffCount++;
    } catch (e: unknown) {
      errors.push(`${String(c.id).slice(0, 8)}: ${(e as Error)?.message ?? 'Erro'}`);
    }
  }

  return { success: errors.length === 0, handoffCount, errors };
}

/** Conta comandas abertas editáveis no caixa (para exibir em modais de confirmação). */
export function contarComandasAbertasEditaveis(
  comandas: Array<Record<string, unknown>>,
): number {
  return comandas.filter(
    (c) => c.status === 'aberta' && canCaixaEditOpenComanda(c),
  ).length;
}
