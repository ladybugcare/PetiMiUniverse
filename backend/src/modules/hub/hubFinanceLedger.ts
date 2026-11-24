/**
 * Ledger financeiro compartilhado (Caixa + Financeiro).
 * Fonte única: hub_receivables + hub_payments (status posted|reversed).
 * Nunca DELETE de pagamento em estorno/reembolso.
 */
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../config/supabase';
import { syncHubAppointmentPaidFromReceivable } from './appointmentPaidFromBilling';
import {
  consumeHubCustomerCredit,
  CustomerCreditError,
  restoreCustomerCreditIfNeeded,
  restoreHubCustomerCredit,
} from './hubCustomerCredit';
import { syncChargeBundleStatusForReceivable } from './hubChargeBundlesService';
import {
  recordComandaEvent,
  comandaItemEventBody,
} from './comandaEvents';
import { syncPackageBalancesForReceivable } from './hubPackagesService';
import {
  restoreProductStockForReceivableLines,
  type StockReturnCondition,
  type StockReturnLineSpec,
} from './hubInventoryStockUtils';
import { isProductStockLine } from './hubProductReturnStatus';

export type PaymentReversalMode = 'payment_reversal' | 'refund';

export type ReversePaymentResult = {
  ok: true;
  receivable_status: string;
  receivable_id: string;
  adjustment_id: string;
  reversal_mode: PaymentReversalMode;
  warning: string | null;
  stock_restored?: number;
  stock_unsellable?: number;
};

export class FinanceLedgerError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = 'FinanceLedgerError';
    this.status = status;
  }
}

export function round2Ledger(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Query filter: só pagamentos que compõem saldo ativo. */
export function postedPaymentsFilter<T extends { eq: (col: string, val: string) => T }>(q: T): T {
  return q.eq('status', 'posted');
}

export async function sumPostedPaymentsForReceivable(receivableId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('hub_payments')
    .select('amount')
    .eq('receivable_id', receivableId)
    .eq('status', 'posted');
  if (error) throw new Error(error.message);
  return round2Ledger((data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0));
}

/** Refunds de linha (payment_id null) — não descontar de novo se o payment já foi reversed. */
export async function sumLineRefundAdjustmentsForReceivable(receivableId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('hub_financial_adjustments')
    .select('amount, payment_id')
    .eq('receivable_id', receivableId)
    .eq('adjustment_type', 'refund');
  if (error) throw new Error(error.message);
  return round2Ledger(
    (data ?? [])
      .filter((r) => r.payment_id == null)
      .reduce((s, r) => s + Number(r.amount ?? 0), 0),
  );
}

/** Pago líquido efetivo = posted − refunds de linha. */
export async function netPaidEffectiveForReceivable(receivableId: string): Promise<number> {
  const posted = await sumPostedPaymentsForReceivable(receivableId);
  const lineRefunds = await sumLineRefundAdjustmentsForReceivable(receivableId);
  return round2Ledger(Math.max(0, posted - lineRefunds));
}

export async function sumPostedPaymentsForReceivables(receivableIds: string[]): Promise<number> {
  if (!receivableIds.length) return 0;
  const { data, error } = await supabaseAdmin
    .from('hub_payments')
    .select('amount')
    .in('receivable_id', receivableIds)
    .eq('status', 'posted');
  if (error) throw new Error(error.message);
  return round2Ledger((data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0));
}

export async function recalculateReceivableFromPosted(receivableId: string): Promise<string> {
  const { data: rec, error: rErr } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, clinic_id, final_amount, status, comanda_id')
    .eq('id', receivableId)
    .maybeSingle();
  if (rErr || !rec) throw new Error(rErr?.message || 'Recebível não encontrado');
  if (['cancelled', 'refunded'].includes(String(rec.status))) {
    await syncPackageBalancesForReceivable(receivableId);
    return String(rec.status);
  }

  const netPaid = await netPaidEffectiveForReceivable(receivableId);
  const finalAmount = Number(rec.final_amount ?? 0);
  const nextStatus =
    netPaid <= 0.009
      ? 'pending'
      : netPaid >= finalAmount - 0.009
        ? 'paid'
        : 'partially_paid';
  await supabaseAdmin.from('hub_receivables').update({ status: nextStatus }).eq('id', receivableId);

  if (rec.clinic_id) {
    await syncHubAppointmentPaidFromReceivable({
      clinicId: rec.clinic_id as string,
      receivableId,
    });
    void syncChargeBundleStatusForReceivable(receivableId, rec.clinic_id as string);
  }

  await syncPackageBalancesForReceivable(receivableId);

  return nextStatus;
}

/**
 * Reembolso efetivo sem pagamentos posted restantes fecha o título como `refunded`
 * (não reabre como pendente a cobrar). Anulação (`payment_reversal`) mantém o recalc.
 */
export async function applyRefundReceivableClosure(
  receivableId: string,
  currentStatus: string,
): Promise<string> {
  if (currentStatus !== 'pending') return currentStatus;
  const paid = await sumPostedPaymentsForReceivable(receivableId);
  if (paid > 0.009) return currentStatus;
  const { error } = await supabaseAdmin
    .from('hub_receivables')
    .update({ status: 'refunded' })
    .eq('id', receivableId)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
  return 'refunded';
}

export type ValidateCashSessionResult =
  | { ok: true; cash_session_id: string | null }
  | { ok: false; error: string; status: number };

/**
 * Dinheiro operacional exige sessão aberta.
 * Não-dinheiro nunca exige; cash_session_id só se enviado explicitamente e válido.
 * Sem auto-vínculo a sessão aberta.
 */
export async function validatePaymentCashSession(opts: {
  clinicId: string;
  paymentMethod: string;
  cashSessionId?: string | null;
  receivableUnitId?: string | null;
}): Promise<ValidateCashSessionResult> {
  const { clinicId, paymentMethod, cashSessionId, receivableUnitId } = opts;

  if (paymentMethod === 'cash') {
    if (!cashSessionId) {
      return { ok: false, error: 'Abra o caixa para receber em dinheiro.', status: 409 };
    }
    const { data: cashSession, error: cashErr } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select('id, clinic_id, unit_id, status')
      .eq('id', cashSessionId)
      .maybeSingle();
    if (
      cashErr ||
      !cashSession ||
      cashSession.clinic_id !== clinicId ||
      cashSession.status !== 'open' ||
      (receivableUnitId && cashSession.unit_id !== receivableUnitId)
    ) {
      return {
        ok: false,
        error: 'Sessão de caixa inválida ou fechada para este recebimento em dinheiro.',
        status: 409,
      };
    }
    return { ok: true, cash_session_id: cashSession.id as string };
  }

  if (cashSessionId) {
    const { data: cashSession, error: cashErr } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select('id, clinic_id, unit_id, status')
      .eq('id', cashSessionId)
      .maybeSingle();
    if (
      cashErr ||
      !cashSession ||
      cashSession.clinic_id !== clinicId ||
      cashSession.status !== 'open' ||
      (receivableUnitId && cashSession.unit_id !== receivableUnitId)
    ) {
      return { ok: false, error: 'Sessão de caixa inválida ou fechada para este recebimento.', status: 409 };
    }
    return { ok: true, cash_session_id: cashSession.id as string };
  }

  return { ok: true, cash_session_id: null };
}

/**
 * Anulação (payment_reversal) ou reembolso efetivo (refund). Soft-reverse — nunca DELETE.
 */
export async function reversePaymentSoft(opts: {
  paymentId: string;
  clinicId: string;
  userId: string | null;
  reason: string;
  mode: PaymentReversalMode;
  refundMethod?: string | null;
  refundEffectiveDate?: string | null;
  /** Só reentra estoque com confirmação explícita de devolução física. */
  confirmStockReturn?: boolean;
  stockReturnCondition?: StockReturnCondition;
  stockReturnLines?: StockReturnLineSpec[];
}): Promise<ReversePaymentResult> {
  const { paymentId, clinicId, userId, reason, mode } = opts;
  if (reason.trim().length < 3) {
    throw new FinanceLedgerError('Motivo obrigatório (mín. 3 caracteres)', 400);
  }
  if (mode === 'refund') {
    if (!opts.refundMethod || !opts.refundEffectiveDate) {
      throw new FinanceLedgerError('Reembolso exige refund_method e refund_effective_date', 400);
    }
  }
  if (opts.confirmStockReturn) {
    if (mode !== 'refund') {
      throw new FinanceLedgerError(
        'Devolução de estoque só se aplica a reembolso efetivo (não a anulação de lançamento).',
        400,
      );
    }
    if (!opts.stockReturnCondition) {
      throw new FinanceLedgerError(
        'Informe stock_return_condition (sellable|unsellable) ao confirmar devolução física.',
        400,
      );
    }
  }

  const { data: payment, error: pErr } = await supabaseAdmin
    .from('hub_payments')
    .select(
      'id, clinic_id, receivable_id, amount, payment_method, cash_session_id, status, posting_kind',
    )
    .eq('id', paymentId)
    .maybeSingle();
  if (pErr || !payment || payment.clinic_id !== clinicId) {
    throw new FinanceLedgerError('Pagamento não encontrado', 404);
  }
  if (String(payment.status) === 'reversed') {
    throw new FinanceLedgerError('Pagamento já estornado', 409);
  }

  const receivableIdPre = payment.receivable_id as string;

  // Validações de negócio ANTES de qualquer escrita (RPC/TS) — evita estorno órfão.
  {
    const { data: recPre } = await supabaseAdmin
      .from('hub_receivables')
      .select('final_amount, status, guardian_id, comanda_id, returned_amount')
      .eq('id', receivableIdPre)
      .maybeSingle();

    if (mode === 'refund' && opts.refundMethod === 'customer_credit') {
      const guardianId = (recPre?.guardian_id as string | null) ?? null;
      if (!guardianId) {
        throw new FinanceLedgerError(
          'Recebível sem tutor — não é possível reembolsar em crédito. Escolha Pix, dinheiro ou outra forma.',
          409,
        );
      }
    }

    /**
     * Reembolso + devolução física de itens NÃO deve estornar o pagamento inteiro.
     * Caso real (Diana): Antipulgas+Shampoo R$150 — devolveu só Antipulgas via “Estornar”
     * → payment reversed R$150, status refunded, returned_amount 0, Shampoo preso em “Já estornados”.
     * Correto: devolução por linha (comercial + financeiro só do selecionado).
     */
    if (mode === 'refund' && opts.confirmStockReturn) {
      let lineSpecs = [...(opts.stockReturnLines ?? [])];
      if (!lineSpecs.length) {
        const [{ data: lines }, { data: priorReturns }] = await Promise.all([
          supabaseAdmin
            .from('hub_receivable_lines')
            .select('id, line_kind, hub_inventory_item_id, hub_inventory_lot_id, quantity')
            .eq('receivable_id', receivableIdPre)
            .eq('clinic_id', clinicId),
          supabaseAdmin
            .from('hub_product_return_events')
            .select('receivable_line_id')
            .eq('receivable_id', receivableIdPre)
            .eq('clinic_id', clinicId),
        ]);
        const already = new Set(
          (priorReturns ?? []).map((r) => String(r.receivable_line_id)),
        );
        lineSpecs = (lines ?? [])
          .filter((l) => isProductStockLine(l as Record<string, unknown>) && !already.has(String(l.id)))
          .map((l) => ({
            line_id: String(l.id),
            qty: Number(l.quantity ?? 0) > 0 ? Number(l.quantity) : undefined,
          }));
      }
      if (lineSpecs.length) {
        if (!opts.stockReturnCondition) {
          throw new FinanceLedgerError(
            'Informe stock_return_condition (sellable|unsellable) ao confirmar devolução física.',
            400,
          );
        }
        const productReturn = await returnReceivableProductLines({
          clinicId,
          receivableId: receivableIdPre,
          userId,
          reason: reason.trim(),
          condition: opts.stockReturnCondition,
          lineSpecs,
          refundMethod: opts.refundMethod ?? null,
          refundEffectiveDate: opts.refundEffectiveDate ?? null,
          idempotencyKey: randomUUID(),
        });
        return {
          ok: true,
          receivable_status: productReturn.receivable_status,
          receivable_id: receivableIdPre,
          adjustment_id: productReturn.adjustment_id ?? '',
          reversal_mode: 'refund',
          warning:
            productReturn.warning ||
            'Devolução registrada por item (reembolso comercial/financeiro só do selecionado — o pagamento original permanece até o líquido zerar).',
          stock_restored: productReturn.stock_restored,
          stock_unsellable: productReturn.stock_unsellable,
        };
      }
      // Itens já devolvidos: segue reembolso financeiro puro (sem nova movimentação de estoque).
      opts.confirmStockReturn = false;
    }

    // Devolução parcial: anular/reembolsar payment integral gera saldo incoerente.
    if (recPre && Number(recPre.returned_amount ?? 0) > 0.009) {
      const paidNow = await sumPostedPaymentsForReceivable(receivableIdPre);
      const after = round2Ledger(paidNow - Number(payment.amount ?? 0));
      const finalAmt = Number(recPre.final_amount ?? 0);
      if (after < finalAmt - 0.009) {
        throw new FinanceLedgerError(
          'Há devolução parcial de produtos neste recebível. Não é possível anular/reembolsar este pagamento por completo sem incoerência de saldo. Devolva os itens restantes pela devolução de mercadoria.',
          409,
        );
      }
    }

    // Se o estorno tirar o recebível de `paid`, saldos ainda active com restante
    // exigem cancel comercial antes (não bloqueia por redemption — cancel ≠ reverse).
    if (recPre && String(recPre.status) === 'paid') {
      const paidNow = await sumPostedPaymentsForReceivable(receivableIdPre);
      const after = round2Ledger(paidNow - Number(payment.amount ?? 0));
      const finalAmt = Number(recPre.final_amount ?? 0);
      if (after < finalAmt - 0.009) {
        const { data: activeBalances } = await supabaseAdmin
          .from('hub_customer_package_balances')
          .select('id')
          .eq('purchased_receivable_id', receivableIdPre)
          .eq('status', 'active')
          .gt('sessions_remaining', 0)
          .limit(1);
        if (activeBalances?.length) {
          throw new FinanceLedgerError(
            'Cancele o pacote comercialmente antes de estornar a quitação (cancel ≠ estorno).',
            409,
          );
        }
      }
    }
  }

  const adjType = mode === 'refund' ? 'refund' : 'payment_reversal';
  let warning: string | null = null;

  // Tentativa via RPC atômica (produção). Fallback TS para mocks/ambientes sem função.
  let rpcData: unknown = null;
  let rpcErr: { message?: string } | null = null;
  try {
    const rpcRes = await supabaseAdmin.rpc('hub_reverse_payment', {
      p_payment_id: paymentId,
      p_clinic_id: clinicId,
      p_user_id: userId,
      p_reason: reason.trim(),
      p_mode: mode,
      p_refund_method: mode === 'refund' ? opts.refundMethod : null,
      p_refund_effective_date: mode === 'refund' ? opts.refundEffectiveDate : null,
    });
    rpcData = rpcRes.data;
    rpcErr = rpcRes.error;
  } catch {
    rpcErr = { message: 'rpc_unavailable' };
  }

  let adjustmentId: string;
  let receivableStatus: string;
  let receivableId = payment.receivable_id as string;

  if (!rpcErr && rpcData && typeof rpcData === 'object' && (rpcData as { ok?: boolean }).ok) {
    const body = rpcData as {
      receivable_status: string;
      receivable_id: string;
      adjustment_id: string;
      warning?: string | null;
    };
    adjustmentId = body.adjustment_id;
    receivableStatus = body.receivable_status;
    receivableId = body.receivable_id;
    warning = body.warning ?? null;
  } else {
    // Fallback TS (testes / RPC ausente)
    if (payment.payment_method === 'cash' && payment.cash_session_id) {
      const { data: session } = await supabaseAdmin
        .from('hub_cash_sessions')
        .select('id, status')
        .eq('id', payment.cash_session_id as string)
        .eq('clinic_id', clinicId)
        .maybeSingle();
      if (session?.status === 'closed') {
        warning =
          'Pagamento em dinheiro de caixa já fechado; snapshot da sessão preservado — ajuste pós-fechamento registrado.';
      }
    }

    const { data: adj, error: adjErr } = await supabaseAdmin
      .from('hub_financial_adjustments')
      .insert({
        clinic_id: clinicId,
        receivable_id: payment.receivable_id,
        payment_id: paymentId,
        adjustment_type: adjType,
        amount: payment.amount,
        reason: reason.trim(),
        created_by_user_id: userId,
        refund_method: mode === 'refund' ? opts.refundMethod : null,
        refund_effective_date: mode === 'refund' ? opts.refundEffectiveDate : null,
      })
      .select('id')
      .single();
    if (adjErr || !adj) {
      if (String(adjErr?.message ?? '').includes('uniq_hub_financial_adjustments_payment_reverse')) {
        throw new FinanceLedgerError('Pagamento já estornado', 409);
      }
      throw new Error(adjErr?.message || 'Erro ao registrar ajuste');
    }
    adjustmentId = adj.id as string;

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('hub_payments')
      .update({
        status: 'reversed',
        reversed_at: new Date().toISOString(),
        reversed_by_user_id: userId,
        reversal_reason: reason.trim(),
        reversal_mode: mode,
        reversal_adjustment_id: adjustmentId,
      })
      .eq('id', paymentId)
      .eq('status', 'posted')
      .select('id')
      .maybeSingle();
    if (updErr) throw new Error(updErr.message);
    if (!updated) {
      throw new FinanceLedgerError('Pagamento já estornado', 409);
    }

    if (payment.payment_method === 'cash' && payment.cash_session_id && warning) {
      await supabaseAdmin.from('hub_cash_session_post_close_adjustments').insert({
        clinic_id: clinicId,
        cash_session_id: payment.cash_session_id,
        payment_id: paymentId,
        adjustment_id: adjustmentId,
        adjustment_type: mode === 'refund' ? 'refund_impact' : 'reversal_impact',
        amount: payment.amount,
        reason: reason.trim(),
        effective_date:
          opts.refundEffectiveDate ??
          new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
        created_by_user_id: userId,
      });
    }

    receivableStatus = await recalculateReceivableFromPosted(receivableId);
  }

  if (mode === 'refund') {
    receivableStatus = await applyRefundReceivableClosure(receivableId, receivableStatus);
  }

  // Crédito do tutor / reembolso em crédito — uma vez, fora do RPC (lógica de negócio TS).
  if (mode === 'payment_reversal' && payment.payment_method === 'customer_credit') {
    try {
      await restoreCustomerCreditIfNeeded({
        clinicId,
        paymentMethod: 'customer_credit',
        amount: Number(payment.amount ?? 0),
        receivableId,
        reason: reason.trim(),
        createdByUserId: userId,
      });
    } catch (e) {
      if (e instanceof CustomerCreditError) throw new FinanceLedgerError(e.message, e.status);
      throw e;
    }
  } else if (mode === 'refund' && opts.refundMethod === 'customer_credit') {
    // guardian_id já validado antes do estorno; só aplica o crédito.
    const { data: rec } = await supabaseAdmin
      .from('hub_receivables')
      .select('guardian_id, comanda_id')
      .eq('id', receivableId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    const guardianId = (rec?.guardian_id as string | null) ?? null;
    if (!guardianId) {
      // Não deveria ocorrer após a pré-checagem; evita crédito silencioso.
      throw new FinanceLedgerError(
        'Recebível sem tutor — não é possível reembolsar em crédito. Escolha Pix, dinheiro ou outra forma.',
        409,
      );
    }
    try {
      await restoreHubCustomerCredit({
        clinicId,
        guardianId,
        amount: round2Ledger(Number(payment.amount ?? 0)),
        reason: `Reembolso efetivo: ${reason.trim()}`,
        comandaId: (rec?.comanda_id as string | null) ?? null,
        receivableId,
        createdByUserId: userId,
      });
    } catch (e) {
      if (e instanceof CustomerCreditError) throw new FinanceLedgerError(e.message, e.status);
      throw e;
    }
  }

  // Sync appointment já feito no recalc; garantir se veio do RPC
  await syncHubAppointmentPaidFromReceivable({ clinicId, receivableId });
  void syncChargeBundleStatusForReceivable(receivableId, clinicId);
  // RPC recalcula status sem passar pelo TS — alinhar saldos de pacote.
  try {
    await syncPackageBalancesForReceivable(receivableId);
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (msg.startsWith('PACKAGE_BALANCE_HAS_REDEMPTIONS')) {
      throw new FinanceLedgerError(
        'Não é possível estornar: o pacote já teve sessões consumidas. Estorne os resgates antes.',
        409,
      );
    }
    throw e;
  }

  // Financeiro ≠ físico: refund/reversal nunca reentram estoque sem confirmação explícita.
  // payment_reversal: silencioso quanto a estoque (nunca moveu); refund sem confirmação: avisa.
  let stockRestored = 0;
  let stockUnsellable = 0;
  if (mode === 'refund' && !opts.confirmStockReturn) {
    const stockHint =
      'Estoque não foi alterado. Para devolver mercadoria ao disponível, confirme a devolução física (confirm_stock_return).';
    warning = warning ? `${warning} ${stockHint}` : stockHint;
  } else if (mode === 'refund' && opts.confirmStockReturn) {
    const stock = await restoreProductStockForReceivableLines({
      clinicId,
      receivableId,
      notes: `Devolução física confirmada no reembolso: ${reason.trim()}`,
      createdBy: userId,
      condition: opts.stockReturnCondition,
      lineSpecs: opts.stockReturnLines,
    });
    if (stock.errors.length) {
      throw new FinanceLedgerError(
        `Estorno financeiro ok, mas falhou a devolução de estoque: ${stock.errors[0]}`,
        500,
      );
    }
    stockRestored = stock.restored;
    stockUnsellable = stock.unsellable;
    if (opts.stockReturnCondition === 'unsellable') {
      const tip =
        stockUnsellable > 0
          ? `Devolução registrada sem reentrada ao disponível (${stockUnsellable} linha(s) sem condição de revenda).`
          : 'Devolução sem condição de revenda: estoque disponível inalterado.';
      warning = warning ? `${warning} ${tip}` : tip;
    } else if (stockRestored > 0 || stock.skipped > 0) {
      const tip = `Estoque reentrado (${stockRestored} nova(s), ${stock.skipped} já registrada(s)).`;
      warning = warning ? `${warning} ${tip}` : tip;
    }
  }

  return {
    ok: true,
    receivable_status: receivableStatus,
    receivable_id: receivableId,
    adjustment_id: adjustmentId,
    reversal_mode: mode,
    warning,
    stock_restored: stockRestored,
    stock_unsellable: stockUnsellable,
  };
}

export type ProductLineReturnResult = {
  ok: true;
  receivable_status: string;
  refund_amount: number;
  commercial_returned?: number;
  balance_due?: number;
  adjustment_id: string | null;
  stock_restored: number;
  stock_unsellable: number;
  warning: string | null;
  replayed?: boolean;
};

/** Produção/preprod: só RPC. Fallback TS apenas em test / HUB_PRODUCT_RETURN_TS_FALLBACK=1. */
export function allowProductReturnTsFallback(): boolean {
  if (process.env.HUB_PRODUCT_RETURN_TS_FALLBACK === '1') return true;
  if (process.env.HUB_PRODUCT_RETURN_TS_FALLBACK === '0') return false;
  return process.env.NODE_ENV === 'test';
}

function isHubReturnProductLinesUnavailableError(msg: string): boolean {
  const m = String(msg || '').toLowerCase();
  return (
    m.includes('rpc_unavailable') ||
    m.includes('could not find the function') ||
    m.includes('function public.hub_return_receivable_product_lines') ||
    m.includes('schema cache') ||
    m.includes('pgrst202') ||
    m.includes('42883') ||
    m.includes('rpc is not a function') ||
    m.includes('.rpc is not a function')
  );
}

function mapRpcBusinessError(msg: string): FinanceLedgerError | null {
  const raw = String(msg || '');
  const lower = raw.toLowerCase();
  if (!raw) return null;
  if (lower.includes('não encontrado') || lower.includes('nao encontrado') || lower.includes('p0002')) {
    return new FinanceLedgerError(raw.replace(/^.*?:\s*/i, '').slice(0, 500) || 'Não encontrado', 404);
  }
  if (
    lower.includes('p0001') ||
    lower.includes('já') ||
    lower.includes('excede') ||
    lower.includes('obrigat') ||
    lower.includes('inválid') ||
    lower.includes('invalid') ||
    lower.includes('sem tutor') ||
    lower.includes('legado') ||
    lower.includes('idempotency') ||
    lower.includes('bloqueado') ||
    lower.includes('devolução')
  ) {
    const clean = raw
      .replace(/^.*ERROR:\s*/i, '')
      .replace(/\s+CONTEXT:[\s\S]*$/i, '')
      .trim();
    const status =
      lower.includes('idempotency') || lower.includes('já') || lower.includes('legado') || lower.includes('bloqueado')
        ? 409
        : lower.includes('obrigat') || lower.includes('inválid')
          ? 400
          : 409;
    return new FinanceLedgerError(clean.slice(0, 500) || 'Operação não permitida', status);
  }
  return null;
}

/** Timeline da comanda: registra devolução de mercadoria (usa item_updated — enum existente). */
async function recordMerchandiseReturnComandaEvent(opts: {
  clinicId: string;
  receivableId: string;
  userId: string | null;
  reason: string;
  lineIds: string[];
  commercialReturned: number;
  financialRefund: number;
  condition: StockReturnCondition;
}): Promise<void> {
  const { data: rec } = await supabaseAdmin
    .from('hub_receivables')
    .select('comanda_id')
    .eq('id', opts.receivableId)
    .eq('clinic_id', opts.clinicId)
    .maybeSingle();
  const comandaId = (rec?.comanda_id as string | null) ?? null;
  if (!comandaId) return;

  const { data: lines } = await supabaseAdmin
    .from('hub_receivable_lines')
    .select('id, description, quantity, line_total')
    .eq('receivable_id', opts.receivableId)
    .in('id', opts.lineIds);

  const names = (lines ?? []).map((l) => String(l.description || 'Produto').trim()).filter(Boolean);
  const label = names.length <= 2 ? names.join(', ') : `${names[0]} e mais ${names.length - 1}`;
  const moneyBits = [
    opts.commercialReturned > 0.009
      ? `comercial ${opts.commercialReturned.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
      : null,
    opts.financialRefund > 0.009
      ? `reembolso ${opts.financialRefund.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
      : null,
    opts.condition === 'unsellable' ? 'sem revenda' : 'apto à revenda',
  ].filter(Boolean);

  await recordComandaEvent({
    clinic_id: opts.clinicId,
    comanda_id: comandaId,
    event_type: 'item_updated',
    title: names.length > 1 ? 'Produtos devolvidos' : 'Produto devolvido',
    body: comandaItemEventBody(label || 'Mercadoria', {}) + (moneyBits.length ? ` · ${moneyBits.join(' · ')}` : ''),
    metadata: {
      source: 'merchandise_return',
      receivable_id: opts.receivableId,
      line_ids: opts.lineIds,
      commercial_returned: opts.commercialReturned,
      financial_refund: opts.financialRefund,
      condition: opts.condition,
      reason: opts.reason,
    },
    actor_user_id: opts.userId,
    edit_context: 'financeiro',
  });
}

/**
 * Devolução por item via RPC atômica `hub_return_receivable_product_lines`.
 * Separação: comercial devolvido × reembolso financeiro (matriz pago vs líquido).
 */
export async function returnReceivableProductLines(opts: {
  clinicId: string;
  receivableId: string;
  userId: string | null;
  reason: string;
  condition: StockReturnCondition;
  lineSpecs: StockReturnLineSpec[];
  refundMethod?: string | null;
  refundEffectiveDate?: string | null;
  idempotencyKey: string;
}): Promise<ProductLineReturnResult> {
  const reason = opts.reason.trim();
  if (reason.length < 3) {
    throw new FinanceLedgerError('Motivo obrigatório (mín. 3 caracteres)', 400);
  }
  if (!opts.lineSpecs.length) {
    throw new FinanceLedgerError('Selecione ao menos um produto para devolver.', 400);
  }
  if (!opts.idempotencyKey || !/^[0-9a-f-]{36}$/i.test(opts.idempotencyKey)) {
    throw new FinanceLedgerError('idempotency_key UUID obrigatória', 400);
  }

  const lineIds = [...new Set(opts.lineSpecs.map((s) => s.line_id))];
  if (lineIds.length !== opts.lineSpecs.length) {
    throw new FinanceLedgerError('line_ids contém duplicatas', 400);
  }

  let rpcData: unknown = null;
  let rpcMsg = '';
  try {
    const rpcRes = await supabaseAdmin.rpc('hub_return_receivable_product_lines', {
      p_clinic_id: opts.clinicId,
      p_receivable_id: opts.receivableId,
      p_user_id: opts.userId,
      p_reason: reason,
      p_condition: opts.condition,
      p_line_ids: lineIds,
      p_refund_method: opts.refundMethod ?? null,
      p_refund_effective_date: opts.refundEffectiveDate ?? null,
      p_idempotency_key: opts.idempotencyKey,
    });
    rpcData = rpcRes.data;
    if (rpcRes.error) rpcMsg = rpcRes.error.message || 'rpc_error';
  } catch (e) {
    rpcMsg = (e as Error)?.message || 'rpc_unavailable';
  }

  if (!rpcMsg && rpcData && typeof rpcData === 'object' && (rpcData as { ok?: boolean }).ok) {
    const body = rpcData as {
      receivable_status: string;
      refund_amount?: number;
      financial_refund?: number;
      commercial_returned?: number;
      balance_due?: number;
      adjustment_id?: string | null;
      stock_restored?: number;
      stock_unsellable?: number;
      warning?: string | null;
      replayed?: boolean;
    };
    const refundAmount = round2Ledger(Number(body.financial_refund ?? body.refund_amount ?? 0));
    try {
      await syncHubAppointmentPaidFromReceivable({
        clinicId: opts.clinicId,
        receivableId: opts.receivableId,
      });
      void syncChargeBundleStatusForReceivable(opts.receivableId, opts.clinicId);
      await syncPackageBalancesForReceivable(opts.receivableId);
      if (!body.replayed) {
        await recordMerchandiseReturnComandaEvent({
          clinicId: opts.clinicId,
          receivableId: opts.receivableId,
          userId: opts.userId,
          reason,
          lineIds: lineIds,
          commercialReturned: Number(body.commercial_returned ?? 0),
          financialRefund: refundAmount,
          condition: opts.condition,
        });
      }
      const { data: recMeta } = await supabaseAdmin
        .from('hub_receivables')
        .select('comanda_id')
        .eq('id', opts.receivableId)
        .eq('clinic_id', opts.clinicId)
        .maybeSingle();
      const comandaId = (recMeta?.comanda_id as string | null) ?? null;
      if (comandaId) {
        try {
          const { refreshComandaFinancialStatus } = await import('./hubComandasController.js');
          const { data: comandaRow } = await supabaseAdmin
            .from('hub_comandas')
            .select('*')
            .eq('id', comandaId)
            .eq('clinic_id', opts.clinicId)
            .maybeSingle();
          if (comandaRow) {
            await refreshComandaFinancialStatus(
              comandaId,
              opts.clinicId,
              comandaRow as Record<string, unknown>,
            );
          }
        } catch (e) {
          console.warn('[hub_finance] refreshComandaFinancialStatus after RPC return', e);
        }
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      if (msg.startsWith('PACKAGE_BALANCE_HAS_REDEMPTIONS')) {
        throw new FinanceLedgerError(
          'Não é possível devolver: o pacote já teve sessões consumidas. Estorne os resgates antes.',
          409,
        );
      }
      throw e;
    }
    return {
      ok: true,
      receivable_status: String(body.receivable_status),
      refund_amount: refundAmount,
      commercial_returned: body.commercial_returned != null ? Number(body.commercial_returned) : undefined,
      balance_due: body.balance_due != null ? Number(body.balance_due) : undefined,
      adjustment_id: (body.adjustment_id as string | null) ?? null,
      stock_restored: Number(body.stock_restored ?? 0),
      stock_unsellable: Number(body.stock_unsellable ?? 0),
      warning: body.warning ?? null,
      replayed: Boolean(body.replayed),
    };
  }

  const business = mapRpcBusinessError(rpcMsg);
  if (business) throw business;

  if (!isHubReturnProductLinesUnavailableError(rpcMsg) || !allowProductReturnTsFallback()) {
    console.error('[hub_finance] hub_return_receivable_product_lines unavailable', rpcMsg);
    throw new FinanceLedgerError(
      'Devolução de mercadoria temporariamente indisponível (RPC). Tente novamente em instantes; nenhuma alteração foi aplicada.',
      503,
    );
  }

  // Fallback só em testes — não é atômico sob concorrência.
  return returnReceivableProductLinesTsFallback(opts);
}

/** @internal Somente NODE_ENV=test / HUB_PRODUCT_RETURN_TS_FALLBACK=1 */
async function returnReceivableProductLinesTsFallback(opts: {
  clinicId: string;
  receivableId: string;
  userId: string | null;
  reason: string;
  condition: StockReturnCondition;
  lineSpecs: StockReturnLineSpec[];
  refundMethod?: string | null;
  refundEffectiveDate?: string | null;
  idempotencyKey: string;
}): Promise<ProductLineReturnResult> {
  const {
    computeReceivableFinancialAfterReturn,
    commercialReturnForLines,
  } = await import('./hubReceivableFinancialBalance.js');

  const reason = opts.reason.trim();
  const { data: rec, error: rErr } = await supabaseAdmin
    .from('hub_receivables')
    .select(
      'id, clinic_id, status, final_amount, original_amount, net_amount_at_sale, returned_amount, guardian_id, comanda_id, unit_id',
    )
    .eq('id', opts.receivableId)
    .eq('clinic_id', opts.clinicId)
    .maybeSingle();
  if (rErr || !rec) throw new FinanceLedgerError('Recebível não encontrado', 404);
  if (String(rec.status) === 'cancelled') {
    throw new FinanceLedgerError('Recebível cancelado — não é possível devolver produtos.', 409);
  }

  const { data: existingReq } = await supabaseAdmin
    .from('hub_product_return_requests')
    .select('receivable_id, payload_hash, response')
    .eq('clinic_id', opts.clinicId)
    .eq('idempotency_key', opts.idempotencyKey)
    .maybeSingle();
  if (existingReq?.response && typeof existingReq.response === 'object') {
    const body = existingReq.response as Record<string, unknown>;
    return {
      ok: true,
      receivable_status: String(body.receivable_status ?? rec.status),
      refund_amount: Number(body.refund_amount ?? body.financial_refund ?? 0),
      commercial_returned: body.commercial_returned != null ? Number(body.commercial_returned) : undefined,
      balance_due: body.balance_due != null ? Number(body.balance_due) : undefined,
      adjustment_id: (body.adjustment_id as string | null) ?? null,
      stock_restored: Number(body.stock_restored ?? 0),
      stock_unsellable: Number(body.stock_unsellable ?? 0),
      warning: (body.warning as string | null) ?? null,
      replayed: true,
    };
  }

  const { data: lines, error: lErr } = await supabaseAdmin
    .from('hub_receivable_lines')
    .select('*')
    .eq('receivable_id', opts.receivableId)
    .eq('clinic_id', opts.clinicId);
  if (lErr) throw new Error(lErr.message);

  const lineById = new Map((lines ?? []).map((l) => [String(l.id), l as Record<string, unknown>]));
  const selected: Array<Record<string, unknown>> = [];
  for (const spec of opts.lineSpecs) {
    const line = lineById.get(spec.line_id);
    if (!line) throw new FinanceLedgerError(`Linha ${spec.line_id} não encontrada nesta cobrança.`, 404);
    if (String(line.line_kind ?? '') !== 'product') {
      throw new FinanceLedgerError('Só linhas de produto podem ser devolvidas.', 409);
    }
    if (!line.hub_inventory_item_id || !line.hub_inventory_lot_id) {
      throw new FinanceLedgerError('Produto sem vínculo de estoque — não é possível devolver.', 409);
    }
    selected.push(line);
  }

  const { data: priorReturns } = await supabaseAdmin
    .from('hub_product_return_events')
    .select('receivable_line_id')
    .eq('clinic_id', opts.clinicId)
    .eq('receivable_id', opts.receivableId)
    .in(
      'receivable_line_id',
      selected.map((l) => String(l.id)),
    );
  const already = new Set((priorReturns ?? []).map((r) => String(r.receivable_line_id)));
  if (selected.some((l) => already.has(String(l.id)))) {
    throw new FinanceLedgerError('Um ou mais itens selecionados já foram devolvidos.', 409);
  }

  const netAtSale =
    rec.net_amount_at_sale != null
      ? Number(rec.net_amount_at_sale)
      : round2Ledger(Number(rec.final_amount ?? 0) + Number(rec.returned_amount ?? 0));

  const commercial = commercialReturnForLines({
    lineTotals: selected.map((l) => Number(l.line_total ?? 0)),
    originalAmount: Number(rec.original_amount ?? 0),
    netAmountAtSale: netAtSale,
  });

  const posted = await sumPostedPaymentsForReceivable(opts.receivableId);
  const { data: lineRefundsRows } = await supabaseAdmin
    .from('hub_financial_adjustments')
    .select('amount')
    .eq('receivable_id', opts.receivableId)
    .eq('adjustment_type', 'refund')
    .is('payment_id', null);
  const lineRefundsBefore = round2Ledger(
    (lineRefundsRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0),
  );

  const snap = computeReceivableFinancialAfterReturn({
    netAmountAtSale: netAtSale,
    returnedAmountBefore: Number(rec.returned_amount ?? 0),
    commercialReturnNow: commercial,
    postedPayments: posted,
    lineRefundsAlreadyPaidOut: lineRefundsBefore,
  });

  if (snap.financialRefundNow > 0.009) {
    if (!opts.refundMethod || !opts.refundEffectiveDate) {
      throw new FinanceLedgerError(
        `Há valor financeiro a devolver (R$ ${snap.financialRefundNow.toFixed(2)}). Informe a forma e a data do reembolso.`,
        400,
      );
    }
    if (opts.refundMethod === 'customer_credit' && !(rec.guardian_id as string | null)) {
      throw new FinanceLedgerError(
        'Recebível sem tutor — não é possível reembolsar em crédito. Escolha Pix, dinheiro ou outra forma.',
        409,
      );
    }
  }

  let warning: string | null = null;
  let adjustmentId: string | null = null;

  if (snap.financialRefundNow > 0.009) {
    const { data: adj, error: adjErr } = await supabaseAdmin
      .from('hub_financial_adjustments')
      .insert({
        clinic_id: opts.clinicId,
        receivable_id: opts.receivableId,
        payment_id: null,
        adjustment_type: 'refund',
        amount: snap.financialRefundNow,
        reason: `Devolução de produto: ${reason}`,
        created_by_user_id: opts.userId,
        refund_method: opts.refundMethod,
        refund_effective_date: opts.refundEffectiveDate,
      })
      .select('id')
      .single();
    if (adjErr || !adj) throw new Error(adjErr?.message || 'Erro ao registrar reembolso');
    adjustmentId = adj.id as string;

    if (opts.refundMethod === 'customer_credit') {
      try {
        await restoreHubCustomerCredit({
          clinicId: opts.clinicId,
          guardianId: rec.guardian_id as string,
          amount: snap.financialRefundNow,
          reason: `Reembolso por devolução de produto: ${reason}`,
          comandaId: (rec.comanda_id as string | null) ?? null,
          receivableId: opts.receivableId,
          createdByUserId: opts.userId,
        });
      } catch (e) {
        if (e instanceof CustomerCreditError) throw new FinanceLedgerError(e.message, e.status);
        throw e;
      }
    } else if (opts.refundMethod === 'cash' && rec.unit_id) {
      const { data: openSession } = await supabaseAdmin
        .from('hub_cash_sessions')
        .select('id')
        .eq('clinic_id', opts.clinicId)
        .eq('unit_id', rec.unit_id as string)
        .eq('status', 'open')
        .maybeSingle();
      if (openSession?.id) {
        await supabaseAdmin.from('hub_cash_movements').insert({
          clinic_id: opts.clinicId,
          cash_session_id: openSession.id,
          movement_type: 'withdrawal',
          amount: snap.financialRefundNow,
          notes: `Reembolso devolução de produto: ${reason}`,
          created_by_user_id: opts.userId,
        });
      } else {
        warning =
          'Reembolso em dinheiro registrado sem sessão de caixa aberta — ajuste a gaveta manualmente se necessário.';
      }
    }
  }

  const stock = await restoreProductStockForReceivableLines({
    clinicId: opts.clinicId,
    receivableId: opts.receivableId,
    notes: `Devolução física de item(ns): ${reason}`,
    createdBy: opts.userId,
    lines: lines as Array<Record<string, unknown>>,
    condition: opts.condition,
    lineSpecs: opts.lineSpecs,
  });
  if (stock.errors.length) throw new FinanceLedgerError(stock.errors[0], 500);

  await supabaseAdmin
    .from('hub_receivables')
    .update({
      final_amount: snap.finalAmountAfter,
      returned_amount: snap.returnedAmountAfter,
      net_amount_at_sale: netAtSale,
      status: snap.suggestedStatus,
    })
    .eq('id', opts.receivableId);

  if (snap.finalAmountAfter <= 0.009 && posted > 0.009) {
    const { data: postedPays } = await supabaseAdmin
      .from('hub_payments')
      .select('id')
      .eq('receivable_id', opts.receivableId)
      .eq('status', 'posted');
    const now = new Date().toISOString();
    for (const pay of postedPays ?? []) {
      await supabaseAdmin
        .from('hub_payments')
        .update({
          status: 'reversed',
          reversed_at: now,
          reversed_by_user_id: opts.userId,
          reversal_reason: `Venda zerada após devolução de produtos: ${reason}`,
          reversal_mode: 'refund',
          reversal_adjustment_id: adjustmentId,
        })
        .eq('id', pay.id);
    }
  }

  await syncHubAppointmentPaidFromReceivable({ clinicId: opts.clinicId, receivableId: opts.receivableId });
  void syncChargeBundleStatusForReceivable(opts.receivableId, opts.clinicId);
  try {
    await syncPackageBalancesForReceivable(opts.receivableId);
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (msg.startsWith('PACKAGE_BALANCE_HAS_REDEMPTIONS')) {
      throw new FinanceLedgerError(
        'Não é possível devolver: o pacote já teve sessões consumidas. Estorne os resgates antes.',
        409,
      );
    }
    throw e;
  }

  if (opts.condition === 'unsellable' && stock.unsellable > 0) {
    const tip = `Devolução registrada sem reentrada ao disponível (${stock.unsellable} linha(s)).`;
    warning = warning ? `${warning} ${tip}` : tip;
  } else if (stock.restored > 0 || stock.skipped > 0) {
    const tip = `Estoque reentrado (${stock.restored} nova(s), ${stock.skipped} já registrada(s)).`;
    warning = warning ? `${warning} ${tip}` : tip;
  }

  const response = {
    ok: true as const,
    receivable_status: snap.suggestedStatus,
    refund_amount: snap.financialRefundNow,
    commercial_returned: snap.commercialReturnedNow,
    balance_due: snap.balanceDueAfter,
    adjustment_id: adjustmentId,
    stock_restored: stock.restored,
    stock_unsellable: stock.unsellable,
    warning,
  };

  await supabaseAdmin.from('hub_product_return_requests').insert({
    clinic_id: opts.clinicId,
    receivable_id: opts.receivableId,
    idempotency_key: opts.idempotencyKey,
    payload_hash: `ts:${opts.idempotencyKey}`,
    response,
    created_by_user_id: opts.userId,
  });

  await recordMerchandiseReturnComandaEvent({
    clinicId: opts.clinicId,
    receivableId: opts.receivableId,
    userId: opts.userId,
    reason: opts.reason.trim(),
    lineIds: [...new Set(opts.lineSpecs.map((s) => s.line_id))],
    commercialReturned: snap.commercialReturnedNow,
    financialRefund: snap.financialRefundNow,
    condition: opts.condition,
  });

  const comandaId = (rec.comanda_id as string | null) ?? null;
  if (comandaId) {
    try {
      const { refreshComandaFinancialStatus } = await import('./hubComandasController.js');
      const { data: comandaRow } = await supabaseAdmin
        .from('hub_comandas')
        .select('*')
        .eq('id', comandaId)
        .eq('clinic_id', opts.clinicId)
        .maybeSingle();
      if (comandaRow) {
        await refreshComandaFinancialStatus(
          comandaId,
          opts.clinicId,
          comandaRow as Record<string, unknown>,
        );
      }
    } catch (e) {
      console.warn('[hub_finance] refreshComandaFinancialStatus after product return', e);
    }
  }

  return response;
}

export type HistoricalCashResult = {
  payment: Record<string, unknown>;
  receivable_status: string;
};

/**
 * Correção histórica em dinheiro: sem sessão de caixa; auditável; antivduplicidade.
 */
export async function postHistoricalCashPayment(opts: {
  receivableId: string;
  clinicId: string;
  amount: number;
  effectivePaymentDate: string;
  reason: string;
  userId: string;
  notes?: string | null;
  idempotencyKey?: string | null;
}): Promise<HistoricalCashResult> {
  const {
    receivableId,
    clinicId,
    amount,
    effectivePaymentDate,
    reason,
    userId,
    notes,
    idempotencyKey,
  } = opts;

  if (reason.trim().length < 3) {
    throw new FinanceLedgerError('Justificativa obrigatória (mín. 3 caracteres)', 400);
  }
  if (!(amount > 0)) {
    throw new FinanceLedgerError('Valor inválido', 400);
  }

  if (idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from('hub_payments')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) {
      const status = await recalculateReceivableFromPosted(receivableId);
      return { payment: existing as Record<string, unknown>, receivable_status: status };
    }
  }

  const { data: rec, error: rErr } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, clinic_id, unit_id, comanda_id, guardian_id, status, final_amount')
    .eq('id', receivableId)
    .maybeSingle();
  if (rErr || !rec || rec.clinic_id !== clinicId) {
    throw new FinanceLedgerError('Recebível não encontrado', 404);
  }
  if (rec.status === 'cancelled' || rec.status === 'refunded') {
    throw new FinanceLedgerError('Recebível não aceita pagamentos neste estado', 409);
  }

  const paid = await netPaidEffectiveForReceivable(receivableId);
  const finalAmt = Number(rec.final_amount ?? 0);
  const remaining = round2Ledger(finalAmt - paid);
  if (round2Ledger(amount) > remaining + 0.02) {
    throw new FinanceLedgerError(
      `Valor excede o saldo em aberto (${remaining.toFixed(2)})`,
      400,
    );
  }

  // Guardrail anti-duplicidade (mesmo receivable/amount/dia nos últimos 10 min)
  const day = effectivePaymentDate.slice(0, 10);
  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentDup } = await supabaseAdmin
    .from('hub_payments')
    .select('id')
    .eq('receivable_id', receivableId)
    .eq('posting_kind', 'historical_correction')
    .eq('amount', round2Ledger(amount))
    .eq('status', 'posted')
    .gte('created_at', windowStart)
    .limit(20);
  const dups = (recentDup ?? []).length;
  if (dups > 0 && !idempotencyKey) {
    // Verifica data efetiva no client-side dos candidatos
    const { data: candidates } = await supabaseAdmin
      .from('hub_payments')
      .select('id, payment_date, effective_payment_date')
      .eq('receivable_id', receivableId)
      .eq('posting_kind', 'historical_correction')
      .eq('amount', round2Ledger(amount))
      .eq('status', 'posted')
      .gte('created_at', windowStart);
    const hit = (candidates ?? []).some((p) => {
      const eff = String(p.effective_payment_date ?? p.payment_date ?? '').slice(0, 10);
      return eff === day;
    });
    if (hit) {
      throw new FinanceLedgerError(
        'Possível lançamento histórico duplicado. Informe idempotency_key ou aguarde.',
        409,
      );
    }
  }

  const payAt = effectivePaymentDate.includes('T')
    ? effectivePaymentDate
    : `${day}T12:00:00.000-03:00`;

  const { data: pay, error: pErr } = await supabaseAdmin
    .from('hub_payments')
    .insert({
      clinic_id: clinicId,
      receivable_id: receivableId,
      cash_session_id: null,
      amount: round2Ledger(amount),
      payment_method: 'cash',
      installments: 1,
      payment_date: payAt,
      effective_payment_date: payAt,
      notes: notes ?? null,
      created_by_user_id: userId,
      corrected_by_user_id: userId,
      status: 'posted',
      posting_kind: 'historical_correction',
      correction_reason: reason.trim(),
      idempotency_key: idempotencyKey ?? null,
    })
    .select('*')
    .single();

  if (pErr || !pay) {
    if (String(pErr?.message ?? '').includes('uniq_hub_payments_clinic_idempotency')) {
      const { data: again } = await supabaseAdmin
        .from('hub_payments')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('idempotency_key', idempotencyKey!)
        .maybeSingle();
      if (again) {
        const status = await recalculateReceivableFromPosted(receivableId);
        return { payment: again as Record<string, unknown>, receivable_status: status };
      }
    }
    throw new Error(pErr?.message || 'Erro ao registrar correção histórica');
  }

  const nextStatus = await recalculateReceivableFromPosted(receivableId);
  return { payment: pay as Record<string, unknown>, receivable_status: nextStatus };
}

/**
 * Fallback TS de insert (sem FOR UPDATE) só em testes / opt-in explícito.
 * Em preprod/produção a atomicidade exige RPC `hub_post_payment`.
 */
export function allowPostedPaymentTsFallback(): boolean {
  if (process.env.HUB_PAYMENT_TS_FALLBACK === '1') return true;
  if (process.env.HUB_PAYMENT_TS_FALLBACK === '0') return false;
  return process.env.NODE_ENV === 'test';
}

function isHubPostPaymentUnavailableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    !m.trim() ||
    m.includes('rpc_unavailable') ||
    m.includes('does not exist') ||
    m.includes('could not find the function') ||
    m.includes('schema cache') ||
    m.includes('pgrst202') ||
    m.includes('42883') || // undefined_function
    m.includes('is not a function') // cliente/mock sem .rpc
  );
}

function mapHubPostPaymentBusinessError(message: string): { error: string; status: number } | null {
  if (/excede o saldo/i.test(message)) return { error: message, status: 400 };
  if (/Valor inválido/i.test(message)) return { error: message, status: 400 };
  if (/não aceita pagamentos/i.test(message)) return { error: message, status: 409 };
  if (/Recebível não encontrado/i.test(message)) return { error: message, status: 404 };
  if (/idempotency_key já usada/i.test(message)) return { error: message, status: 409 };
  return null;
}

/**
 * Insert de pagamento posted via RPC atômica (`hub_post_payment`).
 * Idempotência: lookup prévio + unique index + tratamento na RPC.
 * Não recalcula o recebível — o caller deve chamar recalculateReceivableFromPosted.
 */
function paymentsPayloadCompatible(
  existing: Record<string, unknown>,
  opts: {
    receivableId: string;
    amount: number;
    paymentMethod: string;
    tenderedAmount?: number | null;
    changeAmount?: number | null;
  },
): boolean {
  if (String(existing.receivable_id) !== opts.receivableId) return false;
  if (String(existing.payment_method) !== opts.paymentMethod) return false;
  if (Math.abs(Number(existing.amount ?? 0) - round2Ledger(opts.amount)) > 0.02) return false;
  const exTend = existing.tendered_amount == null ? null : Number(existing.tendered_amount);
  const exChange = existing.change_amount == null ? null : Number(existing.change_amount);
  const wantTend = opts.tenderedAmount == null ? null : round2Ledger(opts.tenderedAmount);
  const wantChange = opts.changeAmount == null ? null : round2Ledger(opts.changeAmount);
  if (exTend == null && wantTend == null && exChange == null && wantChange == null) return true;
  if (exTend == null || wantTend == null || exChange == null || wantChange == null) return false;
  return Math.abs(exTend - wantTend) <= 0.02 && Math.abs(exChange - wantChange) <= 0.02;
}

export async function insertPostedPaymentWithIdempotency(opts: {
  clinicId: string;
  receivableId: string;
  cashSessionId: string | null;
  amount: number;
  paymentMethod: string;
  installments?: number;
  paymentDate: string;
  effectivePaymentDate?: string | null;
  notes?: string | null;
  createdByUserId: string | null;
  paymentTiming?: string | null;
  postingKind?: 'operational' | 'historical_correction';
  correctionReason?: string | null;
  correctedByUserId?: string | null;
  idempotencyKey?: string | null;
  tenderedAmount?: number | null;
  changeAmount?: number | null;
}): Promise<
  | { ok: true; payment: Record<string, unknown>; replayed: boolean }
  | { ok: false; error: string; status?: number; existing?: Record<string, unknown> }
> {
  const idempotencyKey = opts.idempotencyKey ?? null;
  const tenderedAmount =
    opts.paymentMethod === 'cash' && opts.tenderedAmount != null
      ? round2Ledger(opts.tenderedAmount)
      : null;
  const changeAmount =
    tenderedAmount != null
      ? round2Ledger(opts.changeAmount ?? Math.max(0, tenderedAmount - opts.amount))
      : null;

  if (idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from('hub_payments')
      .select('*')
      .eq('clinic_id', opts.clinicId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) {
      if (
        !paymentsPayloadCompatible(existing as Record<string, unknown>, {
          receivableId: opts.receivableId,
          amount: opts.amount,
          paymentMethod: opts.paymentMethod,
          tenderedAmount,
          changeAmount,
        })
      ) {
        return {
          ok: false,
          error: 'idempotency_key já usada com payload diferente',
          status: 409,
          existing: existing as Record<string, unknown>,
        };
      }
      return { ok: true, payment: existing as Record<string, unknown>, replayed: true };
    }
  }

  const installments =
    opts.paymentMethod === 'debit_card' ? 1 : Math.max(1, Math.min(99, opts.installments ?? 1));

  let cardFeeRate: number | null = null;
  let cardFeeAmount: number | null = null;
  let netAmount: number | null = null;
  if (opts.paymentMethod === 'credit_card' || opts.paymentMethod === 'debit_card') {
    try {
      const { getOrCreateHubClinicSettings } = await import('./hubClinicSettingsController.js');
      const { computeCardFeeSnapshot } = await import('./hubCardMachineFees.js');
      const settings = await getOrCreateHubClinicSettings(opts.clinicId);
      const snap = computeCardFeeSnapshot({
        fees: settings.card_machine_fees,
        paymentMethod: opts.paymentMethod,
        amount: opts.amount,
        installments,
      });
      if (snap) {
        cardFeeRate = snap.card_fee_rate_percent;
        cardFeeAmount = snap.card_fee_amount;
        netAmount = snap.net_amount;
      }
    } catch (e) {
      console.warn('[hub_finance] card fee snapshot skipped', e);
    }
  }

  const rpcPayload = {
    p_clinic_id: opts.clinicId,
    p_receivable_id: opts.receivableId,
    p_amount: round2Ledger(opts.amount),
    p_payment_method: opts.paymentMethod,
    p_created_by_user_id: opts.createdByUserId,
    p_cash_session_id: opts.cashSessionId,
    p_installments: installments,
    p_payment_date: opts.paymentDate,
    p_effective_payment_date: opts.effectivePaymentDate ?? opts.paymentDate,
    p_notes: opts.notes ?? null,
    p_idempotency_key: idempotencyKey,
    p_tendered_amount: tenderedAmount,
    p_change_amount: changeAmount,
    p_posting_kind: opts.postingKind ?? 'operational',
    p_payment_timing: opts.paymentTiming ?? 'on_checkout',
    p_correction_reason: opts.correctionReason ?? null,
    p_corrected_by_user_id: opts.correctedByUserId ?? null,
    p_card_fee_rate_percent: cardFeeRate,
    p_card_fee_amount: cardFeeAmount,
    p_net_amount: netAmount,
  };

  let rpcMsg = '';
  try {
    const rpcRes = await supabaseAdmin.rpc('hub_post_payment', rpcPayload);
    if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === 'object' && (rpcRes.data as { ok?: boolean }).ok) {
      const body = rpcRes.data as {
        payment: Record<string, unknown>;
        replayed?: boolean;
      };
      return {
        ok: true,
        payment: body.payment,
        replayed: Boolean(body.replayed),
      };
    }
    rpcMsg = String(rpcRes.error?.message ?? '');
    const business = mapHubPostPaymentBusinessError(rpcMsg);
    if (business) return { ok: false, ...business };
    if (!isHubPostPaymentUnavailableError(rpcMsg)) {
      return {
        ok: false,
        error: rpcMsg || 'Falha ao registrar pagamento via ledger atômico',
        status: 500,
      };
    }
  } catch (e: unknown) {
    rpcMsg = (e as Error)?.message || 'rpc_unavailable';
    const business = mapHubPostPaymentBusinessError(rpcMsg);
    if (business) return { ok: false, ...business };
    if (!isHubPostPaymentUnavailableError(rpcMsg) && !allowPostedPaymentTsFallback()) {
      return {
        ok: false,
        error: rpcMsg || 'Falha ao registrar pagamento via ledger atômico',
        status: 500,
      };
    }
  }

  // RPC ausente/indisponível: em ambientes reais falha controlada (sem insert paralelo).
  if (!allowPostedPaymentTsFallback()) {
    console.error('[hub_finance] hub_post_payment unavailable', rpcMsg);
    return {
      ok: false,
      error:
        'Ledger de pagamento indisponível (RPC hub_post_payment). Tente novamente em instantes; nenhum lançamento foi criado.',
      status: 503,
    };
  }

  // Somente testes / HUB_PAYMENT_TS_FALLBACK=1 — NÃO é atômico sob concorrência.
  const { data: recLock, error: recLockErr } = await supabaseAdmin
    .from('hub_receivables')
    .select('id, clinic_id, status, final_amount')
    .eq('id', opts.receivableId)
    .eq('clinic_id', opts.clinicId)
    .maybeSingle();
  if (recLockErr || !recLock) {
    return { ok: false, error: 'Recebível não encontrado', status: 404 };
  }
  if (recLock.status === 'cancelled' || recLock.status === 'refunded') {
    return { ok: false, error: 'Recebível não aceita pagamentos neste estado', status: 409 };
  }
  const paidNow = await netPaidEffectiveForReceivable(opts.receivableId);
  const remaining = round2Ledger(Number(recLock.final_amount ?? 0) - paidNow);
  if (round2Ledger(opts.amount) > remaining + 0.02) {
    return {
      ok: false,
      error: `Valor excede o saldo em aberto (${remaining.toFixed(2)})`,
      status: 400,
    };
  }

  const row: Record<string, unknown> = {
    clinic_id: opts.clinicId,
    receivable_id: opts.receivableId,
    cash_session_id: opts.cashSessionId,
    amount: round2Ledger(opts.amount),
    payment_method: opts.paymentMethod,
    installments,
    payment_date: opts.paymentDate,
    effective_payment_date: opts.effectivePaymentDate ?? opts.paymentDate,
    notes: opts.notes ?? null,
    created_by_user_id: opts.createdByUserId,
    status: 'posted',
    posting_kind: opts.postingKind ?? 'operational',
    idempotency_key: idempotencyKey,
    tendered_amount: tenderedAmount,
    change_amount: changeAmount,
    card_fee_rate_percent: cardFeeRate,
    card_fee_amount: cardFeeAmount,
    net_amount: netAmount,
    payment_timing: opts.paymentTiming ?? 'on_checkout',
  };
  if (opts.correctionReason) row.correction_reason = opts.correctionReason;
  if (opts.correctedByUserId) row.corrected_by_user_id = opts.correctedByUserId;

  const { data: pay, error: pErr } = await supabaseAdmin.from('hub_payments').insert(row).select('*').single();

  if (pErr || !pay) {
    if (idempotencyKey && String(pErr?.message ?? '').includes('uniq_hub_payments_clinic_idempotency')) {
      const { data: again } = await supabaseAdmin
        .from('hub_payments')
        .select('*')
        .eq('clinic_id', opts.clinicId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (again) {
        if (
          !paymentsPayloadCompatible(again as Record<string, unknown>, {
            receivableId: opts.receivableId,
            amount: opts.amount,
            paymentMethod: opts.paymentMethod,
            tenderedAmount,
            changeAmount,
          })
        ) {
          return {
            ok: false,
            error: 'idempotency_key já usada com payload diferente',
            status: 409,
            existing: again as Record<string, unknown>,
          };
        }
        return { ok: true, payment: again as Record<string, unknown>, replayed: true };
      }
    }
    return { ok: false, error: pErr?.message || 'Erro ao registrar pagamento' };
  }

  return { ok: true, payment: pay as Record<string, unknown>, replayed: false };
}

/** Reexport tipado para consumo de crédito no post operacional. */
export { consumeHubCustomerCredit, CustomerCreditError };
