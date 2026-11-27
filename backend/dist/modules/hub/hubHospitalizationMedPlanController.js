"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.civilYmdInSp = exports.closeHospitalizationMedPlan = exports.getHubHospitalizationMedPrintModel = exports.completeHubHospitalizationMedDose = exports.listHubHospitalizationMedDoses = exports.resumeHubHospitalizationMedOrder = exports.suspendHubHospitalizationMedOrder = exports.createHubHospitalizationMedOrderVersion = exports.createHubHospitalizationMedOrder = exports.listHubHospitalizationMedOrders = void 0;
exports.canManageHospMedOrders = canManageHospMedOrders;
exports.canAdminHospMedDoses = canAdminHospMedDoses;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const hospitalizationMedPlan_1 = require("./hospitalizationMedPlan");
Object.defineProperty(exports, "civilYmdInSp", { enumerable: true, get: function () { return hospitalizationMedPlan_1.civilYmdInSp; } });
const hospitalizationMedPlanService_1 = require("./hospitalizationMedPlanService");
Object.defineProperty(exports, "closeHospitalizationMedPlan", { enumerable: true, get: function () { return hospitalizationMedPlanService_1.closeHospitalizationMedPlan; } });
const uuidStr = zod_1.z.string().uuid();
const scheduleKindSchema = zod_1.z.enum(['fixed_times', 'interval']);
const versionBodySchema = zod_1.z
    .object({
    medication_name: zod_1.z.string().trim().min(1).max(200),
    presentation: zod_1.z.string().trim().max(200).optional().nullable(),
    concentration: zod_1.z.string().trim().max(200).optional().nullable(),
    dose_value: zod_1.z.number().positive(),
    dose_unit: zod_1.z.string().trim().min(1).max(40),
    route: zod_1.z.string().trim().max(80).optional().nullable(),
    schedule_kind: scheduleKindSchema,
    times: zod_1.z.array(zod_1.z.string()).optional(),
    interval_hours: zod_1.z.number().positive().max(168).optional().nullable(),
    starts_at: zod_1.z.string().datetime({ offset: true }),
    ends_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    instructions: zod_1.z.string().trim().max(2000).optional().nullable(),
    billing_mode: zod_1.z.enum(['charge', 'included']).optional().default('included'),
    hub_service_type_id: uuidStr.optional().nullable(),
    unit_amount: zod_1.z.number().min(0).optional().nullable(),
    prescribed_by_staff_id: uuidStr.optional().nullable(),
    change_reason: zod_1.z.string().trim().min(1).max(500).optional().nullable(),
})
    .superRefine((b, ctx) => {
    if (b.schedule_kind === 'fixed_times') {
        const times = (0, hospitalizationMedPlan_1.normalizeTimes)(b.times ?? []);
        if (times.length === 0) {
            ctx.addIssue({ code: 'custom', message: 'Informe ao menos um horário', path: ['times'] });
        }
    }
    else if (!b.interval_hours) {
        ctx.addIssue({ code: 'custom', message: 'interval_hours obrigatório', path: ['interval_hours'] });
    }
    if (b.ends_at && new Date(b.ends_at).getTime() <= new Date(b.starts_at).getTime()) {
        ctx.addIssue({ code: 'custom', message: 'ends_at deve ser após starts_at', path: ['ends_at'] });
    }
});
async function resolveStaffForUser(clinicId, userId) {
    if (!userId)
        return null;
    const { data: cu } = await supabase_1.supabaseAdmin
        .from('clinic_users')
        .select('id')
        .eq('user_id', userId)
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .maybeSingle();
    if (!cu?.id)
        return null;
    const { data: staff } = await supabase_1.supabaseAdmin
        .from('hub_staff_members')
        .select('id, job_title, full_name')
        .eq('clinic_id', clinicId)
        .eq('clinic_user_id', cu.id)
        .is('deleted_at', null)
        .maybeSingle();
    return staff ?? null;
}
/** CADMIN / permissão explícita / vet com clinic.write. */
async function canManageHospMedOrders(userId, clinicId) {
    if (!userId)
        return false;
    if (await (0, authMiddleware_1.checkPermission)(userId, clinicId, 'hub.clinic.med_orders.manage'))
        return true;
    if (!(await (0, authMiddleware_1.checkPermission)(userId, clinicId, 'hub.clinic.write')))
        return false;
    const staff = await resolveStaffForUser(clinicId, userId);
    return staff?.job_title === hospitalizationMedPlan_1.VET_JOB_TITLE;
}
async function canAdminHospMedDoses(userId, clinicId) {
    if (!userId)
        return false;
    if (await (0, authMiddleware_1.checkPermission)(userId, clinicId, 'hub.clinic.med_admin.write'))
        return true;
    return (0, authMiddleware_1.checkPermission)(userId, clinicId, 'hub.clinic.write');
}
function mapVersionRow(v) {
    return {
        ...v,
        dose_label: (0, hospitalizationMedPlan_1.formatDoseLabel)(Number(v.dose_value), String(v.dose_unit ?? '')),
    };
}
async function loadOrderBundle(orderId, clinicId) {
    const { data: order, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_orders')
        .select('*')
        .eq('id', orderId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!order)
        return null;
    const { data: versions, error: vErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_order_versions')
        .select('*, prescribed_by:hub_staff_members!prescribed_by_staff_id(id, full_name, job_title)')
        .eq('order_id', orderId)
        .order('version_no', { ascending: false });
    if (vErr)
        throw new Error(vErr.message);
    const current = (versions ?? []).find((v) => v.id === order.current_version_id) ??
        (versions ?? [])[0] ??
        null;
    return {
        order,
        current_version: current ? mapVersionRow(current) : null,
        versions: (versions ?? []).map((v) => mapVersionRow(v)),
    };
}
async function assertActiveHospitalization(id, clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .select('id, status, daily_includes_medication')
        .eq('id', id)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!data)
        return { ok: false, error: 'Internação não encontrada', status: 404 };
    if (data.status !== 'active') {
        return { ok: false, error: 'Internação não está ativa', status: 409, hosp: data };
    }
    return { ok: true, hosp: data };
}
function versionInsertFromBody(clinicId, orderId, versionNo, b, staffId, supersedes) {
    const times = b.schedule_kind === 'fixed_times' ? (0, hospitalizationMedPlan_1.normalizeTimes)(b.times ?? []) : [];
    return {
        clinic_id: clinicId,
        order_id: orderId,
        version_no: versionNo,
        medication_name: b.medication_name,
        presentation: b.presentation ?? null,
        concentration: b.concentration ?? null,
        dose_value: b.dose_value,
        dose_unit: b.dose_unit,
        route: b.route ?? null,
        schedule_kind: b.schedule_kind,
        times,
        interval_hours: b.schedule_kind === 'interval' ? b.interval_hours : null,
        starts_at: b.starts_at,
        ends_at: b.ends_at ?? null,
        instructions: b.instructions ?? null,
        billing_mode: b.billing_mode,
        hub_service_type_id: b.hub_service_type_id ?? null,
        unit_amount: b.unit_amount ?? null,
        prescribed_by_staff_id: b.prescribed_by_staff_id ?? staffId,
        change_reason: versionNo > 1 ? b.change_reason ?? null : null,
        supersedes_version_id: supersedes,
    };
}
const listHubHospitalizationMedOrders = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic_id.success) {
        return res.status(400).json({ error: 'hospitalization id e clinic_id obrigatórios' });
    }
    const { data: orders, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_orders')
        .select('*')
        .eq('hospitalization_id', id.data)
        .eq('clinic_id', clinic_id.data)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
    if (error)
        return res.status(500).json({ error: error.message });
    const includeHistory = String(req.query.include_history ?? '') === '1';
    const bundles = [];
    for (const order of orders ?? []) {
        const bundle = await loadOrderBundle(order.id, clinic_id.data);
        if (!bundle)
            continue;
        bundles.push(includeHistory
            ? bundle
            : { order: bundle.order, current_version: bundle.current_version, versions: undefined });
    }
    return res.json({ orders: bundles });
};
exports.listHubHospitalizationMedOrders = listHubHospitalizationMedOrders;
const createHubHospitalizationMedOrder = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        sort_order: zod_1.z.number().int().optional(),
        preferred_hub_inventory_item_id: uuidStr.optional().nullable(),
        ...versionBodySchema.shape,
    })
        .safeParse(req.body);
    // Re-parse with full version schema for refine
    const versionParsed = versionBodySchema.safeParse(req.body);
    if (!id.success || !parsed.success || !versionParsed.success) {
        return res.status(400).json({
            error: versionParsed.success
                ? 'Dados inválidos'
                : versionParsed.error.issues[0]?.message || 'Dados inválidos',
        });
    }
    const clinicId = parsed.data.clinic_id;
    if (!(await canManageHospMedOrders(req.user?.id, clinicId))) {
        return res.status(403).json({ error: 'Sem permissão para editar a prescrição de internação' });
    }
    const hospCheck = await assertActiveHospitalization(id.data, clinicId);
    if (!hospCheck.ok)
        return res.status(hospCheck.status).json({ error: hospCheck.error });
    const staff = await resolveStaffForUser(clinicId, req.user?.id);
    const billingDefault = versionParsed.data.billing_mode ??
        (hospCheck.hosp.daily_includes_medication ? 'included' : 'charge');
    const { data: order, error: orderErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_orders')
        .insert({
        clinic_id: clinicId,
        hospitalization_id: id.data,
        status: 'active',
        prescribed_by_staff_id: versionParsed.data.prescribed_by_staff_id ?? staff?.id ?? null,
        sort_order: parsed.data.sort_order ?? 0,
        preferred_hub_inventory_item_id: parsed.data.preferred_hub_inventory_item_id ?? null,
    })
        .select('*')
        .single();
    if (orderErr)
        return res.status(500).json({ error: orderErr.message });
    const versionRow = versionInsertFromBody(clinicId, order.id, 1, { ...versionParsed.data, billing_mode: billingDefault }, staff?.id ?? null, null);
    const { data: version, error: vErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_order_versions')
        .insert(versionRow)
        .select('*')
        .single();
    if (vErr) {
        await supabase_1.supabaseAdmin.from('hub_hospitalization_med_orders').delete().eq('id', order.id);
        return res.status(500).json({ error: vErr.message });
    }
    await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_orders')
        .update({ current_version_id: version.id })
        .eq('id', order.id);
    try {
        await (0, hospitalizationMedPlanService_1.reconcileOrderMedDoses)({
            clinicId,
            hospitalizationId: id.data,
            orderId: order.id,
            orderStatus: 'active',
            version: {
                id: version.id,
                order_id: order.id,
                schedule_kind: version.schedule_kind,
                times: version.times ?? [],
                interval_hours: version.interval_hours == null ? null : Number(version.interval_hours),
                starts_at: version.starts_at,
                ends_at: version.ends_at,
            },
        });
    }
    catch (e) {
        console.error('reconcileOrderMedDoses', e);
    }
    const bundle = await loadOrderBundle(order.id, clinicId);
    return res.status(201).json(bundle);
};
exports.createHubHospitalizationMedOrder = createHubHospitalizationMedOrder;
const createHubHospitalizationMedOrderVersion = async (req, res) => {
    const hospId = uuidStr.safeParse(req.params.id);
    const orderId = uuidStr.safeParse(req.params.orderId);
    const clinicParsed = uuidStr.safeParse(req.body?.clinic_id);
    const versionParsed = versionBodySchema.safeParse(req.body);
    if (!hospId.success || !orderId.success || !clinicParsed.success || !versionParsed.success) {
        return res.status(400).json({
            error: versionParsed.success
                ? 'Dados inválidos'
                : versionParsed.error.issues[0]?.message || 'Dados inválidos',
        });
    }
    const clinicId = clinicParsed.data;
    if (!(await canManageHospMedOrders(req.user?.id, clinicId))) {
        return res.status(403).json({ error: 'Sem permissão para editar a prescrição de internação' });
    }
    if (!versionParsed.data.change_reason?.trim()) {
        return res.status(400).json({ error: 'Informe o motivo da alteração' });
    }
    const hospCheck = await assertActiveHospitalization(hospId.data, clinicId);
    if (!hospCheck.ok)
        return res.status(hospCheck.status).json({ error: hospCheck.error });
    const { data: order, error: oErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_orders')
        .select('*')
        .eq('id', orderId.data)
        .eq('hospitalization_id', hospId.data)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (oErr)
        return res.status(500).json({ error: oErr.message });
    if (!order)
        return res.status(404).json({ error: 'Ordem não encontrada' });
    if (order.status === 'cancelled' || order.status === 'completed') {
        return res.status(409).json({ error: 'Ordem encerrada' });
    }
    const { data: lastVer } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_order_versions')
        .select('version_no, id')
        .eq('order_id', orderId.data)
        .order('version_no', { ascending: false })
        .limit(1)
        .maybeSingle();
    const nextNo = (lastVer?.version_no ?? 0) + 1;
    const staff = await resolveStaffForUser(clinicId, req.user?.id);
    const { data: version, error: vErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_order_versions')
        .insert(versionInsertFromBody(clinicId, orderId.data, nextNo, versionParsed.data, staff?.id ?? null, lastVer?.id ?? null))
        .select('*')
        .single();
    if (vErr)
        return res.status(500).json({ error: vErr.message });
    await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_orders')
        .update({
        current_version_id: version.id,
        status: 'active',
        prescribed_by_staff_id: order.prescribed_by_staff_id ?? staff?.id ?? null,
    })
        .eq('id', orderId.data);
    try {
        await (0, hospitalizationMedPlanService_1.reconcileOrderMedDoses)({
            clinicId,
            hospitalizationId: hospId.data,
            orderId: orderId.data,
            orderStatus: 'active',
            version: {
                id: version.id,
                order_id: orderId.data,
                schedule_kind: version.schedule_kind,
                times: version.times ?? [],
                interval_hours: version.interval_hours == null ? null : Number(version.interval_hours),
                starts_at: version.starts_at,
                ends_at: version.ends_at,
            },
        });
    }
    catch (e) {
        console.error('reconcileOrderMedDoses', e);
    }
    const bundle = await loadOrderBundle(orderId.data, clinicId);
    return res.status(201).json(bundle);
};
exports.createHubHospitalizationMedOrderVersion = createHubHospitalizationMedOrderVersion;
const suspendHubHospitalizationMedOrder = async (req, res) => {
    const hospId = uuidStr.safeParse(req.params.id);
    const orderId = uuidStr.safeParse(req.params.orderId);
    const clinic_id = uuidStr.safeParse(req.body?.clinic_id);
    if (!hospId.success || !orderId.success || !clinic_id.success) {
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    if (!(await canManageHospMedOrders(req.user?.id, clinic_id.data))) {
        return res.status(403).json({ error: 'Sem permissão para editar a prescrição de internação' });
    }
    const hospCheck = await assertActiveHospitalization(hospId.data, clinic_id.data);
    if (!hospCheck.ok)
        return res.status(hospCheck.status).json({ error: hospCheck.error });
    const { data: order, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_orders')
        .update({ status: 'suspended' })
        .eq('id', orderId.data)
        .eq('hospitalization_id', hospId.data)
        .eq('clinic_id', clinic_id.data)
        .eq('status', 'active')
        .select('*')
        .maybeSingle();
    if (error)
        return res.status(500).json({ error: error.message });
    if (!order)
        return res.status(404).json({ error: 'Ordem ativa não encontrada' });
    const existingVersion = order.current_version_id
        ? (await supabase_1.supabaseAdmin
            .from('hub_hospitalization_med_order_versions')
            .select('id, order_id, schedule_kind, times, interval_hours, starts_at, ends_at')
            .eq('id', order.current_version_id)
            .maybeSingle()).data
        : null;
    if (existingVersion) {
        await (0, hospitalizationMedPlanService_1.reconcileOrderMedDoses)({
            clinicId: clinic_id.data,
            hospitalizationId: hospId.data,
            orderId: orderId.data,
            orderStatus: 'suspended',
            version: {
                id: existingVersion.id,
                order_id: orderId.data,
                schedule_kind: existingVersion.schedule_kind,
                times: existingVersion.times ?? [],
                interval_hours: existingVersion.interval_hours == null ? null : Number(existingVersion.interval_hours),
                starts_at: existingVersion.starts_at,
                ends_at: existingVersion.ends_at,
            },
        });
    }
    const bundle = await loadOrderBundle(orderId.data, clinic_id.data);
    return res.json(bundle);
};
exports.suspendHubHospitalizationMedOrder = suspendHubHospitalizationMedOrder;
const resumeHubHospitalizationMedOrder = async (req, res) => {
    const hospId = uuidStr.safeParse(req.params.id);
    const orderId = uuidStr.safeParse(req.params.orderId);
    const clinic_id = uuidStr.safeParse(req.body?.clinic_id);
    if (!hospId.success || !orderId.success || !clinic_id.success) {
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    if (!(await canManageHospMedOrders(req.user?.id, clinic_id.data))) {
        return res.status(403).json({ error: 'Sem permissão para editar a prescrição de internação' });
    }
    const hospCheck = await assertActiveHospitalization(hospId.data, clinic_id.data);
    if (!hospCheck.ok)
        return res.status(hospCheck.status).json({ error: hospCheck.error });
    const { data: order, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_orders')
        .update({ status: 'active' })
        .eq('id', orderId.data)
        .eq('hospitalization_id', hospId.data)
        .eq('clinic_id', clinic_id.data)
        .eq('status', 'suspended')
        .select('*')
        .maybeSingle();
    if (error)
        return res.status(500).json({ error: error.message });
    if (!order)
        return res.status(404).json({ error: 'Ordem suspensa não encontrada' });
    const { data: version } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_order_versions')
        .select('id, order_id, schedule_kind, times, interval_hours, starts_at, ends_at')
        .eq('id', order.current_version_id)
        .maybeSingle();
    if (version) {
        await (0, hospitalizationMedPlanService_1.reconcileOrderMedDoses)({
            clinicId: clinic_id.data,
            hospitalizationId: hospId.data,
            orderId: orderId.data,
            orderStatus: 'active',
            version: {
                id: version.id,
                order_id: orderId.data,
                schedule_kind: version.schedule_kind,
                times: version.times ?? [],
                interval_hours: version.interval_hours == null ? null : Number(version.interval_hours),
                starts_at: version.starts_at,
                ends_at: version.ends_at,
            },
        });
    }
    const bundle = await loadOrderBundle(orderId.data, clinic_id.data);
    return res.json(bundle);
};
exports.resumeHubHospitalizationMedOrder = resumeHubHospitalizationMedOrder;
const listHubHospitalizationMedDoses = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    const dateRaw = typeof req.query.date === 'string' ? req.query.date : (0, hospitalizationMedPlan_1.todayYmdSp)();
    if (!id.success || !clinic_id.success) {
        return res.status(400).json({ error: 'hospitalization id e clinic_id obrigatórios' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
        return res.status(400).json({ error: 'date inválida (YYYY-MM-DD)' });
    }
    try {
        await (0, hospitalizationMedPlanService_1.reconcileHospitalizationMedDoses)({
            clinicId: clinic_id.data,
            hospitalizationId: id.data,
        });
    }
    catch (e) {
        console.error('reconcileHospitalizationMedDoses', e);
    }
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_doses')
        .select(`
      *,
      version:hub_hospitalization_med_order_versions!order_version_id(
        medication_name, presentation, concentration, dose_value, dose_unit, route,
        schedule_kind, times, interval_hours, instructions, billing_mode, version_no,
        prescribed_by:hub_staff_members!prescribed_by_staff_id(id, full_name)
      ),
      order:hub_hospitalization_med_orders!order_id(id, status)
    `)
        .eq('hospitalization_id', id.data)
        .eq('clinic_id', clinic_id.data)
        .eq('task_date', dateRaw)
        .order('scheduled_for', { ascending: true });
    if (error)
        return res.status(500).json({ error: error.message });
    const now = new Date();
    const doses = (data ?? []).map((d) => {
        const version = d.version;
        return {
            ...d,
            overdue: (0, hospitalizationMedPlan_1.isDoseOverdue)(String(d.status), String(d.scheduled_for), now),
            dose_label: version
                ? (0, hospitalizationMedPlan_1.formatDoseLabel)(Number(version.dose_value), String(version.dose_unit ?? ''))
                : null,
        };
    });
    return res.json({ date: dateRaw, doses });
};
exports.listHubHospitalizationMedDoses = listHubHospitalizationMedDoses;
const completeHubHospitalizationMedDose = async (req, res) => {
    const hospId = uuidStr.safeParse(req.params.id);
    const doseId = uuidStr.safeParse(req.params.doseId);
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        outcome: zod_1.z.enum(['administered', 'not_administered']),
        administered_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
        notes: zod_1.z.string().trim().max(2000).optional().nullable(),
        reason_code: zod_1.z.enum(hospitalizationMedPlan_1.NOT_ADMIN_REASON_CODES).optional().nullable(),
        reason_notes: zod_1.z.string().trim().max(2000).optional().nullable(),
        hub_staff_member_id: uuidStr.optional().nullable(),
        idempotency_key: zod_1.z.string().trim().min(8).max(120).optional().nullable(),
    })
        .safeParse(req.body);
    if (!hospId.success || !doseId.success || !parsed.success) {
        return res.status(400).json({ error: 'Dados inválidos' });
    }
    const b = parsed.data;
    if (!(await canAdminHospMedDoses(req.user?.id, b.clinic_id))) {
        return res.status(403).json({ error: 'Sem permissão para registrar administração' });
    }
    const staff = b.hub_staff_member_id != null
        ? { id: b.hub_staff_member_id }
        : await resolveStaffForUser(b.clinic_id, req.user?.id);
    const { data, error } = await supabase_1.supabaseAdmin.rpc('hub_complete_hospitalization_med_dose', {
        p_dose_id: doseId.data,
        p_clinic_id: b.clinic_id,
        p_actor_user_id: req.user?.id ?? null,
        p_outcome: b.outcome,
        p_administered_at: b.administered_at ?? null,
        p_notes: b.notes ?? null,
        p_reason_code: b.reason_code ?? null,
        p_reason_notes: b.reason_notes ?? null,
        p_staff_member_id: staff?.id ?? null,
        p_idempotency_key: b.idempotency_key ?? null,
    });
    if (error) {
        const msg = error.message || 'Erro ao confirmar dose';
        if (msg.includes('já finalizada') || msg.includes('não está ativa') || msg.includes('cancelada')) {
            return res.status(409).json({ error: msg });
        }
        if (msg.includes('não encontrada') || msg.includes('Dose não encontrada')) {
            return res.status(404).json({ error: msg });
        }
        if (msg.includes('Motivo') || msg.includes('Observação') || msg.includes('outcome')) {
            return res.status(400).json({ error: msg });
        }
        return res.status(500).json({ error: msg });
    }
    if (b.outcome === 'administered' && data && !data.idempotent) {
        try {
            await syncComandaAfterMedDose(hospId.data, b.clinic_id);
        }
        catch (e) {
            console.error('syncComandaAfterMedDose', e);
        }
    }
    return res.json(data);
};
exports.completeHubHospitalizationMedDose = completeHubHospitalizationMedDose;
async function syncComandaAfterMedDose(hospitalizationId, clinicId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .select('hub_encounter_id')
        .eq('id', hospitalizationId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    const encId = data?.hub_encounter_id;
    if (!encId)
        return;
    const { syncOpenComandasAfterEncounterChargeableChange } = await Promise.resolve().then(() => __importStar(require('./hubComandasController')));
    await syncOpenComandasAfterEncounterChargeableChange(clinicId, encId);
}
const getHubHospitalizationMedPrintModel = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    const dateRaw = typeof req.query.date === 'string' ? req.query.date : (0, hospitalizationMedPlan_1.todayYmdSp)();
    if (!id.success || !clinic_id.success) {
        return res.status(400).json({ error: 'hospitalization id e clinic_id obrigatórios' });
    }
    try {
        await (0, hospitalizationMedPlanService_1.reconcileHospitalizationMedDoses)({
            clinicId: clinic_id.data,
            hospitalizationId: id.data,
        });
    }
    catch (e) {
        console.error('reconcileHospitalizationMedDoses', e);
    }
    const { data: hosp, error: hErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .select('id, status, admitted_at, hub_hospital_beds(code, label), hub_pets(name, species), hub_guardians(full_name)')
        .eq('id', id.data)
        .eq('clinic_id', clinic_id.data)
        .maybeSingle();
    if (hErr)
        return res.status(500).json({ error: hErr.message });
    if (!hosp)
        return res.status(404).json({ error: 'Internação não encontrada' });
    const ordersRes = await listOrdersForPrint(id.data, clinic_id.data);
    const { data: doses } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_doses')
        .select(`
      id, scheduled_for, status, plan_key, task_date,
      version:hub_hospitalization_med_order_versions!order_version_id(
        medication_name, dose_value, dose_unit, route, version_no, prescribed_at,
        prescribed_by:hub_staff_members!prescribed_by_staff_id(full_name)
      )
    `)
        .eq('hospitalization_id', id.data)
        .eq('clinic_id', clinic_id.data)
        .eq('task_date', dateRaw)
        .neq('status', 'cancelled')
        .order('scheduled_for', { ascending: true });
    const issued_at = new Date().toISOString();
    return res.json({
        issued_at,
        date: dateRaw,
        hospitalization: hosp,
        active_orders: ordersRes,
        doses: (doses ?? []).map((d) => {
            const version = d.version;
            return {
                ...d,
                dose_label: version
                    ? (0, hospitalizationMedPlan_1.formatDoseLabel)(Number(version.dose_value), String(version.dose_unit ?? ''))
                    : null,
            };
        }),
    });
};
exports.getHubHospitalizationMedPrintModel = getHubHospitalizationMedPrintModel;
async function listOrdersForPrint(hospitalizationId, clinicId) {
    const { data: orders } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_orders')
        .select('id, status, current_version_id')
        .eq('hospitalization_id', hospitalizationId)
        .eq('clinic_id', clinicId)
        .eq('status', 'active');
    const out = [];
    for (const o of orders ?? []) {
        if (!o.current_version_id)
            continue;
        const { data: v } = await supabase_1.supabaseAdmin
            .from('hub_hospitalization_med_order_versions')
            .select('id, version_no, medication_name, dose_value, dose_unit, route, schedule_kind, times, interval_hours, prescribed_at, prescribed_by:hub_staff_members!prescribed_by_staff_id(full_name)')
            .eq('id', o.current_version_id)
            .maybeSingle();
        if (!v)
            continue;
        out.push({
            order_id: o.id,
            ...v,
            dose_label: (0, hospitalizationMedPlan_1.formatDoseLabel)(Number(v.dose_value), String(v.dose_unit ?? '')),
        });
    }
    return out;
}
