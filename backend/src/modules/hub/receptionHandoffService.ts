/**
 * Persiste handoffs da recepção a partir do estado atual dos módulos.
 * A leitura do quadro também reconcilia, para recuperar evento perdido.
 */
import { supabaseAdmin } from '../../config/supabase';
import { resolvePickupArrivalModule } from './pickupArrival';
import {
  arrivalPendingAppointmentIds,
  planCustody,
  reconcileHandoffRows,
  todayYmdSaoPaulo,
  ymdInSaoPaulo,
  type CustodySnapshot,
  type DesiredHandoff,
  type ReceptionContext,
  type StoredHandoff,
} from './receptionCustody';

const CLINICAL_GROUPS = new Set(['clinica', 'internacao', 'cirurgia']);
const GROOMING_GROUP = 'banho_tosa';

type ApptRow = {
  id: string;
  unit_id: string | null;
  guardian_id: string | null;
  pet_id: string | null;
  status: string;
  appointment_kind: string | null;
  starts_at: string | null;
  parent_appointment_id: string | null;
  hub_service_type_id: string | null;
  deleted_at?: string | null;
};

/** Pet já tem destino operacional no dia (não só leva e traz / perna de rota). */
function petHasDestinationService(
  appointments: ApptRow[],
  typeById: Map<string, { service_group?: string | null }>,
): boolean {
  for (const a of appointments) {
    if (a.deleted_at || a.status === 'cancelled' || a.appointment_kind === 'pickup_route') continue;
    const group = a.hub_service_type_id ? typeById.get(a.hub_service_type_id)?.service_group : null;
    if (!group) continue;
    if (
      resolvePickupArrivalModule({
        appointmentKind: a.appointment_kind,
        serviceGroups: [group],
      })
    ) {
      return true;
    }
  }
  return false;
}

const STOP_COLUMNS =
  'id, hub_appointment_id, direction, status, hub_pickup_route_id, completed_at, failure_outcome, failure_resolution, failure_reason, failed_at, return_stop_id';

/** Situação dos retornos à clínica ligados a falhas pendentes. */
async function loadReturnStops(
  clinicId: string,
  stops: Array<Record<string, unknown>>,
): Promise<Map<string, { status: string; completed_at: string | null }>> {
  const ids = [
    ...new Set(
      stops
        .filter((s) => s.status === 'failed' && s.failure_resolution === 'pending')
        .map((s) => s.return_stop_id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];
  const out = new Map<string, { status: string; completed_at: string | null }>();
  for (const part of chunkIds(ids)) {
    const { data, error } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('id, status, completed_at')
      .eq('clinic_id', clinicId)
      .in('id', part);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      out.set(r.id as string, {
        status: String(r.status),
        completed_at: (r.completed_at as string | null) ?? null,
      });
    }
  }
  return out;
}

function buildFailedReturns(
  appointments: ApptRow[],
  stops: Array<Record<string, unknown>>,
  returnStops: Map<string, { status: string; completed_at: string | null }>,
  nowIso: string,
): NonNullable<CustodySnapshot['failedReturns']> {
  const out: NonNullable<CustodySnapshot['failedReturns']> = [];
  for (const stop of stops) {
    if (stop.status !== 'failed' || stop.failure_resolution !== 'pending') continue;
    const direction = stop.direction === 'pickup' ? 'pickup' : stop.direction === 'delivery' ? 'delivery' : null;
    if (!direction) continue;
    const leg = appointments.find((a) => a.id === stop.hub_appointment_id);
    if (!leg) continue;
    const parent = leg.parent_appointment_id
      ? appointments.find((a) => a.id === leg.parent_appointment_id) ?? null
      : null;
    const returnId = (stop.return_stop_id as string | null) ?? null;
    const failedAt = (stop.failed_at as string | null) ?? null;
    let returnedAt: string | null;
    if (!returnId) {
      returnedAt = failedAt || nowIso;
    } else {
      const ret = returnStops.get(returnId);
      if (!ret || ret.status === 'failed') returnedAt = failedAt || nowIso;
      else returnedAt = ret.status === 'completed' ? ret.completed_at || nowIso : null;
    }
    out.push({
      stop_id: stop.id as string,
      unit_id: parent?.unit_id ?? leg.unit_id ?? null,
      guardian_id: parent?.guardian_id ?? leg.guardian_id ?? null,
      direction,
      appointment_id: leg.id,
      route_id: (stop.hub_pickup_route_id as string | null) ?? null,
      failure_reason: (stop.failure_reason as string | null) ?? null,
      failed_at: failedAt,
      returned_at: returnedAt,
    });
  }
  return out;
}

function failureOutcomeOf(stop: Record<string, unknown> | undefined): 'no_pet' | 'return_to_clinic' | null {
  const v = stop?.failure_outcome;
  return v === 'no_pet' || v === 'return_to_clinic' ? v : null;
}

async function applyCustodySideEffects(
  clinicId: string,
  plan: ReturnType<typeof planCustody>,
): Promise<void> {
  if (plan.closeGroomingSessionIds.length > 0) {
    const { closeGroomingSessionFromCustody } = await import('./hubGroomingController');
    for (const sessionId of [...new Set(plan.closeGroomingSessionIds)]) {
      await closeGroomingSessionFromCustody(clinicId, sessionId);
    }
  }
  if (plan.completeBoardingReservationIds.length > 0) {
    const { completeBoardingReservationCheckout } = await import('./boardingCareService');
    for (const reservationId of [...new Set(plan.completeBoardingReservationIds)]) {
      await completeBoardingReservationCheckout({ clinicId, reservationId });
    }
  }
}

async function persistReconcile(
  clinicId: string,
  reconciled: ReturnType<typeof reconcileHandoffRows>,
): Promise<void> {
  const now = new Date().toISOString();
  if (reconciled.cancelIds.length > 0) {
    for (const part of chunkIds(reconciled.cancelIds)) {
      const { error } = await supabaseAdmin
        .from('hub_reception_handoffs')
        .update({ status: 'cancelled', resolved_at: now, resolution: 'superseded', updated_at: now })
        .in('id', part)
        .eq('status', 'open');
      if (error) throw new Error(error.message);
    }
  }
  for (const row of reconciled.refresh) {
    const { error } = await supabaseAdmin
      .from('hub_reception_handoffs')
      .update({ context: row.context, updated_at: now })
      .eq('id', row.id)
      .eq('status', 'open');
    if (error) throw new Error(error.message);
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
      status: 'open' as const,
      context: h.context,
      opened_at: h.opened_at,
    }));
    for (let i = 0; i < payload.length; i += 50) {
      const slice = payload.slice(i, i + 50);
      const { error } = await supabaseAdmin.from('hub_reception_handoffs').insert(slice);
      if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    }
  }
}

export async function syncReceptionHandoffsForPet(clinicId: string, petId: string, dayYmd?: string): Promise<void> {
  const day = dayYmd || todayYmdSaoPaulo();
  const snap = await loadSnapshot(clinicId, petId, day);
  const plan = planCustody(snap);
  await applyCustodySideEffects(clinicId, plan);
  const existing = await loadStored(clinicId, petId);
  const reconciled = reconcileHandoffRows(existing, plan.handoffs, day, {
    preserveChegadaSourceIds: arrivalPendingAppointmentIds(snap),
  });
  await persistReconcile(clinicId, reconciled);
}

async function loadStored(clinicId: string, petId: string): Promise<StoredHandoff[]> {
  const { data, error } = await supabaseAdmin
    .from('hub_reception_handoffs')
    .select('id, kind, source_type, source_id, status, resolved_at, context')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as StoredHandoff['kind'],
    source_type: row.source_type as string,
    source_id: row.source_id as string,
    status: row.status as StoredHandoff['status'],
    resolved_at: (row.resolved_at as string | null) ?? null,
    context: (row.context as ReceptionContext) ?? { label: '' },
  }));
}

async function loadSnapshot(clinicId: string, petId: string, dayYmd: string): Promise<CustodySnapshot> {
  const { data: apptRows, error: apptErr } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, unit_id, guardian_id, pet_id, status, appointment_kind, starts_at, parent_appointment_id, hub_service_type_id')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null);
  if (apptErr) throw new Error(apptErr.message);
  const appointments = (apptRows ?? []) as ApptRow[];
  const typeIds = [...new Set(appointments.map((a) => a.hub_service_type_id).filter((id): id is string => Boolean(id)))];
  const typeById = new Map<string, { service_group: string | null; name: string | null }>();
  if (typeIds.length > 0) {
    const { data: types, error: tErr } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, service_group, name')
      .in('id', typeIds);
    if (tErr) throw new Error(tErr.message);
    for (const t of types ?? []) {
      typeById.set(t.id as string, {
        service_group: (t.service_group as string | null) ?? null,
        name: (t.name as string | null) ?? null,
      });
    }
  }

  const { data: sessions, error: sErr } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select('id, unit_id, guardian_id, hub_appointment_id, grooming_stage, ready_at')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null);
  if (sErr) throw new Error(sErr.message);
  const sessionIds = (sessions ?? []).map((s) => s.id as string);

  const extras: CustodySnapshot['extras'] = [];
  if (sessionIds.length > 0) {
    const { data: events, error: eErr } = await supabaseAdmin
      .from('hub_grooming_events')
      .select('id, hub_grooming_session_id, payload, body, created_at')
      .eq('clinic_id', clinicId)
      .eq('event_type', 'extra_request')
      .in('hub_grooming_session_id', sessionIds);
    if (eErr) throw new Error(eErr.message);
    const { data: launched, error: lErr } = await supabaseAdmin
      .from('hub_grooming_session_extras')
      .select('hub_grooming_session_id, hub_service_type_id')
      .eq('clinic_id', clinicId)
      .in('hub_grooming_session_id', sessionIds);
    if (lErr) throw new Error(lErr.message);
    const launchedKey = new Set(
      (launched ?? []).map((row) => `${row.hub_grooming_session_id}:${row.hub_service_type_id}`),
    );
    for (const ev of events ?? []) {
      const payload = (ev.payload ?? {}) as { hub_service_type_id?: string; name?: string };
      const typeId = typeof payload.hub_service_type_id === 'string' ? payload.hub_service_type_id : null;
      if (typeId && launchedKey.has(`${ev.hub_grooming_session_id}:${typeId}`)) continue;
      const session = (sessions ?? []).find((s) => s.id === ev.hub_grooming_session_id);
      extras.push({
        event_id: ev.id as string,
        session_id: ev.hub_grooming_session_id as string,
        unit_id: (session?.unit_id as string | null) ?? null,
        guardian_id: (session?.guardian_id as string | null) ?? null,
        created_at: (ev.created_at as string) || new Date().toISOString(),
        hub_service_type_id: typeId,
        extra_name: (typeof ev.body === 'string' && ev.body.trim()) || payload.name || null,
      });
    }
  }

  const { data: encounters, error: encErr } = await supabaseAdmin
    .from('hub_encounters')
    .select('id, unit_id, guardian_id, hub_appointment_id, status, completed_at')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null);
  if (encErr) throw new Error(encErr.message);

  const { data: hosps, error: hErr } = await supabaseAdmin
    .from('hub_hospitalizations')
    .select('id, guardian_id, hub_appointment_id, status, discharged_at')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId);
  if (hErr) throw new Error(hErr.message);

  const { data: surgeries, error: surErr } = await supabaseAdmin
    .from('hub_surgeries')
    .select('id, status')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId);
  if (surErr) throw new Error(surErr.message);

  const { data: boarding, error: bErr } = await supabaseAdmin
    .from('hub_boarding_reservations')
    .select('id, unit_id, status, guardian_id, hub_appointment_id, mode, expected_check_out, handoff_ready_at')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null);
  if (bErr) throw new Error(bErr.message);

  const apptIds = appointments.map((a) => a.id);
  let stops: Array<Record<string, unknown>> = [];
  if (apptIds.length > 0) {
    const { data: stopRows, error: stErr } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select(STOP_COLUMNS)
      .eq('clinic_id', clinicId)
      .in('hub_appointment_id', apptIds);
    if (stErr) throw new Error(stErr.message);
    stops = (stopRows ?? []) as Array<Record<string, unknown>>;
  }
  const routeIds = [...new Set(stops.map((s) => s.hub_pickup_route_id).filter((id): id is string => typeof id === 'string'))];
  const driverByRoute = new Map<string, string | null>();
  if (routeIds.length > 0) {
    const { data: routes, error: rErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .select('id, driver_staff_id')
      .in('id', routeIds);
    if (rErr) throw new Error(rErr.message);
    for (const r of routes ?? []) driverByRoute.set(r.id as string, (r.driver_staff_id as string | null) ?? null);
  }

  const stopByAppt = new Map<string, Record<string, unknown>>();
  for (const stop of stops) {
    const apptId = stop.hub_appointment_id as string;
    if (apptId) stopByAppt.set(apptId, stop);
  }

  const legs = appointments
    .filter((a) => a.appointment_kind === 'pickup_route' && a.parent_appointment_id)
    .map((a) => {
      const stop = stopByAppt.get(a.id);
      const routeId = (stop?.hub_pickup_route_id as string | null) ?? null;
      const direction = (stop?.direction as 'pickup' | 'delivery' | 'clinic_return' | null) ?? null;
      return {
        parent_appointment_id: a.parent_appointment_id,
        appointment_status: a.status,
        direction,
        stop_status: (stop?.status as string | null) ?? null,
        route_id: routeId,
        driver_id: routeId ? driverByRoute.get(routeId) ?? null : null,
        failure_outcome: failureOutcomeOf(stop),
      };
    });

  const nowIso = new Date().toISOString();
  const failedReturns = buildFailedReturns(appointments, stops, await loadReturnStops(clinicId, stops), nowIso);

  const unresolvedArrivals: CustodySnapshot['unresolvedArrivals'] = [];
  const hasDestination = petHasDestinationService(appointments, typeById);
  for (const stop of stops) {
    const direction = String(stop.direction || '');
    if (stop.status !== 'completed') continue;
    if (direction !== 'pickup' && direction !== 'clinic_return') continue;
    if (hasDestination) continue;
    const leg = appointments.find((a) => a.id === stop.hub_appointment_id);
    const parent = leg?.parent_appointment_id
      ? appointments.find((a) => a.id === leg.parent_appointment_id) ?? null
      : leg ?? null;
    const groups = parent?.hub_service_type_id
      ? [typeById.get(parent.hub_service_type_id)?.service_group].filter((g): g is string => Boolean(g))
      : [];
    const moduleName = resolvePickupArrivalModule({
      appointmentKind: parent?.appointment_kind,
      serviceGroups: groups,
    });
    if (moduleName) continue;
    unresolvedArrivals.push({
      stop_id: stop.id as string,
      unit_id: parent?.unit_id ?? leg?.unit_id ?? null,
      guardian_id: parent?.guardian_id ?? leg?.guardian_id ?? null,
      completed_at: (stop.completed_at as string) || new Date().toISOString(),
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
      id: s.id as string,
      unit_id: (s.unit_id as string | null) ?? null,
      guardian_id: (s.guardian_id as string | null) ?? null,
      hub_appointment_id: (s.hub_appointment_id as string | null) ?? null,
      grooming_stage: String(s.grooming_stage),
      ready_at: (s.ready_at as string | null) ?? null,
    })),
    extras,
    encounters: (encounters ?? []).map((e) => ({
      id: e.id as string,
      unit_id: (e.unit_id as string | null) ?? null,
      guardian_id: (e.guardian_id as string | null) ?? null,
      hub_appointment_id: (e.hub_appointment_id as string | null) ?? null,
      status: String(e.status),
      completed_at: (e.completed_at as string | null) ?? null,
    })),
  hospitalizations: (hosps ?? []).map((h) => {
    const linked = appointments.find((a) => a.id === h.hub_appointment_id);
    return {
      id: h.id as string,
      unit_id: linked?.unit_id ?? null,
      guardian_id: (h.guardian_id as string | null) ?? linked?.guardian_id ?? null,
      hub_appointment_id: (h.hub_appointment_id as string | null) ?? null,
      status: String(h.status),
      discharged_at: (h.discharged_at as string | null) ?? null,
    };
  }),
    surgeries: (surgeries ?? []).map((s) => ({ id: s.id as string, status: String(s.status) })),
    boarding: (boarding ?? []).map((b) => ({
      id: b.id as string,
      unit_id: (b.unit_id as string | null) ?? null,
      status: String(b.status),
      guardian_id: (b.guardian_id as string | null) ?? null,
      hub_appointment_id: (b.hub_appointment_id as string | null) ?? null,
      mode: (b.mode as 'hotel' | 'daycare' | null) ?? null,
      expected_check_out: (b.expected_check_out as string | null) ?? null,
      handoff_ready_at: (b.handoff_ready_at as string | null) ?? null,
    })),
    legs,
    unresolvedArrivals,
    failedReturns,
  };
}

function chunkIds(ids: string[], size = 80): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

async function selectByPetIds<T>(
  table: string,
  clinicId: string,
  petIds: string[],
  columns: string,
  opts?: { activeOnly?: boolean },
): Promise<T[]> {
  if (petIds.length === 0) return [];
  const rows: T[] = [];
  for (const part of chunkIds(petIds)) {
    let q = supabaseAdmin.from(table).select(columns).eq('clinic_id', clinicId).in('pet_id', part);
    if (opts?.activeOnly) q = q.is('deleted_at', null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

export async function collectReceptionPetIds(clinicId: string, unitId: string, dayYmd: string): Promise<string[]> {
  const { dayBoundsFromYmdSaoPaulo } = await import('./boardingOperational');
  const { from, to } = dayBoundsFromYmdSaoPaulo(dayYmd);
  const ids = new Set<string>();

  const [appts, sessions, open, encounters, discharges, boardingOut] = await Promise.all([
    supabaseAdmin
      .from('hub_appointments')
      .select('pet_id')
      .eq('clinic_id', clinicId)
      .eq('unit_id', unitId)
      .is('deleted_at', null)
      .gte('starts_at', from)
      .lte('starts_at', to)
      .limit(200),
    supabaseAdmin
      .from('hub_grooming_sessions')
      .select('pet_id')
      .eq('clinic_id', clinicId)
      .eq('unit_id', unitId)
      .is('deleted_at', null)
      .in('grooming_stage', ['ready', 'delivered'])
      .limit(100),
    supabaseAdmin
      .from('hub_reception_handoffs')
      .select('pet_id')
      .eq('clinic_id', clinicId)
      .eq('unit_id', unitId)
      .eq('status', 'open')
      .limit(200),
    supabaseAdmin
      .from('hub_encounters')
      .select('pet_id')
      .eq('clinic_id', clinicId)
      .eq('unit_id', unitId)
      .eq('status', 'completed')
      .gte('completed_at', from)
      .lte('completed_at', to)
      .limit(100),
    supabaseAdmin
      .from('hub_hospitalizations')
      .select('pet_id')
      .eq('clinic_id', clinicId)
      .eq('status', 'discharged')
      .gte('discharged_at', from)
      .lte('discharged_at', to)
      .limit(100),
    supabaseAdmin
      .from('hub_boarding_reservations')
      .select('pet_id')
      .eq('clinic_id', clinicId)
      .eq('unit_id', unitId)
      .is('deleted_at', null)
      .in('status', ['checked_in', 'checkout_preparing', 'ready_for_handoff'])
      .or(
        `and(expected_check_out.gte.${from},expected_check_out.lte.${to}),status.eq.ready_for_handoff`,
      )
      .limit(150),
  ]);

  for (const row of appts.data ?? []) if (row.pet_id) ids.add(row.pet_id as string);
  for (const row of sessions.data ?? []) if (row.pet_id) ids.add(row.pet_id as string);
  for (const row of open.data ?? []) if (row.pet_id) ids.add(row.pet_id as string);
  for (const row of encounters.data ?? []) if (row.pet_id) ids.add(row.pet_id as string);
  for (const row of discharges.data ?? []) if (row.pet_id) ids.add(row.pet_id as string);
  for (const row of boardingOut.data ?? []) if (row.pet_id) ids.add(row.pet_id as string);

  return [...ids].slice(0, 80);
}

function groupByPetId<T extends { pet_id?: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const petId = row.pet_id;
    if (!petId) continue;
    const list = map.get(petId) ?? [];
    list.push(row);
    map.set(petId, list);
  }
  return map;
}

/** Reconcilia a unidade com poucas leituras em lote (evita timeout do quadro). */
export async function syncReceptionUnit(clinicId: string, unitId: string, dayYmd: string): Promise<void> {
  const petIds = await collectReceptionPetIds(clinicId, unitId, dayYmd);
  if (petIds.length === 0) return;

  const [apptRows, sessionRows, encounterRows, hospRows, surgeryRows, boardingRows, storedRows] = await Promise.all([
    selectByPetIds<ApptRow>(
      'hub_appointments',
      clinicId,
      petIds,
      'id, unit_id, guardian_id, pet_id, status, appointment_kind, starts_at, parent_appointment_id, hub_service_type_id',
      { activeOnly: true },
    ),
    selectByPetIds<{
      id: string;
      pet_id: string;
      unit_id: string | null;
      guardian_id: string | null;
      hub_appointment_id: string | null;
      grooming_stage: string;
      ready_at: string | null;
    }>('hub_grooming_sessions', clinicId, petIds, 'id, pet_id, unit_id, guardian_id, hub_appointment_id, grooming_stage, ready_at', {
      activeOnly: true,
    }),
    selectByPetIds<{
      id: string;
      pet_id: string;
      unit_id: string | null;
      guardian_id: string | null;
      hub_appointment_id: string | null;
      status: string;
      completed_at: string | null;
    }>('hub_encounters', clinicId, petIds, 'id, pet_id, unit_id, guardian_id, hub_appointment_id, status, completed_at', {
      activeOnly: true,
    }),
    selectByPetIds<{
      id: string;
      pet_id: string;
      unit_id: string | null;
      guardian_id: string | null;
      hub_appointment_id: string | null;
      status: string;
      discharged_at: string | null;
    }>('hub_hospitalizations', clinicId, petIds, 'id, pet_id, unit_id, guardian_id, hub_appointment_id, status, discharged_at'),
    selectByPetIds<{ id: string; pet_id: string; status: string }>('hub_surgeries', clinicId, petIds, 'id, pet_id, status'),
    selectByPetIds<{
      id: string;
      pet_id: string;
      unit_id: string | null;
      status: string;
      guardian_id: string | null;
      hub_appointment_id: string | null;
      mode: string | null;
      expected_check_out: string | null;
      handoff_ready_at: string | null;
    }>(
      'hub_boarding_reservations',
      clinicId,
      petIds,
      'id, pet_id, unit_id, status, guardian_id, hub_appointment_id, mode, expected_check_out, handoff_ready_at',
      { activeOnly: true },
    ),
    selectByPetIds<{
      id: string;
      pet_id: string;
      kind: string;
      source_type: string;
      source_id: string;
      status: string;
      resolved_at: string | null;
      context: ReceptionContext | null;
    }>('hub_reception_handoffs', clinicId, petIds, 'id, pet_id, kind, source_type, source_id, status, resolved_at, context'),
  ]);

  const typeIds = [...new Set(apptRows.map((a) => a.hub_service_type_id).filter((id): id is string => Boolean(id)))];
  const typeById = new Map<string, { service_group: string | null; name: string | null }>();
  if (typeIds.length > 0) {
    for (const part of chunkIds(typeIds)) {
      const { data: types, error } = await supabaseAdmin.from('hub_service_types').select('id, service_group, name').in('id', part);
      if (error) throw new Error(error.message);
      for (const t of types ?? []) {
        typeById.set(t.id as string, {
          service_group: (t.service_group as string | null) ?? null,
          name: (t.name as string | null) ?? null,
        });
      }
    }
  }

  const sessionIds = sessionRows.map((s) => s.id);
  const apptIds = apptRows.map((a) => a.id);
  const [eventRows, launchedRows, stopRows] = await Promise.all([
    (async () => {
      if (sessionIds.length === 0) return [] as Array<Record<string, unknown>>;
      const rows: Array<Record<string, unknown>> = [];
      for (const part of chunkIds(sessionIds)) {
        const { data, error } = await supabaseAdmin
          .from('hub_grooming_events')
          .select('id, hub_grooming_session_id, payload, body, created_at')
          .eq('clinic_id', clinicId)
          .eq('event_type', 'extra_request')
          .in('hub_grooming_session_id', part);
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as Array<Record<string, unknown>>));
      }
      return rows;
    })(),
    (async () => {
      if (sessionIds.length === 0) return [] as Array<{ hub_grooming_session_id: string; hub_service_type_id: string }>;
      const rows: Array<{ hub_grooming_session_id: string; hub_service_type_id: string }> = [];
      for (const part of chunkIds(sessionIds)) {
        const { data, error } = await supabaseAdmin
          .from('hub_grooming_session_extras')
          .select('hub_grooming_session_id, hub_service_type_id')
          .eq('clinic_id', clinicId)
          .in('hub_grooming_session_id', part);
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as Array<{ hub_grooming_session_id: string; hub_service_type_id: string }>));
      }
      return rows;
    })(),
    (async () => {
      if (apptIds.length === 0) return [] as Array<Record<string, unknown>>;
      const rows: Array<Record<string, unknown>> = [];
      for (const part of chunkIds(apptIds)) {
        const { data, error } = await supabaseAdmin
          .from('hub_pickup_stops')
          .select(STOP_COLUMNS)
          .eq('clinic_id', clinicId)
          .in('hub_appointment_id', part);
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as Array<Record<string, unknown>>));
      }
      return rows;
    })(),
  ]);

  const routeIds = [...new Set(stopRows.map((s) => s.hub_pickup_route_id).filter((id): id is string => typeof id === 'string'))];
  const driverByRoute = new Map<string, string | null>();
  if (routeIds.length > 0) {
    for (const part of chunkIds(routeIds)) {
      const { data: routes, error } = await supabaseAdmin.from('hub_pickup_routes').select('id, driver_staff_id').in('id', part);
      if (error) throw new Error(error.message);
      for (const r of routes ?? []) driverByRoute.set(r.id as string, (r.driver_staff_id as string | null) ?? null);
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
  const extrasByPet = new Map<string, CustodySnapshot['extras']>();
  for (const ev of eventRows) {
    const sessionId = ev.hub_grooming_session_id as string;
    const session = sessionsById.get(sessionId);
    if (!session) continue;
    const payload = (ev.payload ?? {}) as { hub_service_type_id?: string; name?: string };
    const typeId = typeof payload.hub_service_type_id === 'string' ? payload.hub_service_type_id : null;
    if (typeId && launchedKey.has(`${sessionId}:${typeId}`)) continue;
    const list = extrasByPet.get(session.pet_id) ?? [];
    list.push({
      event_id: ev.id as string,
      session_id: sessionId,
      unit_id: session.unit_id,
      guardian_id: session.guardian_id,
      created_at: (ev.created_at as string) || new Date().toISOString(),
      hub_service_type_id: typeId,
      extra_name: (typeof ev.body === 'string' && (ev.body as string).trim()) || payload.name || null,
    });
    extrasByPet.set(session.pet_id, list);
  }

  const stopByAppt = new Map<string, Record<string, unknown>>();
  for (const stop of stopRows) {
    const apptId = stop.hub_appointment_id as string;
    if (apptId) stopByAppt.set(apptId, stop);
  }

  const nowIso = new Date().toISOString();
  const returnStops = await loadReturnStops(clinicId, stopRows);
  const closeSessionIds: string[] = [];
  const completeBoardingIds: string[] = [];
  const cancelIds: string[] = [];
  const inserts: DesiredHandoff[] = [];
  const refreshRows: Array<{ id: string; context: ReceptionContext }> = [];

  for (const petId of petIds) {
    const appointments = apptsByPet.get(petId) ?? [];
    const legs = appointments
      .filter((a) => a.appointment_kind === 'pickup_route' && a.parent_appointment_id)
      .map((a) => {
        const stop = stopByAppt.get(a.id);
        const routeId = (stop?.hub_pickup_route_id as string | null) ?? null;
        return {
          parent_appointment_id: a.parent_appointment_id,
          appointment_status: a.status,
          direction: (stop?.direction as 'pickup' | 'delivery' | 'clinic_return' | null) ?? null,
          stop_status: (stop?.status as string | null) ?? null,
          route_id: routeId,
          driver_id: routeId ? driverByRoute.get(routeId) ?? null : null,
          failure_outcome: failureOutcomeOf(stop),
        };
      });
    const apptIdSet = new Set(appointments.map((a) => a.id));
    const failedReturns = buildFailedReturns(
      appointments,
      stopRows.filter((s) => apptIdSet.has(s.hub_appointment_id as string)),
      returnStops,
      nowIso,
    );

    const unresolvedArrivals: CustodySnapshot['unresolvedArrivals'] = [];
    const hasDestination = petHasDestinationService(appointments, typeById);
    for (const stop of stopRows) {
      const direction = String(stop.direction || '');
      if (stop.status !== 'completed') continue;
      if (direction !== 'pickup' && direction !== 'clinic_return') continue;
      if (hasDestination) continue;
      const leg = appointments.find((a) => a.id === stop.hub_appointment_id);
      if (!leg) continue;
      const parent = leg.parent_appointment_id
        ? appointments.find((a) => a.id === leg.parent_appointment_id) ?? null
        : leg;
      const groups = parent?.hub_service_type_id
        ? [typeById.get(parent.hub_service_type_id)?.service_group].filter((g): g is string => Boolean(g))
        : [];
      const moduleName = resolvePickupArrivalModule({
        appointmentKind: parent?.appointment_kind,
        serviceGroups: groups,
      });
      if (moduleName) continue;
      unresolvedArrivals.push({
        stop_id: stop.id as string,
        unit_id: parent?.unit_id ?? leg.unit_id ?? null,
        guardian_id: parent?.guardian_id ?? leg.guardian_id ?? null,
        completed_at: (stop.completed_at as string) || nowIso,
      });
    }

    const snap: CustodySnapshot = {
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
        mode: (b.mode as 'hotel' | 'daycare' | null) ?? null,
        expected_check_out: b.expected_check_out,
        handoff_ready_at: b.handoff_ready_at,
      })),
      legs,
      unresolvedArrivals,
      failedReturns,
    };

    const plan = planCustody(snap);
    closeSessionIds.push(...plan.closeGroomingSessionIds);
    completeBoardingIds.push(...plan.completeBoardingReservationIds);
    const existing: StoredHandoff[] = (storedByPet.get(petId) ?? []).map((row) => ({
      id: row.id,
      kind: row.kind as StoredHandoff['kind'],
      source_type: row.source_type,
      source_id: row.source_id,
      status: row.status as StoredHandoff['status'],
      resolved_at: row.resolved_at,
      context: row.context ?? { label: '' },
    }));
    const reconciled = reconcileHandoffRows(existing, plan.handoffs, dayYmd, {
      preserveChegadaSourceIds: arrivalPendingAppointmentIds(snap),
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

const ACTION_BY_KIND: Record<string, string[]> = {
  retirada_balcao: ['entreguei'],
  embarque: ['embarquei'],
  chegada: ['chegou'],
  autorizar_extra: ['autorizar', 'dispensar'],
  encaminhar: ['recebi'],
  lt_falha: ['tutor_busca', 'novo_lt'],
};

export type ReceptionResolvePayload = {
  charge?: boolean;
  sale_amount?: number | null;
  starts_at?: string | null;
};

export async function resolveReceptionHandoff(opts: {
  clinicId: string;
  handoffId: string;
  action: string;
  staffId: string | null;
  payload?: ReceptionResolvePayload;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: row, error } = await supabaseAdmin
    .from('hub_reception_handoffs')
    .select('id, clinic_id, pet_id, kind, source_type, source_id, status, context')
    .eq('id', opts.handoffId)
    .eq('clinic_id', opts.clinicId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!row) return { ok: false, status: 404, error: 'Tarefa não encontrada' };
  if (row.status !== 'open') return { ok: false, status: 409, error: 'Esta tarefa já foi concluída por outra pessoa.' };

  const allowed = ACTION_BY_KIND[String(row.kind)] ?? [];
  if (!allowed.includes(opts.action)) {
    return { ok: false, status: 400, error: 'Ação não corresponde a esta tarefa.' };
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimErr } = await supabaseAdmin
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
  if (claimErr) return { ok: false, status: 500, error: claimErr.message };
  if (!claimed) return { ok: false, status: 409, error: 'Esta tarefa já foi concluída por outra pessoa.' };

  try {
    await applyResolution(opts.clinicId, row as HandoffClaim, opts.action, opts.staffId, opts.payload);
  } catch (e) {
    await supabaseAdmin
      .from('hub_reception_handoffs')
      .update({ status: 'open', resolved_at: null, resolved_by_staff_id: null, resolution: null, updated_at: new Date().toISOString() })
      .eq('id', opts.handoffId)
      .eq('resolution', opts.action);
    const message = e instanceof Error ? e.message : 'Erro ao concluir a tarefa';
    return { ok: false, status: 400, error: message };
  }

  if (row.pet_id) {
    await syncReceptionHandoffsForPet(opts.clinicId, row.pet_id as string);
  }
  return { ok: true };
}

type HandoffClaim = {
  kind: string;
  source_type: string;
  source_id: string;
  pet_id: string | null;
  context: ReceptionContext | null;
};

async function applyResolution(
  clinicId: string,
  row: HandoffClaim,
  action: string,
  staffId: string | null,
  payload?: ReceptionResolvePayload,
): Promise<void> {
  const ctx = row.context ?? { label: '' };
  if (action === 'dispensar' || action === 'recebi') return;

  if (action === 'tutor_busca' || action === 'novo_lt') {
    if (row.source_type !== 'pickup_stop') throw new Error('Tarefa sem parada de Leva e Traz.');
    const { resolveFailedPickupStop } = await import('./hubPickupController');
    await resolveFailedPickupStop({
      clinicId,
      stopId: row.source_id,
      actorStaffId: staffId,
      resolution:
        action === 'tutor_busca'
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
      const { completeBoardingReservationCheckout, loadReservation, loadUnitSettings, petHasOpenBoardingCharge } =
        await import('./boardingCareService');
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
      const { closeReadyGroomingSessionsForPet } = await import('./hubGroomingController');
      await closeReadyGroomingSessionsForPet(clinicId, row.pet_id);
    } else if (row.source_type === 'grooming_session') {
      const { closeGroomingSessionFromCustody } = await import('./hubGroomingController');
      await closeGroomingSessionFromCustody(clinicId, row.source_id);
    }
    return;
  }

  if (action === 'chegou') {
    const appointmentId = ctx.appointment_id || (row.source_type === 'appointment' ? row.source_id : null);
    if (!appointmentId) throw new Error('Chegada sem agendamento.');
    const { data: appt, error } = await supabaseAdmin
      .from('hub_appointments')
      .select('id, status, hub_service_type_id')
      .eq('id', appointmentId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!appt) throw new Error('Agendamento não encontrado');
    if (appt.status === 'cancelled') throw new Error('Agendamento cancelado');
    const { data: st } = await supabaseAdmin
      .from('hub_service_types')
      .select('service_group')
      .eq('id', appt.hub_service_type_id as string)
      .maybeSingle();
    const group = String(st?.service_group || '');
    if (group === GROOMING_GROUP) {
      const { ensureGroomingQueuedForAppointment } = await import('./hubGroomingController');
      const result = await ensureGroomingQueuedForAppointment(clinicId, appointmentId);
      if (!result.ok) throw new Error(result.error);
      return;
    }
    if (CLINICAL_GROUPS.has(group)) {
      if (appt.status === 'pending_confirm' || appt.status === 'confirmed') {
        const { error: upErr } = await supabaseAdmin
          .from('hub_appointments')
          .update({ status: 'checked_in' })
          .eq('id', appointmentId)
          .eq('clinic_id', clinicId);
        if (upErr) throw new Error(upErr.message);
      }
      return;
    }
    throw new Error('Este setor registra a chegada na própria operação.');
  }

  if (action === 'autorizar') {
    const sessionId = ctx.session_id;
    const typeId = ctx.hub_service_type_id;
    if (!sessionId || !typeId) throw new Error('Pedido sem serviço vinculado.');
    const { insertGroomingSessionExtra } = await import('./hubGroomingDrawerController');
    const result = await insertGroomingSessionExtra({
      clinicId,
      sessionId,
      hubServiceTypeId: typeId,
      staffId,
    });
    if (!result.ok) throw new Error(result.error);
  }
}

export function handoffInDay(
  row: { status: string; kind?: string; opened_at: string; resolved_at: string | null },
  dayYmd: string,
): boolean {
  // Chegada / saída prevista abertas só no dia do horário — evita card eterno.
  if (row.status === 'open') {
    if (row.kind === 'chegada' || row.kind === 'saida_prevista') {
      return ymdInSaoPaulo(row.opened_at) === dayYmd;
    }
    return true;
  }
  const stamp = row.resolved_at || row.opened_at;
  return ymdInSaoPaulo(stamp) === dayYmd;
}

export type { DesiredHandoff };
