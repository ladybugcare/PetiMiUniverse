/**
 * Chegada do Leva e Traz na clínica → check-in operacional do agendamento pai.
 *
 * Gatilho: coleta (`pickup`) ou desembarque (`clinic_return`) concluídos.
 * Não inicia atendimento profissional (encounter / in_service); só marca presença.
 */
import { supabaseAdmin } from '../../config/supabase';
import {
  BOARDING_APPOINTMENT_KINDS,
  isValidStatusTransition,
  modeFromAppointmentKind,
} from './boardingOperational';
import {
  GROOMING_EVENT_TITLES,
  GROOMING_STAGE_LABELS,
  appointmentStatusForGroomingStage,
  type GroomingStage,
} from './groomingStages';
import { notifyHubBoardingCheckin, notifyHubPetArrived } from './hubNotifyEvents';

const CLINICAL_GROUPS = new Set(['clinica', 'internacao', 'cirurgia']);
const BOARDING_GROUPS = new Set(['hotel', 'creche']);
const GROOMING_GROUP = 'banho_tosa';

const PARENT_TERMINAL = new Set(['cancelled', 'done', 'paid']);
const GROOMING_QUEUEABLE = new Set<GroomingStage>(['scheduled', 'checked_in']);
const CLINICAL_CHECKINABLE = new Set(['pending_confirm', 'confirmed']);
const BOARDING_CHECKINABLE = new Set(['reserved']);

export type PickupArrivalModule = 'grooming' | 'clinical' | 'boarding';

export type PickupArrivalResult = {
  parentAppointmentId: string | null;
  module: PickupArrivalModule | null;
  applied: boolean;
  reason?: string;
};

/** Condições de gatilho no status da parada L&T. */
export function shouldApplyPickupArrival(
  direction: string,
  newStatus: string | null | undefined,
  previousStatus?: string | null,
): boolean {
  if (!newStatus || newStatus !== 'completed') return false;
  if (previousStatus === 'completed') return false;
  return direction === 'pickup' || direction === 'clinic_return';
}

export function resolvePickupArrivalModule(opts: {
  appointmentKind?: string | null;
  serviceGroups?: readonly string[];
}): PickupArrivalModule | null {
  const kind = opts.appointmentKind ?? null;
  if (kind && BOARDING_APPOINTMENT_KINDS.includes(kind)) return 'boarding';

  const groups = opts.serviceGroups ?? [];
  if (groups.some((g) => CLINICAL_GROUPS.has(g))) return 'clinical';
  if (groups.some((g) => g === GROOMING_GROUP)) return 'grooming';
  if (groups.some((g) => BOARDING_GROUPS.has(g))) return 'boarding';
  return null;
}

export function canUpdateParentOnArrival(status: string | null | undefined): boolean {
  if (!status) return true;
  return !PARENT_TERMINAL.has(status);
}

export function canQueueGroomingFromArrival(stage: string | null | undefined): boolean {
  if (!stage) return true;
  return GROOMING_QUEUEABLE.has(stage as GroomingStage) || stage === 'queued';
}

export function canCheckInClinicalFromArrival(status: string | null | undefined): boolean {
  if (!status) return true;
  if (status === 'checked_in') return true; // idempotente
  return CLINICAL_CHECKINABLE.has(status);
}

export function canCheckInBoardingFromArrival(status: string | null | undefined): boolean {
  if (!status) return true;
  if (status === 'checked_in') return true;
  return BOARDING_CHECKINABLE.has(status);
}

type ParentAppt = {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  pet_id: string | null;
  guardian_id: string | null;
  hub_staff_member_id: string | null;
  hub_service_type_id: string | null;
  appointment_kind: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
};

async function loadServiceGroupsForAppointment(
  clinicId: string,
  appt: Pick<ParentAppt, 'id' | 'hub_service_type_id'>,
): Promise<string[]> {
  const groups: string[] = [];
  const typeIds = new Set<string>();
  if (appt.hub_service_type_id) typeIds.add(appt.hub_service_type_id);

  const { data: lines } = await supabaseAdmin
    .from('hub_appointment_services')
    .select('hub_service_type_id')
    .eq('hub_appointment_id', appt.id);
  for (const row of lines ?? []) {
    const id = (row as { hub_service_type_id?: string }).hub_service_type_id;
    if (id) typeIds.add(id);
  }

  if (typeIds.size === 0) return groups;

  const { data: types } = await supabaseAdmin
    .from('hub_service_types')
    .select('id, service_group')
    .eq('clinic_id', clinicId)
    .in('id', [...typeIds])
    .is('deleted_at', null);

  for (const t of types ?? []) {
    const g = String((t as { service_group?: string }).service_group ?? '').trim();
    if (g) groups.push(g);
  }
  return groups;
}

async function ensureGroomingQueued(opts: {
  clinicId: string;
  parent: ParentAppt;
  excludeUserIds?: readonly string[];
}): Promise<{ applied: boolean; sessionId: string | null }> {
  const { clinicId, parent } = opts;
  if (!parent.pet_id) return { applied: false, sessionId: null };

  const { data: existing } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select(
      'id, grooming_stage, checked_in_at, hub_appointment_id, unit_id, pet_id',
    )
    .eq('hub_appointment_id', parent.id)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const stage = String((existing as { grooming_stage: string }).grooming_stage);
    const sessionId = (existing as { id: string }).id;
    if (stage === 'queued') {
      return { applied: false, sessionId };
    }
    if (!GROOMING_QUEUEABLE.has(stage as GroomingStage)) {
      return { applied: false, sessionId };
    }

    const patch: Record<string, unknown> = {
      grooming_stage: 'queued',
      ...(!(existing as { checked_in_at?: string | null }).checked_in_at
        ? { checked_in_at: now }
        : {}),
    };
    await supabaseAdmin
      .from('hub_grooming_sessions')
      .update(patch)
      .eq('id', sessionId)
      .eq('clinic_id', clinicId);

    await supabaseAdmin.from('hub_grooming_events').insert({
      clinic_id: clinicId,
      hub_grooming_session_id: sessionId,
      event_type: 'stage_change',
      title: GROOMING_EVENT_TITLES.stage_change,
      body: `${GROOMING_STAGE_LABELS[stage as GroomingStage] ?? stage} → ${GROOMING_STAGE_LABELS.queued}`,
      payload: { from: stage, to: 'queued', source: 'pickup' },
    });

    const nextStatus = appointmentStatusForGroomingStage('queued');
    if (nextStatus && canUpdateParentOnArrival(parent.status)) {
      await supabaseAdmin
        .from('hub_appointments')
        .update({ status: nextStatus })
        .eq('id', parent.id)
        .eq('clinic_id', clinicId);
    }

    void notifyHubPetArrived({
      clinicId,
      unitId: parent.unit_id,
      petId: parent.pet_id,
      module: 'grooming',
      appointmentId: parent.id,
      excludeUserIds: opts.excludeUserIds,
    });

    return { applied: true, sessionId };
  }

  let tutorSnapshot: string | null = null;
  const { data: petRow } = await supabaseAdmin
    .from('hub_pets')
    .select('notes')
    .eq('id', parent.pet_id)
    .maybeSingle();
  tutorSnapshot = (petRow as { notes?: string } | null)?.notes ?? null;

  const { data: created, error } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .insert({
      clinic_id: clinicId,
      unit_id: parent.unit_id,
      pet_id: parent.pet_id,
      guardian_id: parent.guardian_id,
      hub_appointment_id: parent.id,
      hub_staff_member_id: parent.hub_staff_member_id,
      grooming_stage: 'queued',
      checked_in_at: now,
      tutor_notes_snapshot: tutorSnapshot,
    })
    .select('id')
    .single();
  if (error) throw error;

  const sessionId = (created as { id: string }).id;
  await supabaseAdmin.from('hub_grooming_events').insert({
    clinic_id: clinicId,
    hub_grooming_session_id: sessionId,
    event_type: 'check_in',
    title: GROOMING_EVENT_TITLES.check_in,
    body: parent.notes,
    payload: { source: 'pickup' },
  });

  const nextStatus = appointmentStatusForGroomingStage('queued');
  if (nextStatus && canUpdateParentOnArrival(parent.status)) {
    await supabaseAdmin
      .from('hub_appointments')
      .update({ status: nextStatus })
      .eq('id', parent.id)
      .eq('clinic_id', clinicId);
  }

  void notifyHubPetArrived({
    clinicId,
    unitId: parent.unit_id,
    petId: parent.pet_id,
    module: 'grooming',
    appointmentId: parent.id,
    excludeUserIds: opts.excludeUserIds,
  });

  return { applied: true, sessionId };
}

async function ensureClinicalCheckedIn(opts: {
  clinicId: string;
  parent: ParentAppt;
  excludeUserIds?: readonly string[];
}): Promise<boolean> {
  const { clinicId, parent } = opts;
  if (!canCheckInClinicalFromArrival(parent.status)) return false;
  if (PARENT_TERMINAL.has(parent.status)) return false;
  if (parent.status === 'checked_in') return false;

  await supabaseAdmin
    .from('hub_appointments')
    .update({ status: 'checked_in' })
    .eq('id', parent.id)
    .eq('clinic_id', clinicId);

  void notifyHubPetArrived({
    clinicId,
    unitId: parent.unit_id,
    petId: parent.pet_id,
    module: 'clinical',
    appointmentId: parent.id,
    excludeUserIds: opts.excludeUserIds,
  });

  return true;
}

async function ensureBoardingCheckedIn(opts: {
  clinicId: string;
  parent: ParentAppt;
  excludeUserIds?: readonly string[];
}): Promise<boolean> {
  const { clinicId, parent } = opts;
  if (!parent.pet_id) return false;

  const { data: existing } = await supabaseAdmin
    .from('hub_boarding_reservations')
    .select('id, status, unit_id, pet_id')
    .eq('hub_appointment_id', parent.id)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const status = String((existing as { status: string }).status);
    const reservationId = (existing as { id: string }).id;
    if (status === 'checked_in') return false;
    if (!canCheckInBoardingFromArrival(status)) return false;
    if (!isValidStatusTransition(status, 'checked_in')) return false;

    await supabaseAdmin
      .from('hub_boarding_reservations')
      .update({ status: 'checked_in', checked_in_at: now })
      .eq('id', reservationId)
      .eq('clinic_id', clinicId);

    if (canUpdateParentOnArrival(parent.status)) {
      await supabaseAdmin
        .from('hub_appointments')
        .update({ status: 'in_progress' })
        .eq('id', parent.id)
        .eq('clinic_id', clinicId);
    }

    void notifyHubBoardingCheckin({
      clinicId,
      unitId: (existing as { unit_id: string | null }).unit_id ?? parent.unit_id,
      petId: (existing as { pet_id: string | null }).pet_id ?? parent.pet_id,
      reservationId,
      excludeUserIds: opts.excludeUserIds,
    });
    return true;
  }

  const mode = modeFromAppointmentKind(parent.appointment_kind);
  const { data: created, error } = await supabaseAdmin
    .from('hub_boarding_reservations')
    .insert({
      clinic_id: clinicId,
      unit_id: parent.unit_id,
      pet_id: parent.pet_id,
      guardian_id: parent.guardian_id,
      hub_appointment_id: parent.id,
      mode,
      status: 'checked_in',
      expected_check_in: parent.starts_at,
      expected_check_out: parent.ends_at,
      checked_in_at: now,
    })
    .select('id')
    .single();
  if (error) throw error;

  if (canUpdateParentOnArrival(parent.status)) {
    await supabaseAdmin
      .from('hub_appointments')
      .update({ status: 'in_progress' })
      .eq('id', parent.id)
      .eq('clinic_id', clinicId);
  }

  void notifyHubBoardingCheckin({
    clinicId,
    unitId: parent.unit_id,
    petId: parent.pet_id,
    reservationId: (created as { id: string }).id,
    excludeUserIds: opts.excludeUserIds,
  });
  return true;
}

/**
 * Propaga chegada para o agendamento pai de uma perna `pickup_route`.
 */
export async function applyPickupArrivalToParent(opts: {
  clinicId: string;
  pickupAppointmentId: string;
  excludeUserIds?: readonly string[];
}): Promise<PickupArrivalResult> {
  const { clinicId, pickupAppointmentId } = opts;

  const { data: leg, error: legErr } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, parent_appointment_id, pet_id, unit_id')
    .eq('id', pickupAppointmentId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (legErr) throw legErr;
  if (!leg) {
    return { parentAppointmentId: null, module: null, applied: false, reason: 'leg_not_found' };
  }

  const parentId = (leg as { parent_appointment_id: string | null }).parent_appointment_id;
  if (!parentId) {
    void notifyHubPetArrived({
      clinicId,
      unitId: (leg as { unit_id: string | null }).unit_id,
      petId: (leg as { pet_id: string | null }).pet_id,
      module: null,
      appointmentId: pickupAppointmentId,
      excludeUserIds: opts.excludeUserIds,
    });
    return { parentAppointmentId: null, module: null, applied: false, reason: 'no_parent' };
  }

  const { data: parentRow, error: parentErr } = await supabaseAdmin
    .from('hub_appointments')
    .select(
      'id, clinic_id, unit_id, pet_id, guardian_id, hub_staff_member_id, hub_service_type_id, appointment_kind, status, starts_at, ends_at, notes',
    )
    .eq('id', parentId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (parentErr) throw parentErr;
  if (!parentRow) {
    return { parentAppointmentId: parentId, module: null, applied: false, reason: 'parent_not_found' };
  }

  const parent = parentRow as ParentAppt;
  if (!canUpdateParentOnArrival(parent.status)) {
    return {
      parentAppointmentId: parent.id,
      module: null,
      applied: false,
      reason: 'parent_terminal',
    };
  }

  const serviceGroups = await loadServiceGroupsForAppointment(clinicId, parent);
  const module = resolvePickupArrivalModule({
    appointmentKind: parent.appointment_kind,
    serviceGroups,
  });

  if (!module) {
    void notifyHubPetArrived({
      clinicId,
      unitId: parent.unit_id,
      petId: parent.pet_id,
      module: null,
      appointmentId: parent.id,
      excludeUserIds: opts.excludeUserIds,
    });
    return { parentAppointmentId: parent.id, module: null, applied: false, reason: 'unknown_module' };
  }

  if (module === 'grooming') {
    const r = await ensureGroomingQueued({
      clinicId,
      parent,
      excludeUserIds: opts.excludeUserIds,
    });
    return {
      parentAppointmentId: parent.id,
      module,
      applied: r.applied,
      reason: r.applied ? undefined : 'already_queued_or_past',
    };
  }

  if (module === 'clinical') {
    const applied = await ensureClinicalCheckedIn({
      clinicId,
      parent,
      excludeUserIds: opts.excludeUserIds,
    });
    return {
      parentAppointmentId: parent.id,
      module,
      applied,
      reason: applied ? undefined : 'already_checked_in_or_past',
    };
  }

  const applied = await ensureBoardingCheckedIn({
    clinicId,
    parent,
    excludeUserIds: opts.excludeUserIds,
  });
  return {
    parentAppointmentId: parent.id,
    module,
    applied,
    reason: applied ? undefined : 'already_checked_in_or_past',
  };
}

/**
 * Desembarque em lote (`clinic_return` → completed):
 * pets a bordo (ou já “Na clínica”) na mesma rota → chegada no módulo do pai.
 * Coletas ainda `in_transit` são marcadas `completed` para o board L&T ficar consistente.
 */
export async function applyPickupArrivalFromClinicReturn(opts: {
  clinicId: string;
  routeId: string;
  excludeUserIds?: readonly string[];
}): Promise<PickupArrivalResult[]> {
  const { clinicId, routeId } = opts;

  const { data: pickups, error } = await supabaseAdmin
    .from('hub_pickup_stops')
    .select('id, hub_appointment_id, status')
    .eq('hub_pickup_route_id', routeId)
    .eq('clinic_id', clinicId)
    .eq('direction', 'pickup')
    .in('status', ['in_transit', 'completed']);
  if (error) throw error;

  const results: PickupArrivalResult[] = [];
  const now = new Date().toISOString();

  for (const stop of pickups ?? []) {
    const s = stop as { id: string; hub_appointment_id: string | null; status: string };
    if (!s.hub_appointment_id) continue;

    if (s.status === 'in_transit') {
      await supabaseAdmin
        .from('hub_pickup_stops')
        .update({ status: 'completed', completed_at: now })
        .eq('id', s.id)
        .eq('clinic_id', clinicId);

      await supabaseAdmin
        .from('hub_appointments')
        .update({ status: 'done' })
        .eq('id', s.hub_appointment_id)
        .eq('clinic_id', clinicId);
    }

    try {
      const r = await applyPickupArrivalToParent({
        clinicId,
        pickupAppointmentId: s.hub_appointment_id,
        excludeUserIds: opts.excludeUserIds,
      });
      results.push(r);
    } catch (e) {
      console.error('[pickupArrival] clinic_return pet failed', s.hub_appointment_id, e);
      results.push({
        parentAppointmentId: null,
        module: null,
        applied: false,
        reason: 'error',
      });
    }
  }

  const { data: remainingStops } = await supabaseAdmin
    .from('hub_pickup_stops')
    .select('status')
    .eq('hub_pickup_route_id', routeId)
    .not('status', 'in', '("completed","failed")');
  if ((remainingStops ?? []).length === 0) {
    await supabaseAdmin
      .from('hub_pickup_routes')
      .update({ status: 'done' })
      .eq('id', routeId)
      .eq('clinic_id', clinicId);
  }

  return results;
}

/**
 * Entrada única a partir do PATCH/POST de parada L&T.
 * Falhas internas são logadas e não quebram o fluxo do motorista.
 */
export async function handlePickupStopArrival(opts: {
  clinicId: string;
  direction: string;
  newStatus: string | null | undefined;
  previousStatus?: string | null;
  pickupAppointmentId?: string | null;
  routeId?: string | null;
  excludeUserIds?: readonly string[];
}): Promise<void> {
  if (!shouldApplyPickupArrival(opts.direction, opts.newStatus, opts.previousStatus)) {
    return;
  }

  try {
    if (opts.direction === 'clinic_return') {
      if (!opts.routeId) return;
      await applyPickupArrivalFromClinicReturn({
        clinicId: opts.clinicId,
        routeId: opts.routeId,
        excludeUserIds: opts.excludeUserIds,
      });
      return;
    }

    if (opts.direction === 'pickup' && opts.pickupAppointmentId) {
      await applyPickupArrivalToParent({
        clinicId: opts.clinicId,
        pickupAppointmentId: opts.pickupAppointmentId,
        excludeUserIds: opts.excludeUserIds,
      });
    }
  } catch (e) {
    console.error('[pickupArrival] handlePickupStopArrival', e);
  }
}
