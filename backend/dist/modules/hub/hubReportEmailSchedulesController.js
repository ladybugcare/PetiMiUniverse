"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runHubReportEmailSchedule = exports.deleteHubReportEmailSchedule = exports.patchHubReportEmailSchedule = exports.createHubReportEmailSchedule = exports.listHubReportEmailSchedules = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const reportsContract_1 = require("./reportsContract");
const hubReportScheduleAuth_1 = require("./hubReportScheduleAuth");
const uuidStr = zod_1.z.string().uuid();
const SCHEDULE_SELECT = 'id, clinic_id, unit_id, report_id, cadence, recipient_email, period_days, active, last_sent_at, last_status, last_error, suspension_reason, created_by_user_id, created_at, updated_at';
const reportIdEnum = zod_1.z.enum(reportsContract_1.SCHEDULABLE_REPORT_ID_TUPLE);
const createSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    report_id: reportIdEnum,
    recipient_email: zod_1.z.string().email().max(200),
    period_days: zod_1.z.coerce.number().int().min(7).max(366).optional(),
    cadence: zod_1.z.literal('weekly').optional(),
    active: zod_1.z.boolean().optional(),
})
    .strict();
const patchSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    recipient_email: zod_1.z.string().email().max(200).optional(),
    period_days: zod_1.z.coerce.number().int().min(7).max(366).optional(),
    unit_id: uuidStr.nullable().optional(),
    active: zod_1.z.boolean().optional(),
})
    .strict();
const listHubReportEmailSchedules = async (req, res) => {
    try {
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        // Revisão oportunista: suspende inválidos sem promover permissões
        await (0, hubReportScheduleAuth_1.auditActiveReportSchedules)(clinic.data);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_report_email_schedules')
            .select(SCHEDULE_SELECT)
            .eq('clinic_id', clinic.data)
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) {
            if (String(error.message || '').includes('hub_report_email_schedules')) {
                return res.json({ schedules: [] });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.json({ schedules: data ?? [] });
    }
    catch (e) {
        console.error('listHubReportEmailSchedules', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.listHubReportEmailSchedules = listHubReportEmailSchedules;
const createHubReportEmailSchedule = async (req, res) => {
    try {
        const parsed = createSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const d = parsed.data;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuário não autenticado' });
        const auth = await (0, hubReportScheduleAuth_1.authorizeReportScheduleMutation)({
            userId,
            clinicId: d.clinic_id,
            reportId: d.report_id,
            unitId: d.unit_id ?? null,
            recipientEmail: d.recipient_email,
        });
        if (!auth.ok)
            return res.status(auth.status).json({ error: auth.error });
        const row = {
            clinic_id: d.clinic_id,
            unit_id: d.unit_id ?? null,
            report_id: d.report_id,
            recipient_email: d.recipient_email.trim().toLowerCase(),
            period_days: d.period_days ?? 30,
            cadence: d.cadence ?? 'weekly',
            active: d.active ?? true,
            created_by_user_id: userId,
            suspension_reason: null,
        };
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_report_email_schedules')
            .insert(row)
            .select(SCHEDULE_SELECT)
            .single();
        if (error) {
            if (String(error.message || '').includes('hub_report_email_schedules')) {
                return res.status(503).json({
                    error: 'Tabela hub_report_email_schedules não encontrada. Aplique a migração 096/176.',
                });
            }
            if (String(error.code) === '23505') {
                return res.status(409).json({ error: 'Já existe agendamento ativo para este relatório e e-mail.' });
            }
            return res.status(500).json({ error: error.message });
        }
        return res.status(201).json({ schedule: data });
    }
    catch (e) {
        console.error('createHubReportEmailSchedule', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.createHubReportEmailSchedule = createHubReportEmailSchedule;
const patchHubReportEmailSchedule = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        if (!id.success)
            return res.status(400).json({ error: 'id inválido' });
        const parsed = patchSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
        }
        const { clinic_id, ...rest } = parsed.data;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuário não autenticado' });
        const { data: existing, error: eErr } = await supabase_1.supabaseAdmin
            .from('hub_report_email_schedules')
            .select(SCHEDULE_SELECT)
            .eq('id', id.data)
            .eq('clinic_id', clinic_id)
            .maybeSingle();
        if (eErr)
            return res.status(500).json({ error: eErr.message });
        if (!existing)
            return res.status(404).json({ error: 'Agendamento não encontrado' });
        const nextEmail = rest.recipient_email ?? existing.recipient_email;
        const nextUnit = rest.unit_id !== undefined ? rest.unit_id : existing.unit_id;
        const auth = await (0, hubReportScheduleAuth_1.authorizeReportScheduleMutation)({
            userId,
            clinicId: clinic_id,
            reportId: existing.report_id,
            unitId: nextUnit,
            recipientEmail: nextEmail,
        });
        if (!auth.ok)
            return res.status(auth.status).json({ error: auth.error });
        const patch = {};
        if (rest.recipient_email !== undefined)
            patch.recipient_email = rest.recipient_email.trim().toLowerCase();
        if (rest.period_days !== undefined)
            patch.period_days = rest.period_days;
        if (rest.unit_id !== undefined)
            patch.unit_id = rest.unit_id;
        if (rest.active !== undefined) {
            patch.active = rest.active;
            if (rest.active)
                patch.suspension_reason = null;
        }
        if (Object.keys(patch).length === 0)
            return res.status(400).json({ error: 'Nada para atualizar' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_report_email_schedules')
            .update(patch)
            .eq('id', id.data)
            .eq('clinic_id', clinic_id)
            .select(SCHEDULE_SELECT)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(404).json({ error: 'Agendamento não encontrado' });
        return res.json({ schedule: data });
    }
    catch (e) {
        console.error('patchHubReportEmailSchedule', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.patchHubReportEmailSchedule = patchHubReportEmailSchedule;
const deleteHubReportEmailSchedule = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        if (!id.success)
            return res.status(400).json({ error: 'id inválido' });
        const clinic = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_report_email_schedules')
            .delete()
            .eq('id', id.data)
            .eq('clinic_id', clinic.data);
        if (error)
            return res.status(500).json({ error: error.message });
        return res.status(204).send();
    }
    catch (e) {
        console.error('deleteHubReportEmailSchedule', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.deleteHubReportEmailSchedule = deleteHubReportEmailSchedule;
/**
 * Disparo manual do agendamento.
 * Revalida permissões do proprietário (created_by_user_id); suspende se inválido.
 * Sem provedor SMTP configurado, registra status `queued` e devolve preview.
 */
const runHubReportEmailSchedule = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        if (!id.success)
            return res.status(400).json({ error: 'id inválido' });
        const clinic = uuidStr.safeParse(req.body?.clinic_id ?? req.query.clinic_id);
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const { data: schedule, error } = await supabase_1.supabaseAdmin
            .from('hub_report_email_schedules')
            .select(SCHEDULE_SELECT)
            .eq('id', id.data)
            .eq('clinic_id', clinic.data)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!schedule)
            return res.status(404).json({ error: 'Agendamento não encontrado' });
        if (!schedule.active) {
            return res.status(409).json({ error: 'Agendamento inativo' });
        }
        const exec = await (0, hubReportScheduleAuth_1.authorizeReportScheduleExecution)({ schedule: schedule });
        if (!exec.ok) {
            if (exec.suspend) {
                await (0, hubReportScheduleAuth_1.suspendReportSchedule)(id.data, clinic.data, exec.error);
            }
            return res.status(exec.status).json({ error: exec.error, suspended: !!exec.suspend });
        }
        const preview = {
            to: schedule.recipient_email,
            subject: `[PetMi Hub] Relatório semanal — ${schedule.report_id}`,
            report_id: schedule.report_id,
            period_days: schedule.period_days,
            cadence: schedule.cadence,
            note: 'Fila registrada. Configure o provedor de e-mail do Hub para envio automático; até lá o disparo fica como queued. Cron futuro deve chamar authorizeReportScheduleExecution.',
        };
        const { data: updated, error: uErr } = await supabase_1.supabaseAdmin
            .from('hub_report_email_schedules')
            .update({
            last_sent_at: new Date().toISOString(),
            last_status: 'queued',
            last_error: null,
        })
            .eq('id', id.data)
            .eq('clinic_id', clinic.data)
            .select(SCHEDULE_SELECT)
            .single();
        if (uErr)
            return res.status(500).json({ error: uErr.message });
        return res.json({ schedule: updated, preview, delivery: 'queued' });
    }
    catch (e) {
        console.error('runHubReportEmailSchedule', e);
        return res.status(500).json({ error: e?.message || 'Erro interno' });
    }
};
exports.runHubReportEmailSchedule = runHubReportEmailSchedule;
