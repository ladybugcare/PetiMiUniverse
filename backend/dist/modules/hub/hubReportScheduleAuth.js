"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertScheduleRecipientAllowed = assertScheduleRecipientAllowed;
exports.authorizeReportScheduleMutation = authorizeReportScheduleMutation;
exports.authorizeReportScheduleExecution = authorizeReportScheduleExecution;
exports.suspendReportSchedule = suspendReportSchedule;
exports.auditActiveReportSchedules = auditActiveReportSchedules;
const supabase_1 = require("../../config/supabase");
const hubReportAuthorize_1 = require("./hubReportAuthorize");
const reportsContract_1 = require("./reportsContract");
/**
 * Destinatário permitido: e-mail de um clinic_users ativo da mesma clínica.
 * Sem regra de compartilhamento externo documentada — e-mail externo é recusado.
 */
async function assertScheduleRecipientAllowed(clinicId, recipientEmail) {
    const email = recipientEmail.trim().toLowerCase();
    if (!email)
        return { ok: false, status: 400, error: 'recipient_email inválido' };
    const { data: clinicUsers, error } = await supabase_1.supabaseAdmin
        .from('clinic_users')
        .select('user_id')
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .limit(200);
    if (error)
        return { ok: false, status: 400, error: error.message };
    const userIds = (clinicUsers ?? []).map((r) => r.user_id).filter(Boolean);
    if (userIds.length === 0) {
        return { ok: false, status: 403, error: 'Nenhum usuário ativo na clínica para receber o relatório' };
    }
    for (const userId of userIds) {
        try {
            const { data, error: uErr } = await supabase_1.supabaseAdmin.auth.admin.getUserById(userId);
            if (uErr || !data?.user?.email)
                continue;
            if (String(data.user.email).trim().toLowerCase() === email) {
                return { ok: true };
            }
        }
        catch {
            continue;
        }
    }
    return {
        ok: false,
        status: 403,
        error: 'Destinatário deve ser e-mail de um usuário ativo da clínica',
    };
}
async function authorizeReportScheduleMutation(opts) {
    if (!(0, reportsContract_1.isHubReportId)(opts.reportId) || !reportsContract_1.SCHEDULABLE_REPORT_IDS.includes(opts.reportId)) {
        return { ok: false, status: 400, error: 'report_id não permite agendamento' };
    }
    const auth = await (0, hubReportAuthorize_1.authorizeHubReport)({
        userId: opts.userId,
        clinicId: opts.clinicId,
        reportId: opts.reportId,
        requestedUnitId: opts.unitId,
        requireSchedule: true,
    });
    if (!auth.ok)
        return auth;
    const recipient = await assertScheduleRecipientAllowed(opts.clinicId, opts.recipientEmail);
    if (!recipient.ok)
        return recipient;
    return { ok: true };
}
/**
 * Revalida autorização do proprietário do agendamento (create/edit/run/cron).
 * Escopo de dados = do proprietário — não do caller.
 */
async function authorizeReportScheduleExecution(opts) {
    const ownerId = opts.schedule.created_by_user_id;
    if (!ownerId) {
        return {
            ok: false,
            status: 403,
            error: 'Agendamento sem proprietário; suspender',
            suspend: true,
        };
    }
    if (!(0, reportsContract_1.isHubReportId)(opts.schedule.report_id)) {
        return { ok: false, status: 400, error: 'report_id inválido', suspend: true };
    }
    const auth = await (0, hubReportAuthorize_1.authorizeHubReport)({
        userId: ownerId,
        clinicId: opts.schedule.clinic_id,
        reportId: opts.schedule.report_id,
        requestedUnitId: opts.schedule.unit_id,
        requireSchedule: true,
    });
    if (!auth.ok) {
        return { ...auth, suspend: true };
    }
    const recipient = await assertScheduleRecipientAllowed(opts.schedule.clinic_id, opts.schedule.recipient_email);
    if (!recipient.ok) {
        return { ...recipient, suspend: true };
    }
    return { ok: true };
}
async function suspendReportSchedule(scheduleId, clinicId, reason) {
    await supabase_1.supabaseAdmin
        .from('hub_report_email_schedules')
        .update({
        active: false,
        last_status: 'suspended',
        last_error: reason.slice(0, 500),
        suspension_reason: reason.slice(0, 500),
    })
        .eq('id', scheduleId)
        .eq('clinic_id', clinicId);
}
/** Revisa agendamentos ativos da clínica e suspende os inválidos (sem promover permissões). */
async function auditActiveReportSchedules(clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_report_email_schedules')
        .select('id, clinic_id, unit_id, report_id, recipient_email, period_days, cadence, active, created_by_user_id, suspension_reason')
        .eq('clinic_id', clinicId)
        .eq('active', true)
        .limit(200);
    if (error || !data)
        return { checked: 0, suspended: 0 };
    let suspended = 0;
    for (const row of data) {
        const result = await authorizeReportScheduleExecution({ schedule: row });
        if (!result.ok && result.suspend) {
            await suspendReportSchedule(row.id, clinicId, result.error);
            suspended += 1;
        }
    }
    return { checked: data.length, suspended };
}
