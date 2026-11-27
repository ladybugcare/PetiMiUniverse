"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ymdSaoPaulo = ymdSaoPaulo;
exports.formatAutoCloseNotes = formatAutoCloseNotes;
exports.appendHandoffErrorsToNotes = appendHandoffErrorsToNotes;
exports.computeCashSessionExpectedBalance = computeCashSessionExpectedBalance;
exports.closeCashSession = closeCashSession;
exports.listOverdueOpenCashSessions = listOverdueOpenCashSessions;
exports.runAutoCloseOverdueJob = runAutoCloseOverdueJob;
exports.isCronClinicFilterAllowed = isCronClinicFilterAllowed;
exports.verifyCronSecret = verifyCronSecret;
exports.extractCronSecretFromRequest = extractCronSecretFromRequest;
/**
 * Fechamento de sessão de caixa (manual e automático overdue).
 * Close atômico via RPC hub_close_cash_session_atomic, com fallback TS para mocks.
 */
const node_crypto_1 = require("node:crypto");
const supabase_1 = require("../../config/supabase");
const hubComandasController_1 = require("./hubComandasController");
const SP_TZ = 'America/Sao_Paulo';
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
/** Dia civil em America/Sao_Paulo (YYYY-MM-DD). */
function ymdSaoPaulo(iso) {
    const d = iso instanceof Date ? iso : iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) {
        return new Date().toLocaleDateString('en-CA', { timeZone: SP_TZ });
    }
    return d.toLocaleDateString('en-CA', { timeZone: SP_TZ });
}
function formatAutoCloseNotes(closedAt = new Date()) {
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: SP_TZ,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(closedAt);
    const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
    const date = `${get('day')}/${get('month')}/${get('year')}`;
    const time = `${get('hour')}:${get('minute')}`;
    return `Fechado automaticamente em ${date} às ${time} BRT — sem contagem física.`;
}
const CLOSE_NOTES_MAX = 3900;
/** Anexa resumo de erros de handoff às notas de auto-close (auditoria). */
function appendHandoffErrorsToNotes(base, handoffErrors) {
    if (handoffErrors.length === 0)
        return base;
    const summary = `Handoff com pendências (${handoffErrors.length}): ${handoffErrors.join('; ')}`;
    const combined = `${base}\n${summary}`;
    if (combined.length <= CLOSE_NOTES_MAX)
        return combined;
    return `${combined.slice(0, CLOSE_NOTES_MAX - 1)}…`;
}
function resolveCloseNotes(opts) {
    if (opts.explicitNotes !== undefined) {
        if (opts.explicitNotes == null)
            return null;
        return appendHandoffErrorsToNotes(opts.explicitNotes, opts.autoClosed ? opts.handoffErrors : []);
    }
    if (!opts.autoClosed)
        return null;
    return appendHandoffErrorsToNotes(formatAutoCloseNotes(), opts.handoffErrors);
}
async function sumCreditCashInSession(clinicId, sessionId) {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_customer_credit_movements')
            .select('amount')
            .eq('clinic_id', clinicId)
            .eq('cash_session_id', sessionId)
            .eq('direction', 'in')
            .eq('payment_method', 'cash');
        if (error)
            return 0;
        return round2((data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0));
    }
    catch {
        return 0;
    }
}
async function computeCashSessionExpectedBalance(clinicId, sessionId, openingBalance) {
    const [{ data: cashPayments }, { data: cashMovements }] = await Promise.all([
        supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('amount')
            .eq('clinic_id', clinicId)
            .eq('cash_session_id', sessionId)
            .eq('payment_method', 'cash')
            .eq('status', 'posted')
            .eq('posting_kind', 'operational'),
        supabase_1.supabaseAdmin
            .from('hub_cash_movements')
            .select('amount, movement_type')
            .eq('clinic_id', clinicId)
            .eq('cash_session_id', sessionId),
    ]);
    const cashInBase = round2((cashPayments ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
    const creditCashIn = await sumCreditCashInSession(clinicId, sessionId);
    const cashIn = round2(cashInBase + creditCashIn);
    const deposits = round2((cashMovements ?? [])
        .filter((row) => row.movement_type === 'deposit')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
    const withdrawals = round2((cashMovements ?? [])
        .filter((row) => row.movement_type === 'withdrawal')
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0));
    return round2(openingBalance + cashIn + deposits - withdrawals);
}
async function closeCashSessionAtomicTs(opts) {
    const { data: sess, error: sErr } = await supabase_1.supabaseAdmin
        .from('hub_cash_sessions')
        .select('*')
        .eq('id', opts.sessionId)
        .eq('clinic_id', opts.clinicId)
        .maybeSingle();
    if (sErr || !sess)
        return { ok: false, reason: 'not_found' };
    if (sess.status !== 'open') {
        return { ok: false, reason: 'already_closed', cash_session: sess };
    }
    const expected = await computeCashSessionExpectedBalance(opts.clinicId, opts.sessionId, Number(sess.opening_balance ?? 0));
    const closing = opts.closingBalance == null ? expected : round2(opts.closingBalance);
    const diff = opts.closingBalance == null ? 0 : round2(closing - expected);
    const now = new Date().toISOString();
    const { data: updated, error: uErr } = await supabase_1.supabaseAdmin
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
    if (uErr)
        throw new Error(uErr.message);
    if (!updated) {
        const { data: again } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('*')
            .eq('id', opts.sessionId)
            .maybeSingle();
        return { ok: false, reason: 'already_closed', cash_session: again ?? undefined };
    }
    return { ok: true, reason: 'closed', cash_session: updated };
}
async function closeCashSessionAtomic(opts) {
    try {
        const rpcRes = await supabase_1.supabaseAdmin.rpc('hub_close_cash_session_atomic', {
            p_session_id: opts.sessionId,
            p_clinic_id: opts.clinicId,
            p_closing_balance: opts.closingBalance,
            p_auto_closed: opts.autoClosed,
            p_notes: opts.notes,
        });
        if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === 'object') {
            const body = rpcRes.data;
            if (typeof body.ok === 'boolean') {
                return {
                    ok: body.ok,
                    reason: body.reason ?? (body.ok ? 'closed' : 'already_closed'),
                    cash_session: body.cash_session,
                };
            }
        }
    }
    catch {
        // fallback TS
    }
    return closeCashSessionAtomicTs(opts);
}
/**
 * Handoff leave_pending + close atômico.
 * Manual e auto-close: handoff é best-effort (abortOnHandoffErrors=false por padrão no job).
 * abortOnHandoffErrors=true só para caminhos que precisam falhar duro.
 */
async function closeCashSession(opts) {
    const { data: sess, error: sErr } = await supabase_1.supabaseAdmin
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
    const autoHandoffErrors = [];
    if (!opts.skipHandoff) {
        const todayYmd = ymdSaoPaulo();
        try {
            const handoff = await (0, hubComandasController_1.leavePendingHandoffOpenComandasForUnit)(opts.clinicId, sess.unit_id, { dueDate: todayYmd, userId: opts.actorUserId ?? null });
            autoHandoffCount = handoff.handoff_count;
            autoHandoffErrors.push(...handoff.errors);
        }
        catch (handoffErr) {
            autoHandoffErrors.push(String(handoffErr?.message ?? 'handoff'));
        }
        if (opts.abortOnHandoffErrors && autoHandoffErrors.length > 0) {
            throw Object.assign(new Error(`Handoff falhou; caixa permanece aberto: ${autoHandoffErrors.join('; ')}`), { statusCode: 409, handoff_errors: autoHandoffErrors });
        }
    }
    const notes = resolveCloseNotes({
        explicitNotes: opts.notes,
        autoClosed: opts.autoClosed,
        handoffErrors: autoHandoffErrors,
    });
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
                cash_session: closed.cash_session,
                auto_handoff_count: autoHandoffCount,
                auto_handoff_errors: autoHandoffErrors,
                already_closed: true,
            };
        }
        throw Object.assign(new Error('Sessão não encontrada'), { statusCode: 404 });
    }
    return {
        cash_session: closed.cash_session,
        auto_handoff_count: autoHandoffCount,
        auto_handoff_errors: autoHandoffErrors,
    };
}
async function listOverdueOpenCashSessions(clinicId) {
    try {
        const rpcRes = await supabase_1.supabaseAdmin.rpc('hub_list_overdue_open_cash_sessions', {
            p_clinic_id: clinicId ?? null,
        });
        if (!rpcRes.error && Array.isArray(rpcRes.data)) {
            return rpcRes.data;
        }
    }
    catch {
        // fallback TS
    }
    let query = supabase_1.supabaseAdmin
        .from('hub_cash_sessions')
        .select('id, clinic_id, unit_id, opening_balance, opened_at, status')
        .eq('status', 'open')
        .order('opened_at', { ascending: true });
    if (clinicId)
        query = query.eq('clinic_id', clinicId);
    const { data, error } = await query;
    if (error)
        throw new Error(error.message);
    const today = ymdSaoPaulo();
    return (data ?? []).filter((row) => {
        const openedYmd = ymdSaoPaulo(row.opened_at ?? null);
        return openedYmd < today;
    });
}
async function runAutoCloseOverdueJob(opts) {
    const dryRun = Boolean(opts.dryRun);
    const candidates = await listOverdueOpenCashSessions(opts.clinicId ?? null);
    const sessions = [];
    const errors = [];
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
                // Gaveta fecha mesmo com handoff clínico falho; erros ficam em notes + auto_handoff_errors.
                abortOnHandoffErrors: false,
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
                ...(result.auto_handoff_errors.length > 0
                    ? { reason: `handoff_errors:${result.auto_handoff_errors.length}` }
                    : {}),
            });
        }
        catch (e) {
            skippedCount++;
            const msg = e?.message || 'erro';
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
function isCronClinicFilterAllowed(nodeEnv) {
    return nodeEnv !== 'production';
}
/** Compara segredo de cron sem timing leak óbvio; nunca logar o valor. */
function verifyCronSecret(provided, expected) {
    if (!provided || !expected)
        return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length)
        return false;
    try {
        return (0, node_crypto_1.timingSafeEqual)(a, b);
    }
    catch {
        return false;
    }
}
function extractCronSecretFromRequest(headers) {
    const rawAuth = headers.authorization;
    const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
    if (auth && /^Bearer\s+/i.test(auth)) {
        return auth.replace(/^Bearer\s+/i, '').trim() || null;
    }
    const rawX = headers['x-cron-secret'];
    const x = Array.isArray(rawX) ? rawX[0] : rawX;
    return x?.trim() || null;
}
