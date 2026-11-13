/**
 * Persistência do plano de medicação da internação: materializar/reconciliar doses
 * e encerrar pendentes na alta.
 */
import { supabaseAdmin } from '../../config/supabase';
import {
  buildDoseSpecsForVersion,
  diffMedDoses,
  type ExistingMedDose,
  type MedOrderVersionSnapshot,
} from './hospitalizationMedPlan';

type OrderRow = {
  id: string;
  status: string;
  current_version_id: string | null;
};

type VersionRow = MedOrderVersionSnapshot & {
  times: string[] | null;
  interval_hours: number | string | null;
};

async function loadActiveVersions(
  hospitalizationId: string,
  clinicId: string,
): Promise<{ orders: OrderRow[]; versions: MedOrderVersionSnapshot[] }> {
  const { data: orders, error } = await supabaseAdmin
    .from('hub_hospitalization_med_orders')
    .select('id, status, current_version_id')
    .eq('hospitalization_id', hospitalizationId)
    .eq('clinic_id', clinicId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  const orderRows = (orders ?? []) as OrderRow[];
  const versionIds = orderRows
    .map((o) => o.current_version_id)
    .filter((id): id is string => Boolean(id));
  if (versionIds.length === 0) return { orders: orderRows, versions: [] };

  const { data: versions, error: vErr } = await supabaseAdmin
    .from('hub_hospitalization_med_order_versions')
    .select('id, order_id, schedule_kind, times, interval_hours, starts_at, ends_at')
    .in('id', versionIds);
  if (vErr) throw new Error(vErr.message);

  const mapped: MedOrderVersionSnapshot[] = ((versions ?? []) as VersionRow[]).map((v) => ({
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

async function loadExistingDoses(
  hospitalizationId: string,
  clinicId: string,
): Promise<ExistingMedDose[]> {
  const { data, error } = await supabaseAdmin
    .from('hub_hospitalization_med_doses')
    .select('id, order_id, order_version_id, plan_key, task_date, scheduled_for, status')
    .eq('hospitalization_id', hospitalizationId)
    .eq('clinic_id', clinicId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ExistingMedDose[]).map((d) => ({
    ...d,
    task_date: String(d.task_date).slice(0, 10),
  }));
}

async function applyReconcile(
  clinicId: string,
  hospitalizationId: string,
  plan: ReturnType<typeof diffMedDoses>,
): Promise<void> {
  if (plan.toCancel.length) {
    const byReason = new Map<string, string[]>();
    for (const c of plan.toCancel) {
      const list = byReason.get(c.reason) ?? [];
      list.push(c.id);
      byReason.set(c.reason, list);
    }
    for (const [reason, ids] of byReason) {
      const { error } = await supabaseAdmin
        .from('hub_hospitalization_med_doses')
        .update({ status: 'cancelled', cancelled_reason: reason })
        .in('id', ids)
        .eq('status', 'pending');
      if (error) throw new Error(error.message);
    }
  }

  for (const t of plan.toTouchVersion) {
    const { error } = await supabaseAdmin
      .from('hub_hospitalization_med_doses')
      .update({ order_version_id: t.order_version_id })
      .eq('id', t.id)
      .eq('status', 'pending');
    if (error) throw new Error(error.message);
  }

  for (const r of plan.toReactivate) {
    const { error } = await supabaseAdmin
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
    if (error) throw new Error(error.message);
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
    const { error } = await supabaseAdmin.from('hub_hospitalization_med_doses').upsert(rows, {
      onConflict: 'hospitalization_id,plan_key,task_date',
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
  }
}

/** Materializa doses de hoje/amanhã para ordens ativas. No-op se internação não ativa. */
export async function reconcileHospitalizationMedDoses(args: {
  clinicId: string;
  hospitalizationId: string;
  now?: Date;
}): Promise<void> {
  const { data: hosp, error } = await supabaseAdmin
    .from('hub_hospitalizations')
    .select('id, status')
    .eq('id', args.hospitalizationId)
    .eq('clinic_id', args.clinicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!hosp || hosp.status !== 'active') return;

  const { versions } = await loadActiveVersions(args.hospitalizationId, args.clinicId);
  const desired = versions.flatMap((v) => buildDoseSpecsForVersion(v, { now: args.now }));
  const existing = await loadExistingDoses(args.hospitalizationId, args.clinicId);

  // Também cancela pending de ordens não-ativas (suspensas etc.)
  const activeOrderIds = new Set(versions.map((v) => v.order_id));
  const plan = diffMedDoses({ desired, existing });
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
export async function reconcileOrderMedDoses(args: {
  clinicId: string;
  hospitalizationId: string;
  orderId: string;
  version: MedOrderVersionSnapshot;
  orderStatus: string;
  now?: Date;
}): Promise<void> {
  const existing = (await loadExistingDoses(args.hospitalizationId, args.clinicId)).filter(
    (d) => d.order_id === args.orderId,
  );

  if (args.orderStatus !== 'active') {
    const plan = diffMedDoses({
      desired: [],
      existing,
      suspendAllPending: true,
    });
    await applyReconcile(args.clinicId, args.hospitalizationId, plan);
    return;
  }

  const { data: hosp } = await supabaseAdmin
    .from('hub_hospitalizations')
    .select('status')
    .eq('id', args.hospitalizationId)
    .eq('clinic_id', args.clinicId)
    .maybeSingle();
  if (!hosp || hosp.status !== 'active') return;

  const desired = buildDoseSpecsForVersion(args.version, { now: args.now });
  const plan = diffMedDoses({ desired, existing });
  await applyReconcile(args.clinicId, args.hospitalizationId, plan);
}

/**
 * Alta / óbito / transferência / cancelamento:
 * cancela doses pending e marca ordens active→completed (ou cancelled).
 */
export async function closeHospitalizationMedPlan(args: {
  clinicId: string;
  hospitalizationId: string;
  hospitalizationStatus: 'discharged' | 'death' | 'transferred' | 'cancelled';
}): Promise<void> {
  const orderStatus = args.hospitalizationStatus === 'cancelled' ? 'cancelled' : 'completed';

  const { error: doseErr } = await supabaseAdmin
    .from('hub_hospitalization_med_doses')
    .update({ status: 'cancelled', cancelled_reason: 'discharge' })
    .eq('hospitalization_id', args.hospitalizationId)
    .eq('clinic_id', args.clinicId)
    .eq('status', 'pending');
  if (doseErr) throw new Error(doseErr.message);

  const { error: orderErr } = await supabaseAdmin
    .from('hub_hospitalization_med_orders')
    .update({ status: orderStatus })
    .eq('hospitalization_id', args.hospitalizationId)
    .eq('clinic_id', args.clinicId)
    .in('status', ['active', 'suspended']);
  if (orderErr) throw new Error(orderErr.message);
}
