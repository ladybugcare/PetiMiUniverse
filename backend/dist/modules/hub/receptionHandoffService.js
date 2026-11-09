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
exports.syncReceptionHandoffsForPet = syncReceptionHandoffsForPet;
exports.collectReceptionPetIds = collectReceptionPetIds;
exports.syncReceptionUnit = syncReceptionUnit;
exports.resolveReceptionHandoff = resolveReceptionHandoff;
exports.handoffInDay = handoffInDay;
/**
 * Persiste handoffs da recepção a partir do estado atual dos módulos.
 * A leitura do quadro também reconcilia, para recuperar evento perdido.
 */
const supabase_1 = require("../../config/supabase");
const pickupArrival_1 = require("./pickupArrival");
const receptionCustody_1 = require("./receptionCustody");
const CLINICAL_GROUPS = new Set(['clinica', 'internacao', 'cirurgia']);
const GROOMING_GROUP = 'banho_tosa';
/** Pet já tem destino operacional no dia (não só leva e traz / perna de rota). */
function petHasDestinationService(appointments, typeById) {
    for (const a of appointments) {
        if (a.deleted_at || a.status === 'cancelled' || a.appointment_kind === 'pickup_route')
            continue;
        const group = a.hub_service_type_id ? typeById.get(a.hub_service_type_id)?.service_group : null;
        if (!group)
            continue;
        if ((0, pickupArrival_1.resolvePickupArrivalModule)({
            appointmentKind: a.appointment_kind,
            serviceGroups: [group],
        })) {
            return true;
        }
    }
    return false;
}
const STOP_COLUMNS = 'id, hub_appointment_id, direction, status, hub_pickup_route_id, completed_at, failure_outcome, failure_resolution, failure_reason, failed_at, return_stop_id';
/** Situação dos retornos à clínica ligados a falhas pendentes. */
async function loadReturnStops(clinicId, stops) {
    const ids = [
        ...new Set(stops
            .filter((s) => s.status === 'failed' && s.failure_resolution === 'pending')
            .map((s) => s.return_stop_id)
            .filter((id) => typeof id === 'string')),
    ];
    const out = new Map();
    for (const part of chunkIds(ids)) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_pickup_stops')
            .select('id, status, completed_at')
            .eq('clinic_id', clinicId)
            .in('id', part);
        if (error)
            throw new Error(error.message);
        for (const r of data ?? []) {
            out.set(r.id, {
                status: String(r.status),
                completed_at: r.completed_at ?? null,
            });
        }
    }
    return out;
}
function buildFailedReturns(appointments, stops, returnStops, nowIso) {
    const out = [];
    for (const stop of stops) {
        if (stop.status !== 'failed' || stop.failure_resolution !== 'pending')
            continue;
        const direction = stop.direction === 'pickup' ? 'pickup' : stop.direction === 'delivery' ? 'delivery' : null;
        if (!direction)
            continue;
        const leg = appointments.find((a) => a.id === stop.hub_appointment_id);
        if (!leg)
            continue;
        const parent = leg.parent_appointment_id
            ? appointments.find((a) => a.id === leg.parent_appointment_id) ?? null
            : null;
        const returnId = stop.return_stop_id ?? null;
        const failedAt = stop.failed_at ?? null;
        let returnedAt;
        if (!returnId) {
            returnedAt = failedAt || nowIso;
        }
        else {
            const ret = returnStops.get(returnId);
            if (!ret || ret.status === 'failed')
                returnedAt = failedAt || nowIso;
            else
                returnedAt = ret.status === 'completed' ? ret.completed_at || nowIso : null;
        }
        out.push({
            stop_id: stop.id,
            unit_id: parent?.unit_id ?? leg.unit_id ?? null,
            guardian_id: parent?.guardian_id ?? leg.guardian_id ?? null,
            direction,
            appointment_id: leg.id,
            route_id: stop.hub_pickup_route_id ?? null,
            failure_reason: stop.failure_reason ?? null,
            failed_at: failedAt,
            returned_at: returnedAt,
        });
    }
    return out;
}
function failureOutcomeOf(stop) {
    const v = stop?.failure_outcome;
    return v === 'no_pet' || v === 'return_to_clinic' ? v : null;
}
async function applyCustodySideEffects(clinicId, plan) {
    if (plan.closeGroomingSessionIds.length > 0) {
        const { closeGroomingSessionFromCustody } = await Promise.resolve().then(() => __importStar(require('./hubGroomingController')));
        for (const sessionId of [...new Set(plan.closeGroomingSessionIds)]) {
            await closeGroomingSessionFromCustody(clinicId, sessionId);
        }
    }
    if (plan.completeBoardingReservationIds.length > 0) {
        const { completeBoardingReservationCheckout } = await Promise.resolve().then(() => __importStar(require('./boardingCareService')));
        for (const reservationId of [...new Set(plan.completeBoardingReservationIds)]) {
            await completeBoardingReservationCheckout({ clinicId, reservationId });
        }
    }
}
async function persistReconcile(clinicId, reconciled) {
    const now = new Date().toISOString();
    if (reconciled.cancelIds.length > 0) {
        for (const part of chunkIds(reconciled.cancelIds)) {
            const { error } = await supabase_1.supabaseAdmin
                .from('hub_reception_handoffs')
                .update({ status: 'cancelled', resolved_at: now, resolution: 'superseded', updated_at: now })
                .in('id', part)
                .eq('status', 'open');
            if (error)
                throw new Error(error.message);
        }
    }
    for (const row of reconciled.refresh) {
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_reception_handoffs')
            .update({ context: row.context, updated_at: now })
            .eq('id', row.id)
            .eq('status', 'open');
        if (error)
            throw new Error(error.message);
    }
    if (reconciled.insert.length > 0) {
        const payload = reconciled.insert.map((h) => ({
            clinic_id: clinicId,
            unit_id: h.unit_id,
            pet_id: h.pet_id,
            guardian_id: h.guardian_id,
            kind: h.kind,
            source_type: h.source_type,
            source_id: h.source_id,
            status: 'open',
            context: h.context,
            opened_at: h.opened_at,
        }));
        for (let i = 0; i < payload.length; i += 50) {
            const slice = payload.slice(i, i + 50);
            const { error } = await supabase_1.supabaseAdmin.from('hub_reception_handoffs').insert(slice);
            if (error && !/duplicate|unique/i.test(error.message))
                throw new Error(error.message);
        }
    }
}
async function syncReceptionHandoffsForPet(clinicId, petId, dayYmd) {
    const day = dayYmd || (0, receptionCustody_1.todayYmdSaoPaulo)();
    const snap = await loadSnapshot(clinicId, petId, day);
    const plan = (0, receptionCustody_1.planCustody)(snap);
    await applyCustodySideEffects(clinicId, plan);
    const existing = await loadStored(clinicId, petId);
    const reconciled = (0, receptionCustody_1.reconcileHandoffRows)(existing, plan.handoffs, day, {
        preserveChegadaSourceIds: (0, receptionCustody_1.arrivalPendingAppointmentIds)(snap),
    });
    await persistReconcile(clinicId, reconciled);
}
async function loadStored(clinicId, petId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_reception_handoffs')
        .select('id, kind, source_type, source_id, status, resolved_at, context')
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId);
    if (error)
        throw new Error(error.message);
    return (data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        source_type: row.source_type,
        source_id: row.source_id,
        status: row.status,
        resolved_at: row.resolved_at ?? null,
        context: row.context ?? { label: '' },
    }));
}
async function loadSnapshot(clinicId, petId, dayYmd) {
    const { data: apptRows, error: apptErr } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, unit_id, guardian_id, pet_id, status, appointment_kind, starts_at, parent_appointment_id, hub_service_type_id')
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId)
        .is('deleted_at', null);
    if (apptErr)
        throw new Error(apptErr.message);
    const appointments = (apptRows ?? []);
    const typeIds = [...new Set(appointments.map((a) => a.hub_service_type_id).filter((id) => Boolean(id)))];
    const typeById = new Map();
    if (typeIds.length > 0) {
        const { data: types, error: tErr } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, service_group, name')
            .in('id', typeIds);
        if (tErr)
            throw new Error(tErr.message);
        for (const t of types ?? []) {
            typeById.set(t.id, {
                service_group: t.service_group ?? null,
                name: t.name ?? null,
            });
        }
    }
    const { data: sessions, error: sErr } = await supabase_1.supabaseAdmin
        .from('hub_grooming_sessions')
        .select('id, unit_id, guardian_id, hub_appointment_id, grooming_stage, ready_at')
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId)
        .is('deleted_at', null);
    if (sErr)
        throw new Error(sErr.message);
    const sessionIds = (sessions ?? []).map((s) => s.id);
    const extras = [];
    if (sessionIds.length > 0) {
        const { data: events, error: eErr } = await supabase_1.supabaseAdmin
            .from('hub_grooming_events')
            .select('id, hub_grooming_session_id, payload, body, created_at')
            .eq('clinic_id', clinicId)
            .eq('event_type', 'extra_request')
            .in('hub_grooming_session_id', sessionIds);
        if (eErr)
            throw new Error(eErr.message);
        const { data: launched, error: lErr } = await supabase_1.supabaseAdmin
            .from('hub_grooming_session_extras')
            .select('hub_grooming_session_id, hub_service_type_id')
            .eq('clinic_id', clinicId)
            .in('hub_grooming_session_id', sessionIds);
        if (lErr)
            throw new Error(lErr.message);
        const launchedKey = new Set((launched ?? []).map((row) => `${row.hub_grooming_session_id}:${row.hub_service_type_id}`));
        for (const ev of events ?? []) {
            const payload = (ev.payload ?? {});
            const typeId = typeof payload.hub_service_type_id === 'string' ? payload.hub_service_type_id : null;
            if (typeId && launchedKey.has(`${ev.hub_grooming_session_id}:${typeId}`))
                continue;
            const session = (sessions ?? []).find((s) => s.id === ev.hub_grooming_session_id);
            extras.push({
                event_id: ev.id,
                session_id: ev.hub_grooming_session_id,
                unit_id: session?.unit_id ?? null,
                guardian_id: session?.guardian_id ?? null,
                created_at: ev.created_at || new Date().toISOString(),
                hub_service_type_id: typeId,
                extra_name: (typeof ev.body === 'string' && ev.body.trim()) || payload.name || null,
            });
        }
    }
    const { data: encounters, error: encErr } = await supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select('id, unit_id, guardian_id, hub_appointment_id, status, completed_at')
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId)
        .is('deleted_at', null);
    if (encErr)
        throw new Error(encErr.message);
    const { data: hosps, error: hErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .select('id, guardian_id, hub_appointment_id, status, discharged_at')
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId);
    if (hErr)
        throw new Error(hErr.message);
    const { data: surgeries, error: surErr } = await supabase_1.supabaseAdmin
        .from('hub_surgeries')
        .select('id, status')
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId);
    if (surErr)
        throw new Error(surErr.message);
    const { data: boarding, error: bErr } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('id, unit_id, status, guardian_id, hub_appointment_id, mode, expected_check_out, handoff_ready_at')
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId)
        .is('deleted_at', null);
    if (bErr)
        throw new Error(bErr.message);
    const apptIds = appointments.map((a) => a.id);
    let stops = [];
    if (apptIds.length > 0) {
        const { data: stopRows, error: stErr } = await supabase_1.supabaseAdmin
            .from('hub_pickup_stops')
            .select(STOP_COLUMNS)
            .eq('clinic_id', clinicId)
            .in('hub_appointment_id', apptIds);
        if (stErr)
            throw new Error(stErr.message);
        stops = (stopRows ?? []);
    }
    const routeIds = [...new Set(stops.map((s) => s.hub_pickup_route_id).filter((id) => typeof id === 'string'))];
    const driverByRoute = new Map();
    if (routeIds.length > 0) {
        const { data: routes, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_pickup_routes')
            .select('id, driver_staff_id')
            .in('id', routeIds);
        if (rErr)
            throw new Error(rErr.message);
        for (const r of routes ?? [])
            driverByRoute.set(r.id, r.driver_staff_id ?? null);
    }
    const stopByAppt = new Map();
    for (const stop of stops) {
        const apptId = stop.hub_appointment_id;
        if (apptId)
            stopByAppt.set(apptId, stop);
    }
    const legs = appointments
        .filter((a) => a.appointment_kind === 'pickup_route' && a.parent_appointment_id)
        .map((a) => {
        const stop = stopByAppt.get(a.id);
        const routeId = stop?.hub_pickup_route_id ?? null;
        const direction = stop?.direction ?? null;
        return {
            parent_appointment_id: a.parent_appointment_id,
            appointment_status: a.status,
            direction,
            stop_status: stop?.status ?? null,
            route_id: routeId,
            driver_id: routeId ? driverByRoute.get(routeId) ?? null : null,
            failure_outcome: failureOutcomeOf(stop),
        };
    });
    const nowIso = new Date().toISOString();
    const failedReturns = buildFailedReturns(appointments, stops, await loadReturnStops(clinicId, stops), nowIso);
    const unresolvedArrivals = [];
    const hasDestination = petHasDestinationService(appointments, typeById);
    for (const stop of stops) {
        const direction = String(stop.direction || '');
        if (stop.status !== 'completed')
            continue;
        if (direction !== 'pickup' && direction !== 'clinic_return')
            continue;
        if (hasDestination)
            continue;
        const leg = appointments.find((a) => a.id === stop.hub_appointment_id);
        const parent = leg?.parent_appointment_id
            ? appointments.find((a) => a.id === leg.parent_appointment_id) ?? null
            : leg ?? null;
        const groups = parent?.hub_service_type_id
            ? [typeById.get(parent.hub_service_type_id)?.service_group].filter((g) => Boolean(g))
            : [];
        const moduleName = (0, pickupArrival_1.resolvePickupArrivalModule)({
            appointmentKind: parent?.appointment_kind,
            serviceGroups: groups,
        });
        if (moduleName)
            continue;
        unresolvedArrivals.push({
            stop_id: stop.id,
            unit_id: parent?.unit_id ?? leg?.unit_id ?? null,
            guardian_id: parent?.guardian_id ?? leg?.guardian_id ?? null,
            completed_at: stop.completed_at || new Date().toISOString(),
        });
    }
    return {
        petId,
        dayYmd,
        nowIso,
        appointments: appointments.map((a) => ({
            id: a.id,
            unit_id: a.unit_id,
            guardian_id: a.guardian_id,
            status: a.status,
            appointment_kind: a.appointment_kind,
            starts_at: a.starts_at,
            service_group: a.hub_service_type_id ? typeById.get(a.hub_service_type_id)?.service_group ?? null : null,
            service_name: a.hub_service_type_id ? typeById.get(a.hub_service_type_id)?.name ?? null : null,
            parent_appointment_id: a.parent_appointment_id,
        })),
        groomingSessions: (sessions ?? []).map((s) => ({
            id: s.id,
            unit_id: s.unit_id ?? null,
            guardian_id: s.guardian_id ?? null,
            hub_appointment_id: s.hub_appointment_id ?? null,
            grooming_stage: String(s.grooming_stage),
            ready_at: s.ready_at ?? null,
        })),
        extras,
        encounters: (encounters ?? []).map((e) => ({
            id: e.id,
            unit_id: e.unit_id ?? null,
            guardian_id: e.guardian_id ?? null,
            hub_appointment_id: e.hub_appointment_id ?? null,
            status: String(e.status),
            completed_at: e.completed_at ?? null,
        })),
        hospitalizations: (hosps ?? []).map((h) => {
            const linked = appointments.find((a) => a.id === h.hub_appointment_id);
            return {
                id: h.id,
                unit_id: linked?.unit_id ?? null,
                guardian_id: h.guardian_id ?? linked?.guardian_id ?? null,
                hub_appointment_id: h.hub_appointment_id ?? null,
                status: String(h.status),
                discharged_at: h.discharged_at ?? null,
            };
        }),
        surgeries: (surgeries ?? []).map((s) => ({ id: s.id, status: String(s.status) })),
        boarding: (boarding ?? []).map((b) => ({
            id: b.id,
            unit_id: b.unit_id ?? null,
            status: String(b.status),
            guardian_id: b.guardian_id ?? null,
            hub_appointment_id: b.hub_appointment_id ?? null,
            mode: b.mode ?? null,
            expected_check_out: b.expected_check_out ?? null,
            handoff_ready_at: b.handoff_ready_at ?? null,
        })),
        legs,
        unresolvedArrivals,
        failedReturns,
    };
}
function chunkIds(ids, size = 80) {
    const out = [];
    for (let i = 0; i < ids.length; i += size)
        out.push(ids.slice(i, i + size));
    return out;
}
async function selectByPetIds(table, clinicId, petIds, columns, opts) {
    if (petIds.length === 0)
        return [];
    const rows = [];
    for (const part of chunkIds(petIds)) {
        let q = supabase_1.supabaseAdmin.from(table).select(columns).eq('clinic_id', clinicId).in('pet_id', part);
        if (opts?.activeOnly)
            q = q.is('deleted_at', null);
        const { data, error } = await q;
        if (error)
            throw new Error(error.message);
        rows.push(...(data ?? []));
    }
    return rows;
}
async function collectReceptionPetIds(clinicId, unitId, dayYmd) {
    const { dayBoundsFromYmdSaoPaulo } = await Promise.resolve().then(() => __importStar(require('./boardingOperational')));
    const { from, to } = dayBoundsFromYmdSaoPaulo(dayYmd);
    const ids = new Set();
    const [appts, sessions, open, encounters, discharges, boardingOut] = await Promise.all([
        supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('pet_id')
            .eq('clinic_id', clinicId)
            .eq('unit_id', unitId)
            .is('deleted_at', null)
            .gte('starts_at', from)
            .lte('starts_at', to)
            .limit(200),
        supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('pet_id')
            .eq('clinic_id', clinicId)
            .eq('unit_id', unitId)
            .is('deleted_at', null)
            .in('grooming_stage', ['ready', 'delivered'])
            .limit(100),
        supabase_1.supabaseAdmin
            .from('hub_reception_handoffs')
            .select('pet_id')
            .eq('clinic_id', clinicId)
            .eq('unit_id', unitId)
            .eq('status', 'open')
            .limit(200),
        supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('pet_id')
            .eq('clinic_id', clinicId)
            .eq('unit_id', unitId)
            .eq('status', 'completed')
            .gte('completed_at', from)
            .lte('completed_at', to)
            .limit(100),
        supabase_1.supabaseAdmin
            .from('hub_hospitalizations')
            .select('pet_id')
            .eq('clinic_id', clinicId)
            .eq('status', 'discharged')
            .gte('discharged_at', from)
            .lte('discharged_at', to)
            .limit(100),
        supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('pet_id')
            .eq('clinic_id', clinicId)
            .eq('unit_id', unitId)
            .is('deleted_at', null)
            .in('status', ['checked_in', 'checkout_preparing', 'ready_for_handoff'])
            .or(`and(expected_check_out.gte.${from},expected_check_out.lte.${to}),status.eq.ready_for_handoff`)
            .limit(150),
    ]);
    for (const row of appts.data ?? [])
        if (row.pet_id)
            ids.add(row.pet_id);
    for (const row of sessions.data ?? [])
        if (row.pet_id)
            ids.add(row.pet_id);
    for (const row of open.data ?? [])
        if (row.pet_id)
            ids.add(row.pet_id);
    for (const row of encounters.data ?? [])
        if (row.pet_id)
            ids.add(row.pet_id);
    for (const row of discharges.data ?? [])
        if (row.pet_id)
            ids.add(row.pet_id);
    for (const row of boardingOut.data ?? [])
        if (row.pet_id)
            ids.add(row.pet_id);
    return [...ids].slice(0, 80);
}
function groupByPetId(rows) {
    const map = new Map();
    for (const row of rows) {
        const petId = row.pet_id;
        if (!petId)
            continue;
        const list = map.get(petId) ?? [];
        list.push(row);
        map.set(petId, list);
    }
    return map;
}
/** Reconcilia a unidade com poucas leituras em lote (evita timeout do quadro). */
async function syncReceptionUnit(clinicId, unitId, dayYmd) {
    const petIds = await collectReceptionPetIds(clinicId, unitId, dayYmd);
    if (petIds.length === 0)
        return;
    const [apptRows, sessionRows, encounterRows, hospRows, surgeryRows, boardingRows, storedRows] = await Promise.all([
        selectByPetIds('hub_appointments', clinicId, petIds, 'id, unit_id, guardian_id, pet_id, status, appointment_kind, starts_at, parent_appointment_id, hub_service_type_id', { activeOnly: true }),
        selectByPetIds('hub_grooming_sessions', clinicId, petIds, 'id, pet_id, unit_id, guardian_id, hub_appointment_id, grooming_stage, ready_at', {
            activeOnly: true,
        }),
        selectByPetIds('hub_encounters', clinicId, petIds, 'id, pet_id, unit_id, guardian_id, hub_appointment_id, status, completed_at', {
            activeOnly: true,
        }),
        selectByPetIds('hub_hospitalizations', clinicId, petIds, 'id, pet_id, unit_id, guardian_id, hub_appointment_id, status, discharged_at'),
        selectByPetIds('hub_surgeries', clinicId, petIds, 'id, pet_id, status'),
        selectByPetIds('hub_boarding_reservations', clinicId, petIds, 'id, pet_id, unit_id, status, guardian_id, hub_appointment_id, mode, expected_check_out, handoff_ready_at', { activeOnly: true }),
        selectByPetIds('hub_reception_handoffs', clinicId, petIds, 'id, pet_id, kind, source_type, source_id, status, resolved_at, context'),
    ]);
    const typeIds = [...new Set(apptRows.map((a) => a.hub_service_type_id).filter((id) => Boolean(id)))];
    const typeById = new Map();
    if (typeIds.length > 0) {
        for (const part of chunkIds(typeIds)) {
            const { data: types, error } = await supabase_1.supabaseAdmin.from('hub_service_types').select('id, service_group, name').in('id', part);
            if (error)
                throw new Error(error.message);
            for (const t of types ?? []) {
                typeById.set(t.id, {
                    service_group: t.service_group ?? null,
                    name: t.name ?? null,
                });
            }
        }
    }
    const sessionIds = sessionRows.map((s) => s.id);
    const apptIds = apptRows.map((a) => a.id);
    const [eventRows, launchedRows, stopRows] = await Promise.all([
        (async () => {
            if (sessionIds.length === 0)
                return [];
            const rows = [];
            for (const part of chunkIds(sessionIds)) {
                const { data, error } = await supabase_1.supabaseAdmin
                    .from('hub_grooming_events')
                    .select('id, hub_grooming_session_id, payload, body, created_at')
                    .eq('clinic_id', clinicId)
                    .eq('event_type', 'extra_request')
                    .in('hub_grooming_session_id', part);
                if (error)
                    throw new Error(error.message);
                rows.push(...(data ?? []));
            }
            return rows;
        })(),
        (async () => {
            if (sessionIds.length === 0)
                return [];
            const rows = [];
            for (const part of chunkIds(sessionIds)) {
                const { data, error } = await supabase_1.supabaseAdmin
                    .from('hub_grooming_session_extras')
                    .select('hub_grooming_session_id, hub_service_type_id')
                    .eq('clinic_id', clinicId)
                    .in('hub_grooming_session_id', part);
                if (error)
                    throw new Error(error.message);
                rows.push(...(data ?? []));
            }
            return rows;
        })(),
        (async () => {
            if (apptIds.length === 0)
                return [];
            const rows = [];
            for (const part of chunkIds(apptIds)) {
                const { data, error } = await supabase_1.supabaseAdmin
                    .from('hub_pickup_stops')
                    .select(STOP_COLUMNS)
                    .eq('clinic_id', clinicId)
                    .in('hub_appointment_id', part);
                if (error)
                    throw new Error(error.message);
                rows.push(...(data ?? []));
            }
            return rows;
        })(),
    ]);
    const routeIds = [...new Set(stopRows.map((s) => s.hub_pickup_route_id).filter((id) => typeof id === 'string'))];
    const driverByRoute = new Map();
    if (routeIds.length > 0) {
        for (const part of chunkIds(routeIds)) {
            const { data: routes, error } = await supabase_1.supabaseAdmin.from('hub_pickup_routes').select('id, driver_staff_id').in('id', part);
            if (error)
                throw new Error(error.message);
            for (const r of routes ?? [])
                driverByRoute.set(r.id, r.driver_staff_id ?? null);
        }
    }
    const apptsByPet = groupByPetId(apptRows);
    const sessionsByPet = groupByPetId(sessionRows);
    const encountersByPet = groupByPetId(encounterRows);
    const hospsByPet = groupByPetId(hospRows);
    const surgeriesByPet = groupByPetId(surgeryRows);
    const boardingByPet = groupByPetId(boardingRows);
    const storedByPet = groupByPetId(storedRows);
    const sessionsById = new Map(sessionRows.map((s) => [s.id, s]));
    const launchedKey = new Set(launchedRows.map((row) => `${row.hub_grooming_session_id}:${row.hub_service_type_id}`));
    const extrasByPet = new Map();
    for (const ev of eventRows) {
        const sessionId = ev.hub_grooming_session_id;
        const session = sessionsById.get(sessionId);
        if (!session)
            continue;
        const payload = (ev.payload ?? {});
        const typeId = typeof payload.hub_service_type_id === 'string' ? payload.hub_service_type_id : null;
        if (typeId && launchedKey.has(`${sessionId}:${typeId}`))
            continue;
        const list = extrasByPet.get(session.pet_id) ?? [];
        list.push({
            event_id: ev.id,
            session_id: sessionId,
            unit_id: session.unit_id,
            guardian_id: session.guardian_id,
            created_at: ev.created_at || new Date().toISOString(),
            hub_service_type_id: typeId,
            extra_name: (typeof ev.body === 'string' && ev.body.trim()) || payload.name || null,
        });
        extrasByPet.set(session.pet_id, list);
    }
    const stopByAppt = new Map();
    for (const stop of stopRows) {
        const apptId = stop.hub_appointment_id;
        if (apptId)
            stopByAppt.set(apptId, stop);
    }
    const nowIso = new Date().toISOString();
    const returnStops = await loadReturnStops(clinicId, stopRows);
    const closeSessionIds = [];
    const completeBoardingIds = [];
    const cancelIds = [];
    const inserts = [];
    const refreshRows = [];
    for (const petId of petIds) {
        const appointments = apptsByPet.get(petId) ?? [];
        const legs = appointments
            .filter((a) => a.appointment_kind === 'pickup_route' && a.parent_appointment_id)
            .map((a) => {
            const stop = stopByAppt.get(a.id);
            const routeId = stop?.hub_pickup_route_id ?? null;
            return {
                parent_appointment_id: a.parent_appointment_id,
                appointment_status: a.status,
                direction: stop?.direction ?? null,
                stop_status: stop?.status ?? null,
                route_id: routeId,
                driver_id: routeId ? driverByRoute.get(routeId) ?? null : null,
                failure_outcome: failureOutcomeOf(stop),
            };
        });
        const apptIdSet = new Set(appointments.map((a) => a.id));
        const failedReturns = buildFailedReturns(appointments, stopRows.filter((s) => apptIdSet.has(s.hub_appointment_id)), returnStops, nowIso);
        const unresolvedArrivals = [];
        const hasDestination = petHasDestinationService(appointments, typeById);
        for (const stop of stopRows) {
            const direction = String(stop.direction || '');
            if (stop.status !== 'completed')
                continue;
            if (direction !== 'pickup' && direction !== 'clinic_return')
                continue;
            if (hasDestination)
                continue;
            const leg = appointments.find((a) => a.id === stop.hub_appointment_id);
            if (!leg)
                continue;
            const parent = leg.parent_appointment_id
                ? appointments.find((a) => a.id === leg.parent_appointment_id) ?? null
                : leg;
            const groups = parent?.hub_service_type_id
                ? [typeById.get(parent.hub_service_type_id)?.service_group].filter((g) => Boolean(g))
                : [];
            const moduleName = (0, pickupArrival_1.resolvePickupArrivalModule)({
                appointmentKind: parent?.appointment_kind,
                serviceGroups: groups,
            });
            if (moduleName)
                continue;
            unresolvedArrivals.push({
                stop_id: stop.id,
                unit_id: parent?.unit_id ?? leg.unit_id ?? null,
                guardian_id: parent?.guardian_id ?? leg.guardian_id ?? null,
                completed_at: stop.completed_at || nowIso,
            });
        }
        const snap = {
            petId,
            dayYmd,
            nowIso,
            appointments: appointments.map((a) => ({
                id: a.id,
                unit_id: a.unit_id,
                guardian_id: a.guardian_id,
                status: a.status,
                appointment_kind: a.appointment_kind,
                starts_at: a.starts_at,
                service_group: a.hub_service_type_id ? typeById.get(a.hub_service_type_id)?.service_group ?? null : null,
                service_name: a.hub_service_type_id ? typeById.get(a.hub_service_type_id)?.name ?? null : null,
                parent_appointment_id: a.parent_appointment_id,
            })),
            groomingSessions: (sessionsByPet.get(petId) ?? []).map((s) => ({
                id: s.id,
                unit_id: s.unit_id,
                guardian_id: s.guardian_id,
                hub_appointment_id: s.hub_appointment_id,
                grooming_stage: String(s.grooming_stage),
                ready_at: s.ready_at,
            })),
            extras: extrasByPet.get(petId) ?? [],
            encounters: (encountersByPet.get(petId) ?? []).map((e) => ({
                id: e.id,
                unit_id: e.unit_id,
                guardian_id: e.guardian_id,
                hub_appointment_id: e.hub_appointment_id,
                status: String(e.status),
                completed_at: e.completed_at,
            })),
            hospitalizations: (hospsByPet.get(petId) ?? []).map((h) => {
                const linked = appointments.find((a) => a.id === h.hub_appointment_id);
                return {
                    id: h.id,
                    unit_id: h.unit_id ?? linked?.unit_id ?? null,
                    guardian_id: h.guardian_id ?? linked?.guardian_id ?? null,
                    hub_appointment_id: h.hub_appointment_id,
                    status: String(h.status),
                    discharged_at: h.discharged_at,
                };
            }),
            surgeries: (surgeriesByPet.get(petId) ?? []).map((s) => ({ id: s.id, status: String(s.status) })),
            boarding: (boardingByPet.get(petId) ?? []).map((b) => ({
                id: b.id,
                unit_id: b.unit_id,
                status: String(b.status),
                guardian_id: b.guardian_id,
                hub_appointment_id: b.hub_appointment_id,
                mode: b.mode ?? null,
                expected_check_out: b.expected_check_out,
                handoff_ready_at: b.handoff_ready_at,
            })),
            legs,
            unresolvedArrivals,
            failedReturns,
        };
        const plan = (0, receptionCustody_1.planCustody)(snap);
        closeSessionIds.push(...plan.closeGroomingSessionIds);
        completeBoardingIds.push(...plan.completeBoardingReservationIds);
        const existing = (storedByPet.get(petId) ?? []).map((row) => ({
            id: row.id,
            kind: row.kind,
            source_type: row.source_type,
            source_id: row.source_id,
            status: row.status,
            resolved_at: row.resolved_at,
            context: row.context ?? { label: '' },
        }));
        const reconciled = (0, receptionCustody_1.reconcileHandoffRows)(existing, plan.handoffs, dayYmd, {
            preserveChegadaSourceIds: (0, receptionCustody_1.arrivalPendingAppointmentIds)(snap),
        });
        inserts.push(...reconciled.insert);
        cancelIds.push(...reconciled.cancelIds);
        refreshRows.push(...reconciled.refresh);
    }
    await applyCustodySideEffects(clinicId, {
        handoffs: [],
        closeGroomingSessionIds: closeSessionIds,
        completeBoardingReservationIds: completeBoardingIds,
    });
    await persistReconcile(clinicId, { insert: inserts, cancelIds, refresh: refreshRows });
}
const ACTION_BY_KIND = {
    retirada_balcao: ['entreguei'],
    embarque: ['embarquei'],
    chegada: ['chegou'],
    autorizar_extra: ['autorizar', 'dispensar'],
    encaminhar: ['recebi'],
    lt_falha: ['tutor_busca', 'novo_lt'],
};
async function resolveReceptionHandoff(opts) {
    const { data: row, error } = await supabase_1.supabaseAdmin
        .from('hub_reception_handoffs')
        .select('id, clinic_id, pet_id, kind, source_type, source_id, status, context')
        .eq('id', opts.handoffId)
        .eq('clinic_id', opts.clinicId)
        .maybeSingle();
    if (error)
        return { ok: false, status: 500, error: error.message };
    if (!row)
        return { ok: false, status: 404, error: 'Tarefa não encontrada' };
    if (row.status !== 'open')
        return { ok: false, status: 409, error: 'Esta tarefa já foi concluída por outra pessoa.' };
    const allowed = ACTION_BY_KIND[String(row.kind)] ?? [];
    if (!allowed.includes(opts.action)) {
        return { ok: false, status: 400, error: 'Ação não corresponde a esta tarefa.' };
    }
    const now = new Date().toISOString();
    const { data: claimed, error: claimErr } = await supabase_1.supabaseAdmin
        .from('hub_reception_handoffs')
        .update({
        status: 'done',
        resolved_at: now,
        resolved_by_staff_id: opts.staffId,
        resolution: opts.action,
        updated_at: now,
    })
        .eq('id', opts.handoffId)
        .eq('status', 'open')
        .select('id')
        .maybeSingle();
    if (claimErr)
        return { ok: false, status: 500, error: claimErr.message };
    if (!claimed)
        return { ok: false, status: 409, error: 'Esta tarefa já foi concluída por outra pessoa.' };
    try {
        await applyResolution(opts.clinicId, row, opts.action, opts.staffId, opts.payload);
    }
    catch (e) {
        await supabase_1.supabaseAdmin
            .from('hub_reception_handoffs')
            .update({ status: 'open', resolved_at: null, resolved_by_staff_id: null, resolution: null, updated_at: new Date().toISOString() })
            .eq('id', opts.handoffId)
            .eq('resolution', opts.action);
        const message = e instanceof Error ? e.message : 'Erro ao concluir a tarefa';
        return { ok: false, status: 400, error: message };
    }
    if (row.pet_id) {
        await syncReceptionHandoffsForPet(opts.clinicId, row.pet_id);
    }
    return { ok: true };
}
async function applyResolution(clinicId, row, action, staffId, payload) {
    const ctx = row.context ?? { label: '' };
    if (action === 'dispensar' || action === 'recebi')
        return;
    if (action === 'tutor_busca' || action === 'novo_lt') {
        if (row.source_type !== 'pickup_stop')
            throw new Error('Tarefa sem parada de Leva e Traz.');
        const { resolveFailedPickupStop } = await Promise.resolve().then(() => __importStar(require('./hubPickupController')));
        await resolveFailedPickupStop({
            clinicId,
            stopId: row.source_id,
            actorStaffId: staffId,
            resolution: action === 'tutor_busca'
                ? { action }
                : {
                    action,
                    charge: Boolean(payload?.charge),
                    sale_amount: payload?.sale_amount ?? null,
                    starts_at: payload?.starts_at ?? null,
                },
        });
        return;
    }
    if (action === 'entreguei' || action === 'embarquei') {
        if (row.source_type === 'boarding_reservation') {
            const { completeBoardingReservationCheckout, loadReservation, loadUnitSettings, petHasOpenBoardingCharge } = await Promise.resolve().then(() => __importStar(require('./boardingCareService')));
            const reservation = await loadReservation(clinicId, row.source_id);
            if (reservation) {
                const settings = await loadUnitSettings(clinicId, reservation.unit_id);
                if (settings.block_exit_if_charge_pending) {
                    const pending = await petHasOpenBoardingCharge(clinicId, reservation.pet_id);
                    if (pending) {
                        throw new Error('Há cobrança em aberto no Caixa. Quite a comanda antes de confirmar a saída.');
                    }
                }
                await completeBoardingReservationCheckout({ clinicId, reservationId: row.source_id });
            }
        }
        if (row.pet_id) {
            const { closeReadyGroomingSessionsForPet } = await Promise.resolve().then(() => __importStar(require('./hubGroomingController')));
            await closeReadyGroomingSessionsForPet(clinicId, row.pet_id);
        }
        else if (row.source_type === 'grooming_session') {
            const { closeGroomingSessionFromCustody } = await Promise.resolve().then(() => __importStar(require('./hubGroomingController')));
            await closeGroomingSessionFromCustody(clinicId, row.source_id);
        }
        return;
    }
    if (action === 'chegou') {
        const appointmentId = ctx.appointment_id || (row.source_type === 'appointment' ? row.source_id : null);
        if (!appointmentId)
            throw new Error('Chegada sem agendamento.');
        const { data: appt, error } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id, status, hub_service_type_id')
            .eq('id', appointmentId)
            .eq('clinic_id', clinicId)
            .is('deleted_at', null)
            .maybeSingle();
        if (error)
            throw new Error(error.message);
        if (!appt)
            throw new Error('Agendamento não encontrado');
        if (appt.status === 'cancelled')
            throw new Error('Agendamento cancelado');
        const { data: st } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('service_group')
            .eq('id', appt.hub_service_type_id)
            .maybeSingle();
        const group = String(st?.service_group || '');
        if (group === GROOMING_GROUP) {
            const { ensureGroomingQueuedForAppointment } = await Promise.resolve().then(() => __importStar(require('./hubGroomingController')));
            const result = await ensureGroomingQueuedForAppointment(clinicId, appointmentId);
            if (!result.ok)
                throw new Error(result.error);
            return;
        }
        if (CLINICAL_GROUPS.has(group)) {
            if (appt.status === 'pending_confirm' || appt.status === 'confirmed') {
                const { error: upErr } = await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .update({ status: 'checked_in' })
                    .eq('id', appointmentId)
                    .eq('clinic_id', clinicId);
                if (upErr)
                    throw new Error(upErr.message);
            }
            return;
        }
        throw new Error('Este setor registra a chegada na própria operação.');
    }
    if (action === 'autorizar') {
        const sessionId = ctx.session_id;
        const typeId = ctx.hub_service_type_id;
        if (!sessionId || !typeId)
            throw new Error('Pedido sem serviço vinculado.');
        const { insertGroomingSessionExtra } = await Promise.resolve().then(() => __importStar(require('./hubGroomingDrawerController')));
        const result = await insertGroomingSessionExtra({
            clinicId,
            sessionId,
            hubServiceTypeId: typeId,
            staffId,
        });
        if (!result.ok)
            throw new Error(result.error);
    }
}
function handoffInDay(row, dayYmd) {
    // Chegada / saída prevista abertas só no dia do horário — evita card eterno.
    if (row.status === 'open') {
        if (row.kind === 'chegada' || row.kind === 'saida_prevista') {
            return (0, receptionCustody_1.ymdInSaoPaulo)(row.opened_at) === dayYmd;
        }
        return true;
    }
    const stamp = row.resolved_at || row.opened_at;
    return (0, receptionCustody_1.ymdInSaoPaulo)(stamp) === dayYmd;
}
