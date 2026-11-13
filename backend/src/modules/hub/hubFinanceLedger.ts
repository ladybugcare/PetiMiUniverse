/**
 * Ledger financeiro compartilhado (Caixa + Financeiro).
 * Fonte única: hub_receivables + hub_payments (status posted|reversed).
 * Nunca DELETE de pagamento em estorno/reembolso.
 */
import { supabaseAdmin } from '../../config/supabase';
import { syncHubAppointmentPaidFromReceivable } from './appointmentPaidFromBilling';
import {
  consumeHubCustomerCredit,
  CustomerCreditError,
  restoreCustomerCreditIfNeeded,
  restoreHubCustomerCredit,
} from './hubCustomerCredit';
import { syncChargeBundleStatusForReceivable } from './hubChargeBundlesService';
import { syncPackageBalancesForReceivable } from './hubPackagesService';

export type PaymentReversalMode = 'payment_reversal' | 'refund';

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

  const paid = await sumPostedPaymentsForReceivable(receivableId);
  const finalAmount = Number(rec.final_amount ?? 0);
  const nextStatus =
    paid <= 0.009 ? 'pending' : paid >= finalAmount - 0.009 ? 'paid' : 'partially_paid';
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

export type ReversePaymentResult = {
  ok: true;
  receivable_status: string;
  receivable_id: string;
  adjustment_id: string;
  reversal_mode: PaymentReversalMode;
  warning: string | null;
};

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

  // Pré-checagem: se o estorno tirar o recebível de `paid`, saldos ainda active com restante
  // exigem cancel comercial antes (não bloqueia por redemption — cancel ≠ reverse).
  {
    const receivableIdPre = payment.receivable_id as string;
    const { data: recPre } = await supabaseAdmin
      .from('hub_receivables')
      .select('final_amount, status')
      .eq('id', receivableIdPre)
      .maybeSingle();
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
    const { data: rec } = await supabaseAdmin
      .from('hub_receivables')
      .select('guardian_id, comanda_id')
      .eq('id', receivableId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    const guardianId = (rec?.guardian_id as string | null) ?? null;
    if (!guardianId) {
      throw new FinanceLedgerError('Recebível sem tutor — não é possível reembolsar em crédito.', 409);
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

  return {
    ok: true,
    receivable_status: receivableStatus,
    receivable_id: receivableId,
    adjustment_id: adjustmentId,
    reversal_mode: mode,
    warning,
  };
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

  const paid = await sumPostedPaymentsForReceivable(receivableId);
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
 * Insert de pagamento posted com idempotência (lookup → insert → race no unique).
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

  const row: Record<string, unknown> = {
    clinic_id: opts.clinicId,
    receivable_id: opts.receivableId,
    cash_session_id: opts.cashSessionId,
    amount: round2Ledger(opts.amount),
    payment_method: opts.paymentMethod,
    installments: opts.installments ?? 1,
    payment_date: opts.paymentDate,
    effective_payment_date: opts.effectivePaymentDate ?? opts.paymentDate,
    notes: opts.notes ?? null,
    created_by_user_id: opts.createdByUserId,
    status: 'posted',
    posting_kind: opts.postingKind ?? 'operational',
    idempotency_key: idempotencyKey,
    tendered_amount: tenderedAmount,
    change_amount: changeAmount,
  };
  if (opts.paymentTiming) row.payment_timing = opts.paymentTiming;
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
