/**
 * Fechamento de sessão de caixa (manual e automático overdue).
 * Close atômico via RPC hub_close_cash_session_atomic, com fallback TS para mocks.
 */
import { timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '../../config/supabase';
import { leavePendingHandoffOpenComandasForUnit } from './hubComandasController';

const SP_TZ = 'America/Sao_Paulo';

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Dia civil em America/Sao_Paulo (YYYY-MM-DD). */
export function ymdSaoPaulo(iso?: string | Date | null): string {
  const d = iso instanceof Date ? iso : iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString('en-CA', { timeZone: SP_TZ });
  }
  return d.toLocaleDateString('en-CA', { timeZone: SP_TZ });
}

export function formatAutoCloseNotes(closedAt: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: SP_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(closedAt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('day')}/${get('month')}/${get('year')}`;
  const time = `${get('hour')}:${get('minute')}`;
  return `Fechado automaticamente em ${date} às ${time} BRT — sem contagem física.`;
}

export type CashSessionRow = {
  id: string;
  clinic_id: string;
  unit_id: string;
  opening_balance?: number | null;
  status: string;
  opened_at?: string | null;
  notes?: string | null;
  auto_closed?: boolean | null;
  closing_balance?: number | null;
  expected_balance?: number | null;
  difference_amount?: number | null;
  closed_at?: string | null;
};

export type CloseCashSessionResult = {
  cash_session: CashSessionRow;
  auto_handoff_count: number;
  auto_handoff_errors: string[];
  already_closed?: boolean;
};

async function sumCreditCashInSession(clinicId: string, sessionId: string): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from('hub_customer_credit_movements')
      .select('amount')
      .eq('clinic_id', clinicId)
      .eq('cash_session_id', sessionId)
      .eq('direction', 'in')
      .eq('payment_method', 'cash');
    if (error) return 0;
    return round2((data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0));
  } catch {
    return 0;
  }
}

export async function computeCashSessionExpectedBalance(
  clinicId: string,
  sessionId: string,
  openingBalance: number,
): Promise<number> {
  const [{ data: cashPayments }, { data: cashMovements }] = await Promise.all([
    supabaseAdmin
      .from('hub_payments')
      .select('amount')
      .eq('clinic_id', clinicId)
      .eq('cash_session_id', sessionId)
      .eq('payment_method', 'cash')
      .eq('status', 'posted')
      .eq('posting_kind', 'operational'),
    supabaseAdmin
      .from('hub_cash_movements')
      .select('amount, movement_type')
      .eq('clinic_id', clinicId)
      .eq('cash_session_id', sessionId),
  ]);
  const cashInBase = round2((cashPayments ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
  const creditCashIn = await sumCreditCashInSession(clinicId, sessionId);
  const cashIn = round2(cashInBase + creditCashIn);
  const deposits = round2(
    (cashMovements ?? [])
      .filter((row) => row.movement_type === 'deposit')
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  );
  const withdrawals = round2(
    (cashMovements ?? [])
      .filter((row) => row.movement_type === 'withdrawal')
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  );
  return round2(openingBalance + cashIn + deposits - withdrawals);
}

async function closeCashSessionAtomicTs(opts: {
  sessionId: string;
  clinicId: string;
  closingBalance: number | null;
  autoClosed: boolean;
  notes: string | null;
}): Promise<{ ok: boolean; reason: string; cash_session?: CashSessionRow }> {
  const { data: sess, error: sErr } = await supabaseAdmin
    .from('hub_cash_sessions')
    .select('*')
    .eq('id', opts.sessionId)
    .eq('clinic_id', opts.clinicId)
    .maybeSingle();
  if (sErr || !sess) return { ok: false, reason: 'not_found' };
  if (sess.status !== 'open') {
    return { ok: false, reason: 'already_closed', cash_session: sess as CashSessionRow };
  }

  const expected = await computeCashSessionExpectedBalance(
    opts.clinicId,
    opts.sessionId,
    Number(sess.opening_balance ?? 0),
  );
  const closing = opts.closingBalance == null ? expected : round2(opts.closingBalance);
  const diff = opts.closingBalance == null ? 0 : round2(closing - expected);
  const now = new Date().toISOString();

  const { data: updated, error: uErr } = await supabaseAdmin
    .from('hub_cash_sessions')
    .update({
      status: 'closed',
      closed_at: now,
      closing_balance: closing,
      expected_balance: expected,
      difference_amount: diff,
      auto_closed: opts.autoClosed,
      notes: opts.notes,
    })
    .eq('id', opts.sessionId)
    .eq('status', 'open')
    .select('*')
    .maybeSingle();

  if (uErr) throw new Error(uErr.message);
  if (!updated) {
    const { data: again } = await supabaseAdmin
      .from('hub_cash_sessions')
      .select('*')
      .eq('id', opts.sessionId)
      .maybeSingle();
    return { ok: false, reason: 'already_closed', cash_session: (again as CashSessionRow) ?? undefined };
  }
  return { ok: true, reason: 'closed', cash_session: updated as CashSessionRow };
}

async function closeCashSessionAtomic(opts: {
  sessionId: string;
  clinicId: string;
  closingBalance: number | null;
  autoClosed: boolean;
  notes: string | null;
}): Promise<{ ok: boolean; reason: string; cash_session?: CashSessionRow }> {
  try {
    const rpcRes = await supabaseAdmin.rpc('hub_close_cash_session_atomic', {
      p_session_id: opts.sessionId,
      p_clinic_id: opts.clinicId,
      p_closing_balance: opts.closingBalance,
      p_auto_closed: opts.autoClosed,
      p_notes: opts.notes,
    });
    if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === 'object') {
      const body = rpcRes.data as {
        ok?: boolean;
        reason?: string;
        cash_session?: CashSessionRow;
      };
      if (typeof body.ok === 'boolean') {
        return {
          ok: body.ok,
          reason: body.reason ?? (body.ok ? 'closed' : 'already_closed'),
          cash_session: body.cash_session,
        };
      }
    }
  } catch {
    // fallback TS
  }
  return closeCashSessionAtomicTs(opts);
}

export type CloseCashSessionOpts = {
  sessionId: string;
  clinicId: string;
  /** null = usar expected (modo auto) */
  closingBalance: number | null;
  autoClosed: boolean;
  notes?: string | null;
  actorUserId?: string | null;
  /** Se true e houver erros não-skippáveis de handoff, não fecha. */
  abortOnHandoffErrors?: boolean;
  /** Pula handoff (apenas testes internos / dry paths). */
  skipHandoff?: boolean;
};

/**
 * Handoff leave_pending + close atômico.
 * Manual: abortOnHandoffErrors=false (comportamento legado).
 * Auto: abortOnHandoffErrors=true.
 */
export async function closeCashSession(opts: CloseCashSessionOpts): Promise<CloseCashSessionResult> {
  const { data: sess, error: sErr } = await supabaseAdmin
    .from('hub_cash_sessions')
    .select('id, clinic_id, unit_id, opening_balance, status, opened_at')
    .eq('id', opts.sessionId)
    .eq('clinic_id', opts.clinicId)
    .maybeSingle();
  if (sErr || !sess) {
    throw Object.assign(new Error('Sessão não encontrada'), { statusCode: 404 });
  }
  if (sess.status !== 'open') {
    throw Object.assign(new Error('Caixa já fechado'), { statusCode: 409 });
  }

  let autoHandoffCount = 0;
  const autoHandoffErrors: string[] = [];

  if (!opts.skipHandoff) {
    const todayYmd = ymdSaoPaulo();
    try {
      const handoff = await leavePendingHandoffOpenComandasForUnit(
        opts.clinicId,
        sess.unit_id as string,
        { dueDate: todayYmd, userId: opts.actorUserId ?? null },
      );
      autoHandoffCount = handoff.handoff_count;
      autoHandoffErrors.push(...handoff.errors);
    } catch (handoffErr) {
      autoHandoffErrors.push(String((handoffErr as Error)?.message ?? 'handoff'));
    }

    if (opts.abortOnHandoffErrors && autoHandoffErrors.length > 0) {
      throw Object.assign(
        new Error(`Handoff falhou; caixa permanece aberto: ${autoHandoffErrors.join('; ')}`),
        { statusCode: 409, handoff_errors: autoHandoffErrors },
      );
    }
  }

  const notes =
    opts.notes !== undefined
      ? opts.notes
      : opts.autoClosed
        ? formatAutoCloseNotes()
        : null;

  const closed = await closeCashSessionAtomic({
    sessionId: opts.sessionId,
    clinicId: opts.clinicId,
    closingBalance: opts.closingBalance,
    autoClosed: opts.autoClosed,
    notes,
  });

  if (!closed.ok) {
    if (closed.reason === 'already_closed') {
      return {
        cash_session: closed.cash_session as CashSessionRow,
        auto_handoff_count: autoHandoffCount,
        auto_handoff_errors: autoHandoffErrors,
        already_closed: true,
      };
    }
    throw Object.assign(new Error('Sessão não encontrada'), { statusCode: 404 });
  }

  return {
    cash_session: closed.cash_session as CashSessionRow,
    auto_handoff_count: autoHandoffCount,
    auto_handoff_errors: autoHandoffErrors,
  };
}

export async function listOverdueOpenCashSessions(clinicId?: string | null): Promise<CashSessionRow[]> {
  try {
    const rpcRes = await supabaseAdmin.rpc('hub_list_overdue_open_cash_sessions', {
      p_clinic_id: clinicId ?? null,
    });
    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      return rpcRes.data as CashSessionRow[];
    }
  } catch {
    // fallback TS
  }

  let query = supabaseAdmin
    .from('hub_cash_sessions')
    .select('id, clinic_id, unit_id, opening_balance, opened_at, status')
    .eq('status', 'open')
    .order('opened_at', { ascending: true });
  if (clinicId) query = query.eq('clinic_id', clinicId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const today = ymdSaoPaulo();
  return ((data ?? []) as CashSessionRow[]).filter((row) => {
    const openedYmd = ymdSaoPaulo(row.opened_at ?? null);
    return openedYmd < today;
  });
}

export type AutoCloseOverdueResult = {
  dry_run: boolean;
  closed_count: number;
  skipped_count: number;
  candidate_count: number;
  sessions: Array<{
    id: string;
    clinic_id: string;
    unit_id: string;
    opened_at?: string | null;
    status: 'closed' | 'would_close' | 'skipped' | 'error';
    reason?: string;
    auto_handoff_count?: number;
  }>;
  errors: string[];
};

export async function runAutoCloseOverdueJob(opts: {
  dryRun?: boolean;
  clinicId?: string | null;
}): Promise<AutoCloseOverdueResult> {
  const dryRun = Boolean(opts.dryRun);
  const candidates = await listOverdueOpenCashSessions(opts.clinicId ?? null);
  const sessions: AutoCloseOverdueResult['sessions'] = [];
  const errors: string[] = [];
  let closedCount = 0;
  let skippedCount = 0;

  for (const cand of candidates) {
    if (dryRun) {
      sessions.push({
        id: cand.id,
        clinic_id: cand.clinic_id,
        unit_id: cand.unit_id,
        opened_at: cand.opened_at,
        status: 'would_close',
      });
      continue;
    }

    try {
      const result = await closeCashSession({
        sessionId: cand.id,
        clinicId: cand.clinic_id,
        closingBalance: null,
        autoClosed: true,
        abortOnHandoffErrors: true,
      });
      if (result.already_closed) {
        skippedCount++;
        sessions.push({
          id: cand.id,
          clinic_id: cand.clinic_id,
          unit_id: cand.unit_id,
          opened_at: cand.opened_at,
          status: 'skipped',
          reason: 'already_closed',
          auto_handoff_count: result.auto_handoff_count,
        });
        continue;
      }
      closedCount++;
      sessions.push({
        id: cand.id,
        clinic_id: cand.clinic_id,
        unit_id: cand.unit_id,
        opened_at: cand.opened_at,
        status: 'closed',
        auto_handoff_count: result.auto_handoff_count,
      });
    } catch (e: unknown) {
      skippedCount++;
      const msg = (e as Error)?.message || 'erro';
      errors.push(`${cand.id.slice(0, 8)}: ${msg}`);
      sessions.push({
        id: cand.id,
        clinic_id: cand.clinic_id,
        unit_id: cand.unit_id,
        opened_at: cand.opened_at,
        status: 'error',
        reason: msg,
      });
    }
  }

  return {
    dry_run: dryRun,
    closed_count: dryRun ? 0 : closedCount,
    skipped_count: dryRun ? 0 : skippedCount,
    candidate_count: candidates.length,
    sessions,
    errors,
  };
}

/** Em production o job é sempre global; clinic_id só em staging/dev/test. */
export function isCronClinicFilterAllowed(nodeEnv: string | undefined | null): boolean {
  return nodeEnv !== 'production';
}

/** Compara segredo de cron sem timing leak óbvio; nunca logar o valor. */
export function verifyCronSecret(provided: string | undefined | null, expected: string | undefined | null): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function extractCronSecretFromRequest(headers: {
  authorization?: string | string[] | undefined;
  'x-cron-secret'?: string | string[] | undefined;
}): string | null {
  const rawAuth = headers.authorization;
  const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim() || null;
  }
  const rawX = headers['x-cron-secret'];
  const x = Array.isArray(rawX) ? rawX[0] : rawX;
  return x?.trim() || null;
}
