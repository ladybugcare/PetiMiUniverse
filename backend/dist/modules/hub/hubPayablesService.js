"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYABLE_SCHEDULE_AMOUNT_MODES = exports.PAYABLE_SCHEDULE_FREQUENCIES = exports.PAYABLE_PAYMENT_METHODS = exports.PAYABLE_CATEGORIES = void 0;
exports.stripTeamFinancialFields = stripTeamFinancialFields;
exports.syncSurgeryTeamPayables = syncSurgeryTeamPayables;
exports.listPayablesForSurgery = listPayablesForSurgery;
exports.sumPaidPayablesInPeriod = sumPaidPayablesInPeriod;
exports.sumPendingPayables = sumPendingPayables;
exports.todayYmdSaoPaulo = todayYmdSaoPaulo;
exports.payableHorizonBounds = payableHorizonBounds;
exports.payableScheduleDueDates = payableScheduleDueDates;
exports.payableOccurrenceDescription = payableOccurrenceDescription;
exports.scheduleAmountIsEstimate = scheduleAmountIsEstimate;
exports.summarizePayableDueAlerts = summarizePayableDueAlerts;
exports.nextPayableScheduleDueDate = nextPayableScheduleDueDate;
exports.listPayableSchedules = listPayableSchedules;
exports.ensurePayableScheduleHorizon = ensurePayableScheduleHorizon;
exports.propagatePayableSchedule = propagatePayableSchedule;
exports.applyConfirmedEstimateToSchedule = applyConfirmedEstimateToSchedule;
exports.endPayableSchedule = endPayableSchedule;
/**
 * Contas a pagar (`hub_payables`) — sync a partir da equipe cirúrgica e helpers compartilhados.
 * Custo interno da clínica; nunca entra na cobrança do tutor.
 */
const supabase_1 = require("../../config/supabase");
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
exports.PAYABLE_CATEGORIES = [
    'professional_fee',
    'supplies',
    'services',
    'utilities',
    'payroll',
    'rent',
    'marketing',
    'other',
];
exports.PAYABLE_PAYMENT_METHODS = [
    'pix',
    'cash',
    'credit_card',
    'debit_card',
    'transfer',
    'payment_link',
    'other',
];
/** Remove campos financeiros do JSON da equipe antes de persistir no prontuário. */
function stripTeamFinancialFields(team) {
    if (!Array.isArray(team))
        return [];
    return team.map((row) => {
        const role = typeof row.role === 'string' ? row.role.trim() : '';
        const staffId = typeof row.staff_id === 'string'
            ? row.staff_id
            : typeof row.hub_staff_member_id === 'string'
                ? row.hub_staff_member_id
                : null;
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        return {
            role: role || null,
            staff_id: staffId || null,
            name: name || null,
        };
    });
}
function parseTeamFeeRows(team) {
    if (!Array.isArray(team))
        return [];
    const out = [];
    for (const row of team) {
        const role = typeof row.role === 'string' ? row.role.trim() : '';
        const staffIdRaw = typeof row.staff_id === 'string'
            ? row.staff_id
            : typeof row.hub_staff_member_id === 'string'
                ? row.hub_staff_member_id
                : '';
        const staff_id = staffIdRaw.trim() || null;
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        const feeRaw = row.fee_amount;
        let fee_amount = null;
        if (typeof feeRaw === 'number' && Number.isFinite(feeRaw) && feeRaw > 0) {
            fee_amount = round2(feeRaw);
        }
        else if (typeof feeRaw === 'string' && feeRaw.trim()) {
            const n = Number(feeRaw.replace(',', '.'));
            if (Number.isFinite(n) && n > 0)
                fee_amount = round2(n);
        }
        const fee_status = row.fee_status === 'pending' || row.fee_status === 'paid' ? row.fee_status : null;
        const fee_due_date = typeof row.fee_due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.fee_due_date)
            ? row.fee_due_date
            : null;
        const fee_payment_method = typeof row.fee_payment_method === 'string' &&
            exports.PAYABLE_PAYMENT_METHODS.includes(row.fee_payment_method)
            ? row.fee_payment_method
            : null;
        out.push({ role, staff_id, name, fee_amount, fee_status, fee_due_date, fee_payment_method });
    }
    return out;
}
function teamFeeKey(staffId, role) {
    return `${staffId}::${role}`;
}
/**
 * Sincroniza títulos `source_type=surgery` com a equipe enviada no PATCH/POST.
 * - Cria/atualiza quando há fee_amount > 0 e staff_id + role.
 * - Cancela pendentes cujo profissional/papel saiu da equipe ou perdeu o honorário.
 * - Títulos já pagos não são cancelados automaticamente.
 */
async function syncSurgeryTeamPayables(params) {
    const { clinicId, unitId, surgeryId, surgeryTitle, team, createdByUserId } = params;
    const feeRows = parseTeamFeeRows(team).filter((r) => r.staff_id && r.role && r.fee_amount != null && r.fee_amount > 0);
    const { data: existing, error: listErr } = await supabase_1.supabaseAdmin
        .from('hub_payables')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('source_type', 'surgery')
        .eq('source_id', surgeryId)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    if (listErr) {
        if (String(listErr.message || '').includes('hub_payables')) {
            return {
                payables: [],
                error: 'Tabela hub_payables não encontrada. Aplique a migração 113_create_hub_payables.sql.',
            };
        }
        return { payables: [], error: listErr.message };
    }
    const existingRows = (existing ?? []);
    const desiredKeys = new Set(feeRows.map((r) => teamFeeKey(r.staff_id, r.role)));
    // Cancelar pendentes que saíram da equipe / sem honorário
    for (const row of existingRows) {
        if (row.status !== 'pending')
            continue;
        const staffId = row.payee_staff_member_id;
        const role = (row.source_role || '').trim();
        if (!staffId || !role || !desiredKeys.has(teamFeeKey(staffId, role))) {
            const { error: cancelErr } = await supabase_1.supabaseAdmin
                .from('hub_payables')
                .update({ status: 'cancelled' })
                .eq('id', row.id)
                .eq('clinic_id', clinicId)
                .eq('status', 'pending');
            if (cancelErr)
                return { payables: [], error: cancelErr.message };
        }
    }
    const nowIso = new Date().toISOString();
    for (const fee of feeRows) {
        const staffId = fee.staff_id;
        const role = fee.role;
        const key = teamFeeKey(staffId, role);
        const match = existingRows.find((r) => r.status !== 'cancelled' &&
            r.payee_staff_member_id === staffId &&
            (r.source_role || '').trim() === role);
        const payeeName = fee.name || 'Profissional';
        const description = `Honorário — ${role} — ${surgeryTitle}`.slice(0, 2000);
        const status = fee.fee_status === 'paid' ? 'paid' : 'pending';
        const paidAt = status === 'paid' ? nowIso : null;
        const paymentMethod = status === 'paid' ? fee.fee_payment_method ?? 'other' : null;
        if (match) {
            // Não reabrir/alterar título já pago via sync (exceto se ainda pending)
            if (match.status === 'paid') {
                // Atualiza só descrição/nome se o valor já foi liquidado; amount permanece
                const { error: updPaidErr } = await supabase_1.supabaseAdmin
                    .from('hub_payables')
                    .update({
                    payee_name: payeeName,
                    description,
                    source_role: role,
                })
                    .eq('id', match.id)
                    .eq('clinic_id', clinicId);
                if (updPaidErr)
                    return { payables: [], error: updPaidErr.message };
                continue;
            }
            const updatePayload = {
                amount: fee.fee_amount,
                category: 'professional_fee',
                description,
                payee_name: payeeName,
                source_role: role,
                due_date: status === 'pending' ? fee.fee_due_date ?? match.due_date ?? null : match.due_date ?? null,
            };
            if (status === 'paid' && match.status === 'pending') {
                updatePayload.status = 'paid';
                updatePayload.paid_at = paidAt;
                updatePayload.payment_method = paymentMethod;
            }
            else if (status === 'pending') {
                updatePayload.status = 'pending';
                updatePayload.paid_at = null;
                updatePayload.payment_method = null;
            }
            const { error: updErr } = await supabase_1.supabaseAdmin
                .from('hub_payables')
                .update(updatePayload)
                .eq('id', match.id)
                .eq('clinic_id', clinicId);
            if (updErr)
                return { payables: [], error: updErr.message };
            void key;
        }
        else {
            const { error: insErr } = await supabase_1.supabaseAdmin.from('hub_payables').insert({
                clinic_id: clinicId,
                unit_id: unitId,
                amount: fee.fee_amount,
                category: 'professional_fee',
                description,
                payee_staff_member_id: staffId,
                payee_name: payeeName,
                source_type: 'surgery',
                source_id: surgeryId,
                source_role: role,
                status,
                due_date: status === 'pending' ? fee.fee_due_date ?? null : null,
                paid_at: paidAt,
                payment_method: paymentMethod,
                created_by_user_id: createdByUserId ?? null,
            });
            if (insErr)
                return { payables: [], error: insErr.message };
        }
    }
    const { data: refreshed, error: refErr } = await supabase_1.supabaseAdmin
        .from('hub_payables')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('source_type', 'surgery')
        .eq('source_id', surgeryId)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });
    if (refErr)
        return { payables: [], error: refErr.message };
    return { payables: (refreshed ?? []) };
}
async function listPayablesForSurgery(clinicId, surgeryId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_payables')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('source_type', 'surgery')
        .eq('source_id', surgeryId)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });
    if (error) {
        if (String(error.message || '').includes('hub_payables')) {
            return { payables: [] };
        }
        return { payables: [], error: error.message };
    }
    return { payables: (data ?? []) };
}
/** Soma payables pagos no período (por dia do paid_at em America/Sao_Paulo via slice ISO — UTC day). */
async function sumPaidPayablesInPeriod(params) {
    const fromIso = `${params.fromYmd}T00:00:00.000Z`;
    const toIso = `${params.toYmd}T23:59:59.999Z`;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_payables')
        .select('amount, paid_at')
        .eq('clinic_id', params.clinicId)
        .eq('unit_id', params.unitId)
        .eq('status', 'paid')
        .is('deleted_at', null)
        .gte('paid_at', fromIso)
        .lte('paid_at', toIso);
    if (error) {
        if (String(error.message || '').includes('hub_payables')) {
            return { total: 0, byDay: new Map(), missingTable: true };
        }
        return { total: 0, byDay: new Map(), missingTable: false, error: error.message };
    }
    const byDay = new Map();
    let total = 0;
    for (const row of data ?? []) {
        const amt = Number(row.amount ?? 0);
        total = round2(total + amt);
        const key = String(row.paid_at ?? '').slice(0, 10);
        if (key)
            byDay.set(key, round2((byDay.get(key) ?? 0) + amt));
    }
    return { total, byDay, missingTable: false };
}
async function sumPendingPayables(params) {
    const empty = { total: 0, count: 0, unconfirmedCount: 0, estimatedTotal: 0, missingTable: false };
    const first = await supabase_1.supabaseAdmin
        .from('hub_payables')
        .select('amount, amount_confirmed')
        .eq('clinic_id', params.clinicId)
        .eq('unit_id', params.unitId)
        .eq('status', 'pending')
        .is('deleted_at', null);
    let rows = (first.data ?? null);
    let error = first.error;
    if (error && String(error.message || '').includes('amount_confirmed')) {
        const fallback = await supabase_1.supabaseAdmin
            .from('hub_payables')
            .select('amount')
            .eq('clinic_id', params.clinicId)
            .eq('unit_id', params.unitId)
            .eq('status', 'pending')
            .is('deleted_at', null);
        rows = (fallback.data ?? null);
        error = fallback.error;
    }
    if (error) {
        if (String(error.message || '').includes('hub_payables')) {
            return { ...empty, missingTable: true };
        }
        return { ...empty, error: error.message };
    }
    let total = 0;
    let unconfirmedCount = 0;
    let estimatedTotal = 0;
    for (const row of rows ?? []) {
        const amt = Number(row.amount ?? 0);
        if (row.amount_confirmed === false) {
            unconfirmedCount += 1;
            estimatedTotal = round2(estimatedTotal + amt);
        }
        else {
            total = round2(total + amt);
        }
    }
    return { total, count: rows?.length ?? 0, unconfirmedCount, estimatedTotal, missingTable: false };
}
exports.PAYABLE_SCHEDULE_FREQUENCIES = ['weekly', 'biweekly', 'monthly'];
exports.PAYABLE_SCHEDULE_AMOUNT_MODES = ['fixed', 'estimated'];
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
function todayYmdSaoPaulo(now = new Date()) {
    return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
function ymdToUtc(ymd) {
    return new Date(`${ymd}T00:00:00.000Z`);
}
function utcToYmd(d) {
    return d.toISOString().slice(0, 10);
}
function addUtcDays(ymd, days) {
    const d = ymdToUtc(ymd);
    d.setUTCDate(d.getUTCDate() + days);
    return utcToYmd(d);
}
function daysBetweenYmd(fromYmd, toYmd) {
    return Math.round((ymdToUtc(toYmd).getTime() - ymdToUtc(fromYmd).getTime()) / 86_400_000);
}
/** Primeiro dia do mês de `todayYmd` até o último dia do mês seguinte. */
function payableHorizonBounds(todayYmd) {
    const y = Number(todayYmd.slice(0, 4));
    const m = Number(todayYmd.slice(5, 7));
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m + 1, 0));
    return { fromYmd: utcToYmd(from), toYmd: utcToYmd(to) };
}
/**
 * Vencimentos do contrato que caem no mês atual ou no próximo.
 * Não recria meses anteriores. Mensal usa o dia da âncora e encurta no fim do mês
 * (o mesmo critério de `generateOccurrenceDates`).
 */
function payableScheduleDueDates(params) {
    const anchor = params.anchorDate.slice(0, 10);
    if (!YMD_RE.test(anchor) || !YMD_RE.test(params.todayYmd))
        return [];
    const { fromYmd, toYmd } = payableHorizonBounds(params.todayYmd);
    const until = params.untilDate && YMD_RE.test(params.untilDate.slice(0, 10))
        ? params.untilDate.slice(0, 10)
        : null;
    const horizonEnd = until && until < toYmd ? until : toYmd;
    if (horizonEnd < fromYmd || anchor > horizonEnd)
        return [];
    if (params.frequency === 'monthly') {
        const anchorDay = Number(anchor.slice(8, 10));
        const dates = [];
        let year = Number(anchor.slice(0, 4));
        let month = Number(anchor.slice(5, 7));
        for (let i = 0; i < 36; i += 1) {
            let ymd;
            if (i === 0) {
                ymd = anchor;
            }
            else {
                month += 1;
                if (month > 12) {
                    month = 1;
                    year += 1;
                }
                const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
                const day = Math.min(anchorDay, lastDay);
                ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
            if (ymd > horizonEnd)
                break;
            if (ymd >= fromYmd)
                dates.push(ymd);
        }
        return dates;
    }
    const stepDays = params.frequency === 'biweekly' ? 14 : 7;
    let cursor = anchor;
    if (cursor < fromYmd) {
        const steps = Math.floor(daysBetweenYmd(anchor, fromYmd) / stepDays);
        cursor = addUtcDays(anchor, steps * stepDays);
        if (cursor < fromYmd)
            cursor = addUtcDays(cursor, stepDays);
    }
    const dates = [];
    for (let i = 0; i < 16 && cursor <= horizonEnd; i += 1) {
        if (cursor >= fromYmd && cursor >= anchor)
            dates.push(cursor);
        cursor = addUtcDays(cursor, stepDays);
    }
    return dates;
}
const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function payableOccurrenceDescription(base, frequency, dueYmd) {
    const trimmed = base.trim();
    const month = Number(dueYmd.slice(5, 7));
    const suffix = frequency === 'monthly'
        ? `${MONTH_LABELS[month - 1] ?? dueYmd.slice(5, 7)}/${dueYmd.slice(0, 4)}`
        : `${dueYmd.slice(8, 10)}/${dueYmd.slice(5, 7)}/${dueYmd.slice(0, 4)}`;
    return `${trimmed} · ${suffix}`.slice(0, 2000);
}
function scheduleAmountIsEstimate(mode) {
    return mode === 'estimated';
}
/** Contagem inclui o que precisa de ação. O total em reais soma só o valor confirmado. */
function summarizePayableDueAlerts(rows, dateYmd) {
    const out = {
        overdue_payables_count: 0,
        overdue_payables_total: 0,
        overdue_payables_unconfirmed_count: 0,
        overdue_payables_estimated_total: 0,
        due_today_payables_count: 0,
        due_today_payables_total: 0,
        due_today_payables_unconfirmed_count: 0,
        due_today_payables_estimated_total: 0,
    };
    for (const row of rows) {
        const due = row.due_date ? String(row.due_date).slice(0, 10) : '';
        if (!due)
            continue;
        const amt = Number(row.amount ?? 0);
        const estimated = row.amount_confirmed === false;
        if (due < dateYmd) {
            out.overdue_payables_count += 1;
            if (estimated) {
                out.overdue_payables_unconfirmed_count += 1;
                out.overdue_payables_estimated_total = round2(out.overdue_payables_estimated_total + amt);
            }
            else {
                out.overdue_payables_total = round2(out.overdue_payables_total + amt);
            }
        }
        else if (due === dateYmd) {
            out.due_today_payables_count += 1;
            if (estimated) {
                out.due_today_payables_unconfirmed_count += 1;
                out.due_today_payables_estimated_total = round2(out.due_today_payables_estimated_total + amt);
            }
            else {
                out.due_today_payables_total = round2(out.due_today_payables_total + amt);
            }
        }
    }
    return out;
}
function nextPayableScheduleDueDate(schedule, todayYmd) {
    const dates = payableScheduleDueDates({
        frequency: schedule.frequency,
        anchorDate: String(schedule.anchor_date).slice(0, 10),
        untilDate: schedule.until_date ? String(schedule.until_date).slice(0, 10) : null,
        todayYmd,
    });
    return dates.find((d) => d >= todayYmd) ?? null;
}
function isMissingScheduleTable(message) {
    const msg = String(message || '');
    return msg.includes('hub_payable_schedules') || msg.includes('recurrence_detached');
}
function scheduleDueKey(sourceId, due) {
    return `${sourceId}|${String(due ?? '').slice(0, 10)}`;
}
async function listPayableSchedules(params) {
    const todayYmd = params.todayYmd ?? todayYmdSaoPaulo();
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_payable_schedules')
        .select('*')
        .eq('clinic_id', params.clinicId)
        .eq('unit_id', params.unitId)
        .is('deleted_at', null)
        .in('status', ['active', 'paused'])
        .order('payee_name', { ascending: true });
    if (error) {
        if (isMissingScheduleTable(error.message)) {
            return { schedules: [], missingTable: true };
        }
        return { schedules: [], missingTable: false, error: error.message };
    }
    const schedules = (data ?? []).map((row) => ({
        ...row,
        anchor_date: String(row.anchor_date).slice(0, 10),
        until_date: row.until_date ? String(row.until_date).slice(0, 10) : null,
        next_due_date: nextPayableScheduleDueDate(row, todayYmd),
    }));
    return { schedules, missingTable: false };
}
async function insertOccurrence(schedule, dueYmd) {
    const { error } = await supabase_1.supabaseAdmin.from('hub_payables').insert({
        clinic_id: schedule.clinic_id,
        unit_id: schedule.unit_id,
        amount: round2(Number(schedule.amount)),
        category: schedule.category,
        description: payableOccurrenceDescription(schedule.description, schedule.frequency, dueYmd),
        notes: schedule.notes ?? null,
        payee_staff_member_id: schedule.payee_staff_member_id ?? null,
        payee_supplier_id: schedule.payee_supplier_id ?? null,
        payee_name: schedule.payee_name,
        source_type: 'recurrence',
        source_id: schedule.id,
        source_role: null,
        recurrence_detached: false,
        amount_confirmed: !scheduleAmountIsEstimate(schedule.amount_mode),
        status: 'pending',
        due_date: dueYmd,
        paid_at: null,
        payment_method: null,
        created_by_user_id: schedule.created_by_user_id ?? null,
    });
    if (!error)
        return {};
    if (error.code === '23505' || String(error.message || '').includes('uniq_hub_payables_recurrence_due')) {
        return {};
    }
    return { error: error.message };
}
/**
 * Cria competências que ainda não existem no mês atual e no próximo.
 * Não altera pagos, cancelados nem títulos desligados do contrato.
 */
async function ensurePayableScheduleHorizon(params) {
    const todayYmd = params.todayYmd ?? todayYmdSaoPaulo();
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_payable_schedules')
        .select('*')
        .eq('clinic_id', params.clinicId)
        .eq('unit_id', params.unitId)
        .eq('status', 'active')
        .is('deleted_at', null);
    if (error) {
        if (isMissingScheduleTable(error.message))
            return { created: 0, missingTable: true };
        return { created: 0, missingTable: false, error: error.message };
    }
    const schedules = (data ?? []);
    if (schedules.length === 0)
        return { created: 0, missingTable: false };
    const ids = schedules.map((s) => s.id);
    const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
        .from('hub_payables')
        .select('source_id, due_date, status')
        .eq('clinic_id', params.clinicId)
        .eq('source_type', 'recurrence')
        .in('source_id', ids)
        .is('deleted_at', null);
    if (exErr) {
        if (isMissingScheduleTable(exErr.message) || String(exErr.message || '').includes('hub_payables')) {
            return { created: 0, missingTable: true };
        }
        return { created: 0, missingTable: false, error: exErr.message };
    }
    const taken = new Set((existing ?? []).map((row) => scheduleDueKey(String(row.source_id), row.due_date)));
    let created = 0;
    for (const schedule of schedules) {
        const dates = payableScheduleDueDates({
            frequency: schedule.frequency,
            anchorDate: String(schedule.anchor_date).slice(0, 10),
            untilDate: schedule.until_date ? String(schedule.until_date).slice(0, 10) : null,
            todayYmd,
        });
        for (const due of dates) {
            if (taken.has(scheduleDueKey(schedule.id, due)))
                continue;
            const inserted = await insertOccurrence(schedule, due);
            if (inserted.error)
                return { created, missingTable: false, error: inserted.error };
            taken.add(scheduleDueKey(schedule.id, due));
            created += 1;
        }
    }
    return { created, missingTable: false };
}
/** Atualiza pendentes ainda ligados ao contrato e cancela os que passaram de `until_date`. */
async function propagatePayableSchedule(schedule) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_payables')
        .select('id, due_date')
        .eq('clinic_id', schedule.clinic_id)
        .eq('source_type', 'recurrence')
        .eq('source_id', schedule.id)
        .eq('status', 'pending')
        .eq('recurrence_detached', false)
        .is('deleted_at', null);
    if (error)
        return { error: error.message };
    const until = schedule.until_date ? String(schedule.until_date).slice(0, 10) : null;
    for (const row of data ?? []) {
        const due = String(row.due_date ?? '').slice(0, 10);
        if (until && due && due > until) {
            const { error: cancelErr } = await supabase_1.supabaseAdmin
                .from('hub_payables')
                .update({ status: 'cancelled' })
                .eq('id', row.id)
                .eq('status', 'pending');
            if (cancelErr)
                return { error: cancelErr.message };
            continue;
        }
        const estimated = scheduleAmountIsEstimate(schedule.amount_mode);
        const { error: updErr } = await supabase_1.supabaseAdmin
            .from('hub_payables')
            .update({
            amount: round2(Number(schedule.amount)),
            amount_confirmed: !estimated,
            category: schedule.category,
            description: due
                ? payableOccurrenceDescription(schedule.description, schedule.frequency, due)
                : schedule.description,
            notes: schedule.notes ?? null,
            payee_staff_member_id: schedule.payee_staff_member_id ?? null,
            payee_supplier_id: schedule.payee_supplier_id ?? null,
            payee_name: schedule.payee_name,
        })
            .eq('id', row.id)
            .eq('status', 'pending')
            .eq('recurrence_detached', false);
        if (updErr)
            return { error: updErr.message };
    }
    return {};
}
/**
 * A última fatura confirmada vira a estimativa do contrato e das competências
 * pendentes que ainda seguem o contrato. Contrato de valor fixo não muda.
 * O título confirmado precisa já estar desligado (`recurrence_detached`).
 */
async function applyConfirmedEstimateToSchedule(params) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_payable_schedules')
        .select('*')
        .eq('id', params.scheduleId)
        .eq('clinic_id', params.clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error)
        return { error: error.message };
    if (!data)
        return {};
    const schedule = data;
    if (!scheduleAmountIsEstimate(schedule.amount_mode) || schedule.status === 'ended')
        return {};
    const nextAmount = round2(params.amount);
    const { error: updErr } = await supabase_1.supabaseAdmin
        .from('hub_payable_schedules')
        .update({ amount: nextAmount })
        .eq('id', schedule.id)
        .eq('clinic_id', params.clinicId);
    if (updErr)
        return { error: updErr.message };
    return propagatePayableSchedule({ ...schedule, amount: nextAmount });
}
/** Encerra o contrato e cancela pendentes com vencimento depois de hoje. */
async function endPayableSchedule(params) {
    const todayYmd = params.todayYmd ?? todayYmdSaoPaulo();
    const { error } = await supabase_1.supabaseAdmin
        .from('hub_payable_schedules')
        .update({ status: 'ended' })
        .eq('id', params.schedule.id)
        .eq('clinic_id', params.schedule.clinic_id);
    if (error)
        return { error: error.message };
    const { error: cancelErr } = await supabase_1.supabaseAdmin
        .from('hub_payables')
        .update({ status: 'cancelled' })
        .eq('clinic_id', params.schedule.clinic_id)
        .eq('source_type', 'recurrence')
        .eq('source_id', params.schedule.id)
        .eq('status', 'pending')
        .is('deleted_at', null)
        .gt('due_date', todayYmd);
    if (cancelErr)
        return { error: cancelErr.message };
    return {};
}
