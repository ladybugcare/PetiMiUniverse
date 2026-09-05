import { hubComandaApi } from '../../api/hubComandaApi';
import { canCaixaEditOpenComanda } from './hubComandaEditUtils';

const BALANCE_EPSILON = 0.02;
const CHECKOUT_BULK_CHUNK = 20;

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

function chunkIds<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Envia em lote as comandas abertas com valor a faturar para o financeiro
 * (`leave_pending`). Comandas vazias ou já faturadas são ignoradas.
 */
export async function enviarComandasAbertasAoFinanceiro(
  comandas: Array<Record<string, unknown>>,
  clinicId: string,
): Promise<HandoffResult> {
  const abertas = comandas.filter(canHandoffOpenComandaInBatch);

  if (abertas.length === 0) {
    return { success: true, handoffCount: 0, errors: [] };
  }

  const errors: string[] = [];
  let handoffCount = 0;

  for (const chunk of chunkIds(abertas, CHECKOUT_BULK_CHUNK)) {
    try {
      const res = await hubComandaApi.checkoutBulk({
        clinic_id: clinicId,
        comanda_ids: chunk.map((c) => String(c.id)),
        action: 'leave_pending',
        due_date: ymdToday(),
        payment_timing: 'on_checkout',
      });
      for (const row of res.results ?? []) {
        if (row.error) {
          if (isSkippableFinanceHandoffError(row.error)) continue;
          errors.push(`${String(row.comanda_id).slice(0, 8)}: ${row.error}`);
          continue;
        }
        handoffCount++;
      }
    } catch (e: unknown) {
      const message = (e as Error)?.message ?? 'Erro';
      if (isSkippableFinanceHandoffError(message)) continue;
      errors.push(message);
    }
  }

  return { success: errors.length === 0, handoffCount, errors };
}

/**
 * Envia ao financeiro as comandas abertas da unidade.
 * Não percorre a fila de "sem cobrança" (consulta pesada) — só o que já está no caixa.
 */
export async function enviarPendentesAoFinanceiro(
  clinicId: string,
  unitId: string,
): Promise<HandoffResult> {
  const listed = await hubComandaApi.listComandas({
    clinic_id: clinicId,
    unit_id: unitId,
    status: 'aberta',
    enrich: true,
  });
  return enviarComandasAbertasAoFinanceiro(listed.comandas ?? [], clinicId);
}

/** Conta comandas abertas editáveis no caixa (para exibir em modais de confirmação). */
export function contarComandasAbertasEditaveis(
  comandas: Array<Record<string, unknown>>,
): number {
  return comandas.filter(
    (c) => c.status === 'aberta' && canCaixaEditOpenComanda(c),
  ).length;
}
