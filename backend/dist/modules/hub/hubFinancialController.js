"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubFinanceCashMovement = exports.postHubFinanceExpense = exports.listHubFinanceExpenses = exports.getHubFinanceCashFlow = exports.getHubFinanceDashboardSummary = exports.getHubFinancePendingBillingCount = exports.getHubFinanceUnbilledCompleted = exports.getHubFinanceCashSessionOpen = exports.postHubFinanceCashSessionClose = exports.postHubFinanceCashSessionOpen = exports.listHubFinanceReceivables = exports.postHubFinanceReceivablePayment = exports.postHubFinanceWaiveBilling = exports.postHubFinanceReceivable = exports.getHubFinancePreview = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const uuidStr = zod_1.z.string().uuid();
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
async function fetchActiveReceivableKeys(clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_receivables')
        .select('source_type, source_id')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    if (error)
        throw new Error(error.message);
    const set = new Set();
    for (const row of data ?? []) {
        set.add(`${row.source_type}:${row.source_id}`);
    }
    return set;
}
async function sumAppointmentServicesSale(appointmentId) {
    const { data: svcRows, error } = await supabase_1.supabaseAdmin
        .from('hub_appointment_services')
        .select('id, hub_service_type_id, order_index, sale_amount_applied, hub_service_types(name)')
        .eq('appointment_id', appointmentId)
        .order('order_index', { ascending: true });
    if (error)
        throw new Error(error.message);
    const lines = [];
    let subtotal = 0;
    let idx = 0;
    for (const row of svcRows ?? []) {
        const sale = Number(row.sale_amount_applied ?? 0);
        const st = row.hub_service_types;
        const name = Array.isArray(st) ? st[0]?.name : st?.name;
        const desc = name || 'Serviço';
        subtotal += sale;
        lines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'appointment_service',
            source_line_id: row.id,
            hub_service_type_id: row.hub_service_type_id ?? null,
            description: desc,
            quantity: 1,
            unit_sale_amount: sale,
            line_total: sale,
            sort_order: idx++,
        });
    }
    return { lines, subtotal: round2(subtotal) };
}
async function sumGroomingExtras(sessionId, clinicId) {
    const { data: rows, error } = await supabase_1.supabaseAdmin
        .from('hub_grooming_session_extras')
        .select('id, hub_service_type_id, name_snapshot, sale_amount_snapshot')
        .eq('hub_grooming_session_id', sessionId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null);
    if (error)
        throw new Error(error.message);
    const lines = [];
    let subtotal = 0;
    let idx = 1000;
    for (const row of rows ?? []) {
        const sale = Number(row.sale_amount_snapshot ?? 0);
        subtotal += sale;
        lines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'grooming_extra',
            source_line_id: row.id,
            hub_service_type_id: row.hub_service_type_id ?? null,
            description: String(row.name_snapshot || 'Adicional'),
            quantity: 1,
            unit_sale_amount: sale,
            line_total: sale,
            sort_order: idx++,
        });
    }
    return { lines, subtotal: round2(subtotal) };
}
async function buildPreviewForGroomingSession(clinicId, sessionId) {
    const { data: session, error } = await supabase_1.supabaseAdmin
        .from('hub_grooming_sessions')
        .select('id, clinic_id, unit_id, guardian_id, hub_appointment_id, grooming_stage, billing_waived_at')
        .eq('id', sessionId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!session || session.clinic_id !== clinicId) {
        throw new Error('NOT_FOUND');
    }
    const allLines = [];
    let subtotal = 0;
    const apptId = session.hub_appointment_id;
    if (apptId) {
        const ap = await sumAppointmentServicesSale(apptId);
        allLines.push(...ap.lines);
        subtotal += ap.subtotal;
    }
    const ex = await sumGroomingExtras(sessionId, clinicId);
    allLines.push(...ex.lines);
    subtotal += ex.subtotal;
    if (allLines.length === 0) {
        allLines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'manual',
            source_line_id: null,
            hub_service_type_id: null,
            description: 'Banho e Tosa (sem linhas de serviço)',
            quantity: 1,
            unit_sale_amount: 0,
            line_total: 0,
            sort_order: 0,
        });
    }
    return {
        lines: allLines,
        subtotal: round2(subtotal),
        unit_id: session.unit_id ?? null,
        guardian_id: session.guardian_id ?? null,
    };
}
async function buildPreviewForEncounter(clinicId, encounterId) {
    const { data: enc, error } = await supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select('id, clinic_id, unit_id, guardian_id, hub_appointment_id, status, billing_waived_at')
        .eq('id', encounterId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!enc || enc.clinic_id !== clinicId)
        throw new Error('NOT_FOUND');
    const apptId = enc.hub_appointment_id;
    const allLines = [];
    let subtotal = 0;
    if (apptId) {
        const ap = await sumAppointmentServicesSale(apptId);
        allLines.push(...ap.lines);
        subtotal += ap.subtotal;
    }
    if (allLines.length === 0) {
        allLines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'manual',
            source_line_id: null,
            hub_service_type_id: null,
            description: 'Consulta / atendimento clínico',
            quantity: 1,
            unit_sale_amount: 0,
            line_total: 0,
            sort_order: 0,
        });
    }
    return {
        lines: allLines,
        subtotal: round2(subtotal),
        unit_id: enc.unit_id ?? null,
        guardian_id: enc.guardian_id ?? null,
    };
}
async function buildPreviewForQuote(clinicId, quoteId) {
    const { data: quote, error: qErr } = await supabase_1.supabaseAdmin
        .from('hub_quotes')
        .select('id, clinic_id, unit_id, guardian_id, status, total_amount, billing_state, billing_waived_at')
        .eq('id', quoteId)
        .maybeSingle();
    if (qErr)
        throw new Error(qErr.message);
    if (!quote || quote.clinic_id !== clinicId)
        throw new Error('NOT_FOUND');
    const { data: qLines, error: lErr } = await supabase_1.supabaseAdmin
        .from('hub_quote_lines')
        .select('id, hub_service_type_id, description, quantity, unit_price, discount_amount, line_total, sort_order')
        .eq('quote_id', quoteId)
        .order('sort_order', { ascending: true });
    if (lErr)
        throw new Error(lErr.message);
    const lines = [];
    let subtotal = 0;
    let idx = 0;
    for (const row of qLines ?? []) {
        const lt = Number(row.line_total ?? 0);
        const qty = Number(row.quantity ?? 1);
        const unit = qty > 0 ? round2(lt / qty) : lt;
        subtotal += lt;
        lines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'quote_line',
            source_line_id: row.id,
            hub_service_type_id: row.hub_service_type_id ?? null,
            description: String(row.description || 'Linha de orçamento'),
            quantity: qty,
            unit_sale_amount: unit,
            line_total: lt,
            sort_order: idx++,
        });
    }
    if (lines.length === 0) {
        const total = Number(quote.total_amount ?? 0);
        lines.push({
            clinic_id: '',
            receivable_id: '',
            line_kind: 'manual',
            source_line_id: null,
            hub_service_type_id: null,
            description: 'Orçamento',
            quantity: 1,
            unit_sale_amount: total,
            line_total: total,
            sort_order: 0,
        });
        subtotal = total;
    }
    return {
        lines,
        subtotal: round2(subtotal),
        unit_id: quote.unit_id ?? null,
        guardian_id: quote.guardian_id ?? null,
    };
}
const previewQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    source_type: zod_1.z.enum(['grooming_session', 'encounter', 'quote']),
    source_id: uuidStr,
})
    .strict();
const getHubFinancePreview = async (req, res) => {
    try {
        const parsed = previewQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id, source_type e source_id (UUID) são obrigatórios' });
        }
        const { clinic_id, source_type, source_id } = parsed.data;
        let built;
        if (source_type === 'grooming_session') {
            built = await buildPreviewForGroomingSession(clinic_id, source_id);
        }
        else if (source_type === 'encounter') {
            built = await buildPreviewForEncounter(clinic_id, source_id);
        }
        else {
            built = await buildPreviewForQuote(clinic_id, source_id);
        }
        return res.json({
            preview: {
                source_type,
                source_id,
                estimated_amount: built.subtotal,
                unit_id: built.unit_id,
                guardian_id: built.guardian_id,
                lines: built.lines.map((l) => ({
                    line_kind: l.line_kind,
                    description: l.description,
                    quantity: l.quantity,
                    unit_sale_amount: l.unit_sale_amount,
                    line_total: l.line_total,
                })),
            },
        });
    }
    catch (e) {
        const msg = e?.message;
        if (msg === 'NOT_FOUND')
            return res.status(404).json({ error: 'Fonte não encontrada' });
        console.error('getHubFinancePreview', e);
        return res.status(500).json({ error: msg || 'Erro ao pré-visualizar' });
    }
};
exports.getHubFinancePreview = getHubFinancePreview;
const createReceivableBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    source_type: zod_1.z.enum(['grooming_session', 'encounter', 'quote']),
    source_id: uuidStr,
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
})
    .strict();
const postHubFinanceReceivable = async (req, res) => {
    try {
        const parsed = createReceivableBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, source_type, source_id, notes } = parsed.data;
        const keys = await fetchActiveReceivableKeys(clinic_id);
        if (keys.has(`${source_type}:${source_id}`)) {
            return res.status(409).json({ error: 'Já existe cobrança para esta origem' });
        }
        if (source_type === 'grooming_session') {
            const { data: s, error: sErr } = await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .select('id, clinic_id, grooming_stage, billing_waived_at')
                .eq('id', source_id)
                .maybeSingle();
            if (sErr || !s || s.clinic_id !== clinic_id)
                return res.status(404).json({ error: 'Sessão não encontrada' });
            if (s.grooming_stage !== 'closed') {
                return res.status(409).json({ error: 'Só é possível gerar cobrança com sessão encerrada (closed)' });
            }
            if (s.billing_waived_at)
                return res.status(409).json({ error: 'Sessão marcada sem cobrança' });
        }
        else if (source_type === 'encounter') {
            const { data: e, error: eErr } = await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .select('id, clinic_id, status, billing_waived_at')
                .eq('id', source_id)
                .maybeSingle();
            if (eErr || !e || e.clinic_id !== clinic_id)
                return res.status(404).json({ error: 'Atendimento não encontrado' });
            if (e.status !== 'completed') {
                return res.status(409).json({ error: 'Só é possível gerar cobrança com encounter concluído' });
            }
            if (e.billing_waived_at)
                return res.status(409).json({ error: 'Atendimento marcado sem cobrança' });
        }
        else {
            const { data: q, error: qErr } = await supabase_1.supabaseAdmin
                .from('hub_quotes')
                .select('id, clinic_id, status, billing_state, billing_waived_at')
                .eq('id', source_id)
                .maybeSingle();
            if (qErr || !q || q.clinic_id !== clinic_id)
                return res.status(404).json({ error: 'Orçamento não encontrado' });
            if (q.status !== 'accepted')
                return res.status(409).json({ error: 'Orçamento tem de estar aceite' });
            if (q.billing_state === 'receivable_created') {
                return res.status(409).json({ error: 'Orçamento já tem cobrança criada' });
            }
            if (q.billing_waived_at)
                return res.status(409).json({ error: 'Orçamento marcado sem cobrança' });
        }
        let built;
        if (source_type === 'grooming_session') {
            built = await buildPreviewForGroomingSession(clinic_id, source_id);
        }
        else if (source_type === 'encounter') {
            built = await buildPreviewForEncounter(clinic_id, source_id);
        }
        else {
            built = await buildPreviewForQuote(clinic_id, source_id);
        }
        const { data: rec, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .insert({
            clinic_id,
            unit_id: built.unit_id,
            guardian_id: built.guardian_id,
            source_type,
            source_id,
            original_amount: built.subtotal,
            final_amount: built.subtotal,
            status: 'pending',
            notes: notes ?? null,
        })
            .select('id')
            .single();
        if (rErr || !rec) {
            console.error('postHubFinanceReceivable insert', rErr);
            return res.status(500).json({ error: rErr?.message || 'Erro ao criar recebível' });
        }
        const receivableId = rec.id;
        const lineRows = built.lines.map((l, i) => ({
            clinic_id,
            receivable_id: receivableId,
            line_kind: l.line_kind,
            source_line_id: l.source_line_id,
            hub_service_type_id: l.hub_service_type_id,
            description: l.description,
            quantity: l.quantity,
            unit_sale_amount: l.unit_sale_amount,
            line_total: l.line_total,
            sort_order: l.sort_order ?? i,
        }));
        const { error: lnErr } = await supabase_1.supabaseAdmin.from('hub_receivable_lines').insert(lineRows);
        if (lnErr) {
            await supabase_1.supabaseAdmin.from('hub_receivables').delete().eq('id', receivableId);
            console.error('postHubFinanceReceivable lines', lnErr);
            return res.status(500).json({ error: lnErr.message });
        }
        if (source_type === 'quote') {
            await supabase_1.supabaseAdmin
                .from('hub_quotes')
                .update({ billing_state: 'receivable_created' })
                .eq('id', source_id)
                .eq('clinic_id', clinic_id);
        }
        const { data: full } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('*, lines:hub_receivable_lines(*)')
            .eq('id', receivableId)
            .single();
        return res.status(201).json({ receivable: full });
    }
    catch (e) {
        console.error('postHubFinanceReceivable', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceReceivable = postHubFinanceReceivable;
const waiveBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    source_type: zod_1.z.enum(['grooming_session', 'encounter', 'quote']),
    source_id: uuidStr,
    reason: zod_1.z.string().trim().min(3).max(2000),
})
    .strict();
const postHubFinanceWaiveBilling = async (req, res) => {
    try {
        const parsed = waiveBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, source_type, source_id, reason } = parsed.data;
        const keys = await fetchActiveReceivableKeys(clinic_id);
        if (keys.has(`${source_type}:${source_id}`)) {
            return res.status(409).json({ error: 'Já existe cobrança; não é possível fazer waive' });
        }
        const now = new Date().toISOString();
        if (source_type === 'grooming_session') {
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .update({ billing_waived_at: now, billing_waive_reason: reason })
                .eq('id', source_id)
                .eq('clinic_id', clinic_id);
            if (error)
                return res.status(500).json({ error: error.message });
        }
        else if (source_type === 'encounter') {
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .update({ billing_waived_at: now, billing_waive_reason: reason })
                .eq('id', source_id)
                .eq('clinic_id', clinic_id);
            if (error)
                return res.status(500).json({ error: error.message });
        }
        else {
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_quotes')
                .update({ billing_waived_at: now, billing_waive_reason: reason })
                .eq('id', source_id)
                .eq('clinic_id', clinic_id);
            if (error)
                return res.status(500).json({ error: error.message });
        }
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('postHubFinanceWaiveBilling', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceWaiveBilling = postHubFinanceWaiveBilling;
const paymentBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    amount: zod_1.z.number().positive(),
    payment_method: zod_1.z.enum(['pix', 'cash', 'credit_card', 'debit_card', 'transfer', 'payment_link']),
    installments: zod_1.z.number().int().min(1).max(99).optional(),
    payment_date: zod_1.z.string().datetime({ offset: true }).optional(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
    cash_session_id: uuidStr.optional().nullable(),
})
    .strict();
const postHubFinanceReceivablePayment = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = paymentBodySchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'receivable id ou body inválidos' });
        }
        const receivableId = idParsed.data;
        const { clinic_id, amount, payment_method, installments, payment_date, notes, cash_session_id } = parsed.data;
        const userId = req.user?.id ?? null;
        const { data: rec, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, clinic_id, status, final_amount')
            .eq('id', receivableId)
            .maybeSingle();
        if (rErr || !rec || rec.clinic_id !== clinic_id)
            return res.status(404).json({ error: 'Recebível não encontrado' });
        if (rec.status === 'cancelled' || rec.status === 'refunded') {
            return res.status(409).json({ error: 'Recebível não aceita pagamentos neste estado' });
        }
        const payAt = payment_date ?? new Date().toISOString();
        const { data: pay, error: pErr } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .insert({
            clinic_id,
            receivable_id: receivableId,
            cash_session_id: cash_session_id ?? null,
            amount: round2(amount),
            payment_method,
            installments: installments ?? 1,
            payment_date: payAt,
            notes: notes ?? null,
            created_by_user_id: userId,
        })
            .select('id')
            .single();
        if (pErr || !pay)
            return res.status(500).json({ error: pErr?.message || 'Erro ao registar pagamento' });
        const { data: sumRows } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('amount')
            .eq('receivable_id', receivableId);
        const paid = round2((sumRows ?? []).reduce((a, r) => a + Number(r.amount ?? 0), 0));
        const finalAmt = Number(rec.final_amount ?? 0);
        let nextStatus = 'partially_paid';
        if (paid >= finalAmt - 0.009)
            nextStatus = 'paid';
        await supabase_1.supabaseAdmin.from('hub_receivables').update({ status: nextStatus }).eq('id', receivableId);
        const { data: paymentRow } = await supabase_1.supabaseAdmin.from('hub_payments').select('*').eq('id', pay.id).single();
        return res.status(201).json({ payment: paymentRow, receivable_status: nextStatus });
    }
    catch (e) {
        console.error('postHubFinanceReceivablePayment', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceReceivablePayment = postHubFinanceReceivablePayment;
const listReceivablesQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
    status: zod_1.z.enum(['pending', 'partially_paid', 'paid', 'cancelled', 'refunded']).optional(),
})
    .strict();
const listHubFinanceReceivables = async (req, res) => {
    try {
        const parsed = listReceivablesQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
        }
        const { clinic_id, unit_id, status } = parsed.data;
        let q = supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('*, lines:hub_receivable_lines(*)')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(200);
        if (unit_id)
            q = q.eq('unit_id', unit_id);
        if (status)
            q = q.eq('status', status);
        const { data, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ receivables: data ?? [] });
    }
    catch (e) {
        console.error('listHubFinanceReceivables', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubFinanceReceivables = listHubFinanceReceivables;
const cashOpenSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    opening_balance: zod_1.z.number().min(0),
    opened_by_staff_id: uuidStr.optional().nullable(),
})
    .strict();
const postHubFinanceCashSessionOpen = async (req, res) => {
    try {
        const parsed = cashOpenSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, unit_id, opening_balance, opened_by_staff_id } = parsed.data;
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('id')
            .eq('unit_id', unit_id)
            .eq('status', 'open')
            .maybeSingle();
        if (existing)
            return res.status(409).json({ error: 'Já existe caixa aberto nesta unidade' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .insert({
            clinic_id,
            unit_id,
            opening_balance: round2(opening_balance),
            opened_by_staff_id: opened_by_staff_id ?? null,
            status: 'open',
        })
            .select('*')
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.status(201).json({ cash_session: data });
    }
    catch (e) {
        console.error('postHubFinanceCashSessionOpen', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceCashSessionOpen = postHubFinanceCashSessionOpen;
const cashCloseSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    closing_balance: zod_1.z.number().min(0),
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
})
    .strict();
const postHubFinanceCashSessionClose = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = cashCloseSchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        const { clinic_id, closing_balance, notes } = parsed.data;
        const { data: sess, error: sErr } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('id, clinic_id, unit_id, opening_balance, status')
            .eq('id', idParsed.data)
            .maybeSingle();
        if (sErr || !sess || sess.clinic_id !== clinic_id)
            return res.status(404).json({ error: 'Sessão não encontrada' });
        if (sess.status !== 'open')
            return res.status(409).json({ error: 'Caixa já fechado' });
        const openBal = Number(sess.opening_balance ?? 0);
        const expected = round2(openBal);
        const diff = round2(round2(closing_balance) - expected);
        const now = new Date().toISOString();
        const { data: updated, error: uErr } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .update({
            status: 'closed',
            closed_at: now,
            closing_balance: round2(closing_balance),
            expected_balance: expected,
            difference_amount: diff,
            notes: notes ?? null,
        })
            .eq('id', sess.id)
            .select('*')
            .single();
        if (uErr)
            return res.status(500).json({ error: uErr.message });
        return res.json({ cash_session: updated });
    }
    catch (e) {
        console.error('postHubFinanceCashSessionClose', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceCashSessionClose = postHubFinanceCashSessionClose;
const getHubFinanceCashSessionOpen = async (req, res) => {
    try {
        const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
        const unitParsed = uuidStr.safeParse(req.query.unit_id);
        if (!clinicParsed.success || !unitParsed.success) {
            return res.status(400).json({ error: 'clinic_id e unit_id são obrigatórios' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('*')
            .eq('clinic_id', clinicParsed.data)
            .eq('unit_id', unitParsed.data)
            .eq('status', 'open')
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ cash_session: data });
    }
    catch (e) {
        console.error('getHubFinanceCashSessionOpen', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceCashSessionOpen = getHubFinanceCashSessionOpen;
async function collectUnbilledItems(clinicId, unitId, keys) {
    const items = [];
    let gq = supabase_1.supabaseAdmin
        .from('hub_grooming_sessions')
        .select(`
      id, unit_id, closed_at, guardian_id, hub_staff_member_id, grooming_stage, billing_waived_at,
      pet:hub_pets(id, name),
      guardian:hub_guardians(id, full_name)
    `)
        .eq('clinic_id', clinicId)
        .eq('grooming_stage', 'closed')
        .is('deleted_at', null)
        .is('billing_waived_at', null)
        .order('closed_at', { ascending: false })
        .limit(200);
    if (unitId)
        gq = gq.eq('unit_id', unitId);
    const { data: groomRows, error: gErr } = await gq;
    if (gErr)
        throw new Error(gErr.message);
    for (const row of groomRows ?? []) {
        if (keys.has(`grooming_session:${row.id}`))
            continue;
        const pv = await buildPreviewForGroomingSession(clinicId, row.id);
        const pet = row.pet;
        const g = row.guardian;
        items.push({
            source_type: 'grooming_session',
            source_id: row.id,
            origin_label: 'Banho e Tosa',
            completed_at: row.closed_at ?? null,
            unit_id: row.unit_id ?? null,
            guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
            pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
            staff: null,
            estimated_amount: pv.subtotal,
            operational_status: String(row.grooming_stage),
        });
    }
    let eq = supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select(`
      id, unit_id, completed_at, guardian_id, hub_staff_member_id, status, billing_waived_at,
      pet:hub_pets(id, name),
      guardian:hub_guardians(id, full_name)
    `)
        .eq('clinic_id', clinicId)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .is('billing_waived_at', null)
        .order('completed_at', { ascending: false })
        .limit(200);
    if (unitId)
        eq = eq.eq('unit_id', unitId);
    const { data: encRows, error: eErr } = await eq;
    if (eErr)
        throw new Error(eErr.message);
    for (const row of encRows ?? []) {
        if (keys.has(`encounter:${row.id}`))
            continue;
        const pv = await buildPreviewForEncounter(clinicId, row.id);
        const pet = row.pet;
        const g = row.guardian;
        items.push({
            source_type: 'encounter',
            source_id: row.id,
            origin_label: 'Clínica',
            completed_at: row.completed_at ?? null,
            unit_id: row.unit_id ?? null,
            guardian: g ? (Array.isArray(g) ? g[0] : g) : null,
            pet: pet ? (Array.isArray(pet) ? pet[0] : pet) : null,
            staff: null,
            estimated_amount: pv.subtotal,
            operational_status: String(row.status),
        });
    }
    let qq = supabase_1.supabaseAdmin
        .from('hub_quotes')
        .select(`
      id, unit_id, status, converted_at, updated_at, billing_state, billing_waived_at, total_amount, guardian_id,
      prospect:hub_prospects(id, full_name),
      guardian:hub_guardians(id, full_name)
    `)
        .eq('clinic_id', clinicId)
        .eq('status', 'accepted')
        .is('billing_waived_at', null)
        .in('billing_state', ['awaiting_billing', 'none'])
        .order('converted_at', { ascending: false, nullsFirst: false })
        .limit(200);
    if (unitId)
        qq = qq.eq('unit_id', unitId);
    const { data: quoteRows, error: qErr } = await qq;
    if (qErr)
        throw new Error(qErr.message);
    for (const row of quoteRows ?? []) {
        if (keys.has(`quote:${row.id}`))
            continue;
        const pv = await buildPreviewForQuote(clinicId, row.id);
        const prospect = row.prospect;
        const prospectName = prospect
            ? Array.isArray(prospect)
                ? prospect[0]?.full_name
                : prospect.full_name
            : null;
        const gEmbed = row.guardian;
        const guardianResolved = row.guardian_id
            ? gEmbed
                ? Array.isArray(gEmbed)
                    ? gEmbed[0]
                    : gEmbed
                : { id: row.guardian_id, full_name: '—' }
            : prospectName
                ? { id: '', full_name: String(prospectName) }
                : null;
        items.push({
            source_type: 'quote',
            source_id: row.id,
            origin_label: 'Orçamento',
            completed_at: row.converted_at ?? row.updated_at ?? null,
            unit_id: row.unit_id ?? null,
            guardian: guardianResolved,
            pet: null,
            staff: null,
            estimated_amount: pv.subtotal,
            operational_status: String(row.billing_state ?? 'awaiting_billing'),
        });
    }
    items.sort((a, b) => {
        const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return tb - ta;
    });
    return items;
}
const unbilledQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional(),
})
    .strict();
const getHubFinanceUnbilledCompleted = async (req, res) => {
    try {
        const parsed = unbilledQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
        }
        const { clinic_id, unit_id } = parsed.data;
        const keys = await fetchActiveReceivableKeys(clinic_id);
        const items = await collectUnbilledItems(clinic_id, unit_id, keys);
        return res.json({ items, count: items.length });
    }
    catch (e) {
        console.error('getHubFinanceUnbilledCompleted', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceUnbilledCompleted = getHubFinanceUnbilledCompleted;
const getHubFinancePendingBillingCount = async (req, res) => {
    try {
        const parsed = unbilledQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id obrigatório (UUID)' });
        }
        const { clinic_id, unit_id } = parsed.data;
        const keys = await fetchActiveReceivableKeys(clinic_id);
        const items = await collectUnbilledItems(clinic_id, unit_id, keys);
        return res.json({ pending_billing_count: items.length });
    }
    catch (e) {
        console.error('getHubFinancePendingBillingCount', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinancePendingBillingCount = getHubFinancePendingBillingCount;
/** Início do dia UTC (YYYY-MM-DD) → ISO start */
function utcDayStartIso(dateYmd) {
    return `${dateYmd}T00:00:00.000Z`;
}
/** Fim do dia UTC */
function utcDayEndIso(dateYmd) {
    return `${dateYmd}T23:59:59.999Z`;
}
function addDaysYmd(ymd, delta) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + delta));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
function ymdTodayUtc() {
    const dt = new Date();
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
function parsePeriodQuery(q) {
    const clinic = uuidStr.safeParse(q.clinic_id);
    const unit = uuidStr.safeParse(q.unit_id);
    if (!clinic.success || !unit.success) {
        return { ok: false, error: 'clinic_id e unit_id são obrigatórios (UUID)' };
    }
    const fromRaw = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.from);
    const toRaw = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(q.to);
    if (fromRaw.success && toRaw.success) {
        if (fromRaw.data > toRaw.data)
            return { ok: false, error: 'from não pode ser maior que to' };
        return { ok: true, clinic_id: clinic.data, unit_id: unit.data, fromYmd: fromRaw.data, toYmd: toRaw.data };
    }
    const days = zod_1.z.coerce.number().int().min(1).max(366).safeParse(q.days);
    const n = days.success ? days.data : 30;
    const toYmd = ymdTodayUtc();
    const fromYmd = addDaysYmd(toYmd, -(n - 1));
    return { ok: true, clinic_id: clinic.data, unit_id: unit.data, fromYmd, toYmd };
}
const expenseCategorySchema = zod_1.z.enum([
    'supplies',
    'services',
    'utilities',
    'payroll',
    'rent',
    'marketing',
    'other',
]);
const expensePaymentMethodSchema = zod_1.z
    .enum(['pix', 'cash', 'credit_card', 'debit_card', 'transfer', 'payment_link', 'other'])
    .optional()
    .nullable();
const getHubFinanceDashboardSummary = async (req, res) => {
    try {
        const parsed = parsePeriodQuery(req.query);
        if (!parsed.ok)
            return res.status(400).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const fromIso = utcDayStartIso(fromYmd);
        const toIso = utcDayEndIso(toYmd);
        const keys = await fetchActiveReceivableKeys(clinic_id);
        const unbilled = await collectUnbilledItems(clinic_id, unit_id, keys);
        const { data: openRecs, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_receivables')
            .select('id, final_amount')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .is('deleted_at', null)
            .in('status', ['pending', 'partially_paid']);
        if (rErr)
            return res.status(500).json({ error: rErr.message });
        const recIds = (openRecs ?? []).map((r) => r.id);
        let receivables_outstanding = 0;
        if (recIds.length > 0) {
            const { data: payRows, error: pErr } = await supabase_1.supabaseAdmin
                .from('hub_payments')
                .select('receivable_id, amount')
                .in('receivable_id', recIds);
            if (pErr)
                return res.status(500).json({ error: pErr.message });
            const paidByRec = new Map();
            for (const row of payRows ?? []) {
                const id = row.receivable_id;
                paidByRec.set(id, round2((paidByRec.get(id) ?? 0) + Number(row.amount ?? 0)));
            }
            for (const r of openRecs ?? []) {
                const fin = Number(r.final_amount ?? 0);
                const paid = paidByRec.get(r.id) ?? 0;
                receivables_outstanding = round2(receivables_outstanding + round2(fin - paid));
            }
        }
        const { data: payPeriod, error: ppErr } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('amount, payment_date, receivable_id')
            .eq('clinic_id', clinic_id)
            .gte('payment_date', fromIso)
            .lte('payment_date', toIso);
        if (ppErr)
            return res.status(500).json({ error: ppErr.message });
        const recIdsPeriod = [...new Set((payPeriod ?? []).map((p) => p.receivable_id))];
        const unitByRec = new Map();
        if (recIdsPeriod.length > 0) {
            const { data: rrows, error: rrErr } = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, unit_id')
                .in('id', recIdsPeriod);
            if (rrErr)
                return res.status(500).json({ error: rrErr.message });
            for (const row of rrows ?? [])
                unitByRec.set(row.id, row.unit_id ?? null);
        }
        let payments_total_period = 0;
        for (const p of payPeriod ?? []) {
            if (unitByRec.get(p.receivable_id) === unit_id) {
                payments_total_period = round2(payments_total_period + Number(p.amount ?? 0));
            }
        }
        const { data: expRows, error: eErr } = await supabase_1.supabaseAdmin
            .from('hub_expenses')
            .select('amount')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .gte('expense_date', fromYmd)
            .lte('expense_date', toYmd);
        if (eErr) {
            if (String(eErr.message || '').includes('hub_expenses')) {
                return res.status(503).json({
                    error: 'Tabela hub_expenses não encontrada. Aplique a migração create_hub_expenses.sql.',
                });
            }
            return res.status(500).json({ error: eErr.message });
        }
        const expenses_total_period = round2((expRows ?? []).reduce((a, row) => a + Number(row.amount ?? 0), 0));
        return res.json({
            period: { from: fromYmd, to: toYmd },
            pending_billing_count: unbilled.length,
            receivables_open_count: openRecs?.length ?? 0,
            receivables_outstanding,
            payments_total_period,
            expenses_total_period,
            net_operational_period: round2(payments_total_period - expenses_total_period),
        });
    }
    catch (e) {
        console.error('getHubFinanceDashboardSummary', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceDashboardSummary = getHubFinanceDashboardSummary;
const getHubFinanceCashFlow = async (req, res) => {
    try {
        const parsed = parsePeriodQuery(req.query);
        if (!parsed.ok)
            return res.status(400).json({ error: parsed.error });
        const { clinic_id, unit_id, fromYmd, toYmd } = parsed;
        const fromIso = utcDayStartIso(fromYmd);
        const toIso = utcDayEndIso(toYmd);
        const { data: sessions, error: sErr } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('id')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id);
        if (sErr)
            return res.status(500).json({ error: sErr.message });
        const sessionIds = (sessions ?? []).map((s) => s.id);
        const { data: payPeriod, error: ppErr } = await supabase_1.supabaseAdmin
            .from('hub_payments')
            .select('amount, payment_date, receivable_id')
            .eq('clinic_id', clinic_id)
            .gte('payment_date', fromIso)
            .lte('payment_date', toIso);
        if (ppErr)
            return res.status(500).json({ error: ppErr.message });
        const recIdsPeriod = [...new Set((payPeriod ?? []).map((p) => p.receivable_id))];
        const unitByRec = new Map();
        if (recIdsPeriod.length > 0) {
            const { data: rrows, error: rrErr } = await supabase_1.supabaseAdmin
                .from('hub_receivables')
                .select('id, unit_id')
                .in('id', recIdsPeriod);
            if (rrErr)
                return res.status(500).json({ error: rrErr.message });
            for (const row of rrows ?? [])
                unitByRec.set(row.id, row.unit_id ?? null);
        }
        let expRows = [];
        const { data: ex, error: eErr } = await supabase_1.supabaseAdmin
            .from('hub_expenses')
            .select('amount, expense_date')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .gte('expense_date', fromYmd)
            .lte('expense_date', toYmd);
        if (eErr) {
            if (String(eErr.message || '').includes('hub_expenses')) {
                return res.status(503).json({
                    error: 'Tabela hub_expenses não encontrada. Aplique a migração create_hub_expenses.sql.',
                });
            }
            return res.status(500).json({ error: eErr.message });
        }
        expRows = (ex ?? []);
        let movRows = [];
        if (sessionIds.length > 0) {
            const { data: mv, error: mErr } = await supabase_1.supabaseAdmin
                .from('hub_cash_movements')
                .select('amount, movement_type, created_at')
                .in('cash_session_id', sessionIds)
                .gte('created_at', fromIso)
                .lte('created_at', toIso);
            if (mErr)
                return res.status(500).json({ error: mErr.message });
            movRows = (mv ?? []);
        }
        const dayKeys = [];
        for (let d = fromYmd; d <= toYmd; d = addDaysYmd(d, 1)) {
            dayKeys.push(d);
            if (d === toYmd)
                break;
        }
        const payByDay = new Map();
        for (const p of payPeriod ?? []) {
            if (unitByRec.get(p.receivable_id) !== unit_id)
                continue;
            const key = p.payment_date.slice(0, 10);
            payByDay.set(key, round2((payByDay.get(key) ?? 0) + Number(p.amount ?? 0)));
        }
        const expByDay = new Map();
        for (const row of expRows) {
            const key = row.expense_date.slice(0, 10);
            expByDay.set(key, round2((expByDay.get(key) ?? 0) + Number(row.amount ?? 0)));
        }
        const witByDay = new Map();
        const depByDay = new Map();
        for (const row of movRows) {
            const key = row.created_at.slice(0, 10);
            const amt = Number(row.amount ?? 0);
            if (row.movement_type === 'withdrawal') {
                witByDay.set(key, round2((witByDay.get(key) ?? 0) + amt));
            }
            else if (row.movement_type === 'deposit') {
                depByDay.set(key, round2((depByDay.get(key) ?? 0) + amt));
            }
        }
        const days = dayKeys.map((date) => {
            const payments_in = payByDay.get(date) ?? 0;
            const expenses_out = expByDay.get(date) ?? 0;
            const withdrawals_out = witByDay.get(date) ?? 0;
            const deposits_in = depByDay.get(date) ?? 0;
            const net = round2(payments_in + deposits_in - expenses_out - withdrawals_out);
            return { date, payments_in, expenses_out, withdrawals_out, deposits_in, net };
        });
        return res.json({ period: { from: fromYmd, to: toYmd }, days });
    }
    catch (e) {
        console.error('getHubFinanceCashFlow', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.getHubFinanceCashFlow = getHubFinanceCashFlow;
const listExpensesQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})
    .strict();
const listHubFinanceExpenses = async (req, res) => {
    try {
        const parsed = listExpensesQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id e unit_id obrigatórios' });
        }
        const { clinic_id, unit_id, from, to } = parsed.data;
        let q = supabase_1.supabaseAdmin
            .from('hub_expenses')
            .select('*')
            .eq('clinic_id', clinic_id)
            .eq('unit_id', unit_id)
            .order('expense_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(500);
        if (from)
            q = q.gte('expense_date', from);
        if (to)
            q = q.lte('expense_date', to);
        const { data, error } = await q;
        if (error) {
            if (String(error.message || '').includes('hub_expenses')) {
                return res.status(503).json({
                    error: 'Tabela hub_expenses não encontrada. Aplique a migração create_hub_expenses.sql.',
                });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.json({ expenses: data ?? [] });
    }
    catch (e) {
        console.error('listHubFinanceExpenses', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubFinanceExpenses = listHubFinanceExpenses;
const postExpenseBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr,
    amount: zod_1.z.number().positive(),
    category: expenseCategorySchema,
    description: zod_1.z.string().trim().min(1).max(2000),
    expense_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    payment_method: expensePaymentMethodSchema,
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
})
    .strict();
const postHubFinanceExpense = async (req, res) => {
    try {
        const parsed = postExpenseBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, unit_id, amount, category, description, expense_date, payment_method, notes } = parsed.data;
        const userId = req.user?.id ?? null;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_expenses')
            .insert({
            clinic_id,
            unit_id,
            amount: round2(amount),
            category,
            description,
            expense_date: expense_date ?? ymdTodayUtc(),
            payment_method: payment_method ?? null,
            notes: notes ?? null,
            created_by_user_id: userId,
        })
            .select('*')
            .single();
        if (error) {
            if (String(error.message || '').includes('hub_expenses')) {
                return res.status(503).json({
                    error: 'Tabela hub_expenses não encontrada. Aplique a migração create_hub_expenses.sql.',
                });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.status(201).json({ expense: data });
    }
    catch (e) {
        console.error('postHubFinanceExpense', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceExpense = postHubFinanceExpense;
const postCashMovementBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    movement_type: zod_1.z.enum(['withdrawal', 'deposit']),
    amount: zod_1.z.number().positive(),
    notes: zod_1.z.string().trim().max(2000).optional().nullable(),
})
    .strict();
const postHubFinanceCashMovement = async (req, res) => {
    try {
        const idParsed = uuidStr.safeParse(req.params.id);
        const parsed = postCashMovementBodySchema.safeParse(req.body);
        if (!idParsed.success || !parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        const sessionId = idParsed.data;
        const { clinic_id, movement_type, amount, notes } = parsed.data;
        const userId = req.user?.id ?? null;
        const { data: sess, error: sErr } = await supabase_1.supabaseAdmin
            .from('hub_cash_sessions')
            .select('id, clinic_id, status')
            .eq('id', sessionId)
            .maybeSingle();
        if (sErr || !sess || sess.clinic_id !== clinic_id)
            return res.status(404).json({ error: 'Sessão não encontrada' });
        if (sess.status !== 'open')
            return res.status(409).json({ error: 'Só é possível movimentar caixa aberto' });
        const { data: row, error: iErr } = await supabase_1.supabaseAdmin
            .from('hub_cash_movements')
            .insert({
            clinic_id,
            cash_session_id: sessionId,
            movement_type,
            amount: round2(amount),
            notes: notes ?? null,
            created_by_user_id: userId,
        })
            .select('*')
            .single();
        if (iErr)
            return res.status(500).json({ error: iErr.message });
        return res.status(201).json({ movement: row });
    }
    catch (e) {
        console.error('postHubFinanceCashMovement', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.postHubFinanceCashMovement = postHubFinanceCashMovement;
