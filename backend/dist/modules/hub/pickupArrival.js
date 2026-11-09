"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldApplyPickupArrival = shouldApplyPickupArrival;
exports.resolvePickupArrivalModule = resolvePickupArrivalModule;
exports.canUpdateParentOnArrival = canUpdateParentOnArrival;
exports.canQueueGroomingFromArrival = canQueueGroomingFromArrival;
exports.canCheckInClinicalFromArrival = canCheckInClinicalFromArrival;
exports.canCheckInBoardingFromArrival = canCheckInBoardingFromArrival;
exports.applyPickupArrivalToParent = applyPickupArrivalToParent;
exports.applyPickupArrivalFromClinicReturn = applyPickupArrivalFromClinicReturn;
exports.handlePickupStopArrival = handlePickupStopArrival;
/**
 * Chegada do Leva e Traz na clínica → check-in operacional do agendamento pai.
 *
 * Gatilho: coleta (`pickup`) ou desembarque (`clinic_return`) concluídos.
 * Não inicia atendimento profissional (encounter / in_service); só marca presença.
 */
const supabase_1 = require("../../config/supabase");
const boardingOperational_1 = require("./boardingOperational");
const groomingStages_1 = require("./groomingStages");
const hubNotifyEvents_1 = require("./hubNotifyEvents");
const CLINICAL_GROUPS = new Set(['clinica', 'internacao', 'cirurgia']);
const BOARDING_GROUPS = new Set(['hotel', 'creche']);
const GROOMING_GROUP = 'banho_tosa';
const PARENT_TERMINAL = new Set(['cancelled', 'done', 'paid']);
const GROOMING_QUEUEABLE = new Set(['scheduled', 'checked_in']);
const CLINICAL_CHECKINABLE = new Set(['pending_confirm', 'confirmed']);
const BOARDING_CHECKINABLE = new Set(['reserved']);
/** Condições de gatilho no status da parada L&T. */
function shouldApplyPickupArrival(direction, newStatus, previousStatus) {
    if (!newStatus || newStatus !== 'completed')
        return false;
    if (previousStatus === 'completed')
        return false;
    return direction === 'pickup' || direction === 'clinic_return';
}
function resolvePickupArrivalModule(opts) {
    const kind = opts.appointmentKind ?? null;
    if (kind && boardingOperational_1.BOARDING_APPOINTMENT_KINDS.includes(kind))
        return 'boarding';
    const groups = opts.serviceGroups ?? [];
    if (groups.some((g) => CLINICAL_GROUPS.has(g)))
        return 'clinical';
    if (groups.some((g) => g === GROOMING_GROUP))
        return 'grooming';
    if (groups.some((g) => BOARDING_GROUPS.has(g)))
        return 'boarding';
    return null;
}
function canUpdateParentOnArrival(status) {
    if (!status)
        return true;
    return !PARENT_TERMINAL.has(status);
}
function canQueueGroomingFromArrival(stage) {
    if (!stage)
        return true;
    return GROOMING_QUEUEABLE.has(stage) || stage === 'queued';
}
function canCheckInClinicalFromArrival(status) {
    if (!status)
        return true;
    if (status === 'checked_in')
        return true; // idempotente
    return CLINICAL_CHECKINABLE.has(status);
}
function canCheckInBoardingFromArrival(status) {
    if (!status)
        return true;
    if (status === 'checked_in')
        return true;
    return BOARDING_CHECKINABLE.has(status);
}
async function loadServiceGroupsForAppointment(clinicId, appt) {
    const groups = [];
    const typeIds = new Set();
    if (appt.hub_service_type_id)
        typeIds.add(appt.hub_service_type_id);
    const { data: lines } = await supabase_1.supabaseAdmin
        .from('hub_appointment_services')
        .select('hub_service_type_id')
        .eq('hub_appointment_id', appt.id);
    for (const row of lines ?? []) {
        const id = row.hub_service_type_id;
        if (id)
            typeIds.add(id);
    }
    if (typeIds.size === 0)
        return groups;
    const { data: types } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, service_group')
        .eq('clinic_id', clinicId)
        .in('id', [...typeIds])
        .is('deleted_at', null);
    for (const t of types ?? []) {
        const g = String(t.service_group ?? '').trim();
        if (g)
            groups.push(g);
    }
    return groups;
}
async function ensureGroomingQueued(opts) {
    const { clinicId, parent } = opts;
    if (!parent.pet_id)
        return { applied: false, sessionId: null };
    const { data: existing } = await supabase_1.supabaseAdmin
        .from('hub_grooming_sessions')
        .select('id, grooming_stage, checked_in_at, hub_appointment_id, unit_id, pet_id')
        .eq('hub_appointment_id', parent.id)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    const now = new Date().toISOString();
    if (existing) {
        const stage = String(existing.grooming_stage);
        const sessionId = existing.id;
        if (stage === 'queued') {
            return { applied: false, sessionId };
        }
        if (!GROOMING_QUEUEABLE.has(stage)) {
            return { applied: false, sessionId };
        }
        const patch = {
            grooming_stage: 'queued',
            ...(!existing.checked_in_at
                ? { checked_in_at: now }
                : {}),
        };
        await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .update(patch)
            .eq('id', sessionId)
            .eq('clinic_id', clinicId);
        await supabase_1.supabaseAdmin.from('hub_grooming_events').insert({
            clinic_id: clinicId,
            hub_grooming_session_id: sessionId,
            event_type: 'stage_change',
            title: groomingStages_1.GROOMING_EVENT_TITLES.stage_change,
            body: `${groomingStages_1.GROOMING_STAGE_LABELS[stage] ?? stage} → ${groomingStages_1.GROOMING_STAGE_LABELS.queued}`,
            payload: { from: stage, to: 'queued', source: 'pickup' },
        });
        const nextStatus = (0, groomingStages_1.appointmentStatusForGroomingStage)('queued');
        if (nextStatus && canUpdateParentOnArrival(parent.status)) {
            await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update({ status: nextStatus })
                .eq('id', parent.id)
                .eq('clinic_id', clinicId);
        }
        void (0, hubNotifyEvents_1.notifyHubPetArrived)({
            clinicId,
            unitId: parent.unit_id,
            petId: parent.pet_id,
            module: 'grooming',
            appointmentId: parent.id,
            excludeUserIds: opts.excludeUserIds,
        });
        return { applied: true, sessionId };
    }
    let tutorSnapshot = null;
    const { data: petRow } = await supabase_1.supabaseAdmin
        .from('hub_pets')
        .select('notes')
        .eq('id', parent.pet_id)
        .maybeSingle();
    tutorSnapshot = petRow?.notes ?? null;
    const { data: created, error } = await supabase_1.supabaseAdmin
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
    if (error)
        throw error;
    const sessionId = created.id;
    await supabase_1.supabaseAdmin.from('hub_grooming_events').insert({
        clinic_id: clinicId,
        hub_grooming_session_id: sessionId,
        event_type: 'check_in',
        title: groomingStages_1.GROOMING_EVENT_TITLES.check_in,
        body: parent.notes,
        payload: { source: 'pickup' },
    });
    const nextStatus = (0, groomingStages_1.appointmentStatusForGroomingStage)('queued');
    if (nextStatus && canUpdateParentOnArrival(parent.status)) {
        await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .update({ status: nextStatus })
            .eq('id', parent.id)
            .eq('clinic_id', clinicId);
    }
    void (0, hubNotifyEvents_1.notifyHubPetArrived)({
        clinicId,
        unitId: parent.unit_id,
        petId: parent.pet_id,
        module: 'grooming',
        appointmentId: parent.id,
        excludeUserIds: opts.excludeUserIds,
    });
    return { applied: true, sessionId };
}
async function ensureClinicalCheckedIn(opts) {
    const { clinicId, parent } = opts;
    if (!canCheckInClinicalFromArrival(parent.status))
        return false;
    if (PARENT_TERMINAL.has(parent.status))
        return false;
    if (parent.status === 'checked_in')
        return false;
    await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .update({ status: 'checked_in' })
        .eq('id', parent.id)
        .eq('clinic_id', clinicId);
    void (0, hubNotifyEvents_1.notifyHubPetArrived)({
        clinicId,
        unitId: parent.unit_id,
        petId: parent.pet_id,
        module: 'clinical',
        appointmentId: parent.id,
        excludeUserIds: opts.excludeUserIds,
    });
    return true;
}
async function ensureBoardingCheckedIn(opts) {
    const { clinicId, parent } = opts;
    if (!parent.pet_id)
        return false;
    const { data: existing } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('id, status, unit_id, pet_id')
        .eq('hub_appointment_id', parent.id)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    const now = new Date().toISOString();
    if (existing) {
        const status = String(existing.status);
        const reservationId = existing.id;
        if (status === 'checked_in')
            return false;
        if (!canCheckInBoardingFromArrival(status))
            return false;
        if (!(0, boardingOperational_1.isValidStatusTransition)(status, 'checked_in'))
            return false;
        await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .update({ status: 'checked_in', checked_in_at: now })
            .eq('id', reservationId)
            .eq('clinic_id', clinicId);
        if (canUpdateParentOnArrival(parent.status)) {
            await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update({ status: 'in_progress' })
                .eq('id', parent.id)
                .eq('clinic_id', clinicId);
        }
        void (0, hubNotifyEvents_1.notifyHubBoardingCheckin)({
            clinicId,
            unitId: existing.unit_id ?? parent.unit_id,
            petId: existing.pet_id ?? parent.pet_id,
            reservationId,
            excludeUserIds: opts.excludeUserIds,
        });
        return true;
    }
    const mode = (0, boardingOperational_1.modeFromAppointmentKind)(parent.appointment_kind);
    const { data: created, error } = await supabase_1.supabaseAdmin
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
    if (error)
        throw error;
    if (canUpdateParentOnArrival(parent.status)) {
        await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .update({ status: 'in_progress' })
            .eq('id', parent.id)
            .eq('clinic_id', clinicId);
    }
    void (0, hubNotifyEvents_1.notifyHubBoardingCheckin)({
        clinicId,
        unitId: parent.unit_id,
        petId: parent.pet_id,
        reservationId: created.id,
        excludeUserIds: opts.excludeUserIds,
    });
    return true;
}
/**
 * Propaga chegada para o agendamento pai de uma perna `pickup_route`.
 */
async function applyPickupArrivalToParent(opts) {
    const { clinicId, pickupAppointmentId } = opts;
    const { data: leg, error: legErr } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, parent_appointment_id, pet_id, unit_id')
        .eq('id', pickupAppointmentId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (legErr)
        throw legErr;
    if (!leg) {
        return { parentAppointmentId: null, module: null, applied: false, reason: 'leg_not_found' };
    }
    const parentId = leg.parent_appointment_id;
    if (!parentId) {
        void (0, hubNotifyEvents_1.notifyHubPetArrived)({
            clinicId,
            unitId: leg.unit_id,
            petId: leg.pet_id,
            module: null,
            appointmentId: pickupAppointmentId,
            excludeUserIds: opts.excludeUserIds,
        });
        return { parentAppointmentId: null, module: null, applied: false, reason: 'no_parent' };
    }
    const { data: parentRow, error: parentErr } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, clinic_id, unit_id, pet_id, guardian_id, hub_staff_member_id, hub_service_type_id, appointment_kind, status, starts_at, ends_at, notes')
        .eq('id', parentId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (parentErr)
        throw parentErr;
    if (!parentRow) {
        return { parentAppointmentId: parentId, module: null, applied: false, reason: 'parent_not_found' };
    }
    const parent = parentRow;
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
        void (0, hubNotifyEvents_1.notifyHubPetArrived)({
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
async function applyPickupArrivalFromClinicReturn(opts) {
    const { clinicId, routeId } = opts;
    const { data: pickups, error } = await supabase_1.supabaseAdmin
        .from('hub_pickup_stops')
        .select('id, hub_appointment_id, status')
        .eq('hub_pickup_route_id', routeId)
        .eq('clinic_id', clinicId)
        .eq('direction', 'pickup')
        .in('status', ['in_transit', 'completed']);
    if (error)
        throw error;
    const results = [];
    const now = new Date().toISOString();
    for (const stop of pickups ?? []) {
        const s = stop;
        if (!s.hub_appointment_id)
            continue;
        if (s.status === 'in_transit') {
            await supabase_1.supabaseAdmin
                .from('hub_pickup_stops')
                .update({ status: 'completed', completed_at: now })
                .eq('id', s.id)
                .eq('clinic_id', clinicId);
            await supabase_1.supabaseAdmin
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
        }
        catch (e) {
            console.error('[pickupArrival] clinic_return pet failed', s.hub_appointment_id, e);
            results.push({
                parentAppointmentId: null,
                module: null,
                applied: false,
                reason: 'error',
            });
        }
    }
    const { data: remainingStops } = await supabase_1.supabaseAdmin
        .from('hub_pickup_stops')
        .select('status')
        .eq('hub_pickup_route_id', routeId)
        .not('status', 'in', '("completed","failed")');
    if ((remainingStops ?? []).length === 0) {
        await supabase_1.supabaseAdmin
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
async function handlePickupStopArrival(opts) {
    if (!shouldApplyPickupArrival(opts.direction, opts.newStatus, opts.previousStatus)) {
        return;
    }
    try {
        if (opts.direction === 'clinic_return') {
            if (!opts.routeId)
                return;
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
    }
    catch (e) {
        console.error('[pickupArrival] handlePickupStopArrival', e);
    }
}
