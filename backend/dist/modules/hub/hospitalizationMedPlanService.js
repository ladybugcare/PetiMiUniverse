"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileHospitalizationMedDoses = reconcileHospitalizationMedDoses;
exports.reconcileOrderMedDoses = reconcileOrderMedDoses;
exports.closeHospitalizationMedPlan = closeHospitalizationMedPlan;
/**
 * Persistência do plano de medicação da internação: materializar/reconciliar doses
 * e encerrar pendentes na alta.
 */
const supabase_1 = require("../../config/supabase");
const hospitalizationMedPlan_1 = require("./hospitalizationMedPlan");
async function loadActiveVersions(hospitalizationId, clinicId) {
    const { data: orders, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_orders')
        .select('id, status, current_version_id')
        .eq('hospitalization_id', hospitalizationId)
        .eq('clinic_id', clinicId)
        .eq('status', 'active');
    if (error)
        throw new Error(error.message);
    const orderRows = (orders ?? []);
    const versionIds = orderRows
        .map((o) => o.current_version_id)
        .filter((id) => Boolean(id));
    if (versionIds.length === 0)
        return { orders: orderRows, versions: [] };
    const { data: versions, error: vErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_order_versions')
        .select('id, order_id, schedule_kind, times, interval_hours, starts_at, ends_at')
        .in('id', versionIds);
    if (vErr)
        throw new Error(vErr.message);
    const mapped = (versions ?? []).map((v) => ({
        id: v.id,
        order_id: v.order_id,
        schedule_kind: v.schedule_kind,
        times: Array.isArray(v.times) ? v.times : [],
        interval_hours: v.interval_hours == null ? null : Number(v.interval_hours),
        starts_at: v.starts_at,
        ends_at: v.ends_at,
    }));
    return { orders: orderRows, versions: mapped };
}
async function loadExistingDoses(hospitalizationId, clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_doses')
        .select('id, order_id, order_version_id, plan_key, task_date, scheduled_for, status')
        .eq('hospitalization_id', hospitalizationId)
        .eq('clinic_id', clinicId);
    if (error)
        throw new Error(error.message);
    return (data ?? []).map((d) => ({
        ...d,
        task_date: String(d.task_date).slice(0, 10),
    }));
}
async function applyReconcile(clinicId, hospitalizationId, plan) {
    if (plan.toCancel.length) {
        const byReason = new Map();
        for (const c of plan.toCancel) {
            const list = byReason.get(c.reason) ?? [];
            list.push(c.id);
            byReason.set(c.reason, list);
        }
        for (const [reason, ids] of byReason) {
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_hospitalization_med_doses')
                .update({ status: 'cancelled', cancelled_reason: reason })
                .in('id', ids)
                .eq('status', 'pending');
            if (error)
                throw new Error(error.message);
        }
    }
    for (const t of plan.toTouchVersion) {
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_hospitalization_med_doses')
            .update({ order_version_id: t.order_version_id })
            .eq('id', t.id)
            .eq('status', 'pending');
        if (error)
            throw new Error(error.message);
    }
    for (const r of plan.toReactivate) {
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_hospitalization_med_doses')
            .update({
            status: 'pending',
            cancelled_reason: null,
            order_version_id: r.order_version_id,
            scheduled_for: r.scheduled_for,
            not_administered_reason_code: null,
            not_administered_notes: null,
        })
            .eq('id', r.id)
            .eq('status', 'cancelled');
        if (error)
            throw new Error(error.message);
    }
    if (plan.toInsert.length) {
        const rows = plan.toInsert.map((s) => ({
            clinic_id: clinicId,
            hospitalization_id: hospitalizationId,
            order_id: s.order_id,
            order_version_id: s.order_version_id,
            task_date: s.task_date,
            scheduled_for: s.scheduled_for,
            plan_key: s.plan_key,
            status: 'pending',
        }));
        const { error } = await supabase_1.supabaseAdmin.from('hub_hospitalization_med_doses').upsert(rows, {
            onConflict: 'hospitalization_id,plan_key,task_date',
            ignoreDuplicates: true,
        });
        if (error)
            throw new Error(error.message);
    }
}
/** Materializa doses de hoje/amanhã para ordens ativas. No-op se internação não ativa. */
async function reconcileHospitalizationMedDoses(args) {
    const { data: hosp, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .select('id, status')
        .eq('id', args.hospitalizationId)
        .eq('clinic_id', args.clinicId)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    if (!hosp || hosp.status !== 'active')
        return;
    const { versions } = await loadActiveVersions(args.hospitalizationId, args.clinicId);
    const desired = versions.flatMap((v) => (0, hospitalizationMedPlan_1.buildDoseSpecsForVersion)(v, { now: args.now }));
    const existing = await loadExistingDoses(args.hospitalizationId, args.clinicId);
    // Também cancela pending de ordens não-ativas (suspensas etc.)
    const activeOrderIds = new Set(versions.map((v) => v.order_id));
    const plan = (0, hospitalizationMedPlan_1.diffMedDoses)({ desired, existing });
    for (const d of existing) {
        if (d.status === 'pending' && !activeOrderIds.has(d.order_id)) {
            if (!plan.toCancel.some((c) => c.id === d.id)) {
                plan.toCancel.push({ id: d.id, reason: 'order_suspended' });
            }
        }
    }
    await applyReconcile(args.clinicId, args.hospitalizationId, plan);
}
/** Reconcilia uma ordem específica (após criar/alterar versão). */
async function reconcileOrderMedDoses(args) {
    const existing = (await loadExistingDoses(args.hospitalizationId, args.clinicId)).filter((d) => d.order_id === args.orderId);
    if (args.orderStatus !== 'active') {
        const plan = (0, hospitalizationMedPlan_1.diffMedDoses)({
            desired: [],
            existing,
            suspendAllPending: true,
        });
        await applyReconcile(args.clinicId, args.hospitalizationId, plan);
        return;
    }
    const { data: hosp } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .select('status')
        .eq('id', args.hospitalizationId)
        .eq('clinic_id', args.clinicId)
        .maybeSingle();
    if (!hosp || hosp.status !== 'active')
        return;
    const desired = (0, hospitalizationMedPlan_1.buildDoseSpecsForVersion)(args.version, { now: args.now });
    const plan = (0, hospitalizationMedPlan_1.diffMedDoses)({ desired, existing });
    await applyReconcile(args.clinicId, args.hospitalizationId, plan);
}
/**
 * Alta / óbito / transferência / cancelamento:
 * cancela doses pending e marca ordens active→completed (ou cancelled).
 */
async function closeHospitalizationMedPlan(args) {
    const orderStatus = args.hospitalizationStatus === 'cancelled' ? 'cancelled' : 'completed';
    const { error: doseErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_doses')
        .update({ status: 'cancelled', cancelled_reason: 'discharge' })
        .eq('hospitalization_id', args.hospitalizationId)
        .eq('clinic_id', args.clinicId)
        .eq('status', 'pending');
    if (doseErr)
        throw new Error(doseErr.message);
    const { error: orderErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_med_orders')
        .update({ status: orderStatus })
        .eq('hospitalization_id', args.hospitalizationId)
        .eq('clinic_id', args.clinicId)
        .in('status', ['active', 'suspended']);
    if (orderErr)
        throw new Error(orderErr.message);
}
