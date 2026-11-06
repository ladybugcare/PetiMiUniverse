/**
 * Persiste handoffs da recepção a partir do estado atual dos módulos.
 * A leitura do quadro também reconcilia, para recuperar evento perdido.
 */
import { supabaseAdmin } from '../../config/supabase';
import { resolvePickupArrivalModule } from './pickupArrival';
import {
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

export async function syncReceptionHandoffsForPet(clinicId: string, petId: string, dayYmd?: string): Promise<void> {
  const day = dayYmd || todayYmdSaoPaulo();
  const snap = await loadSnapshot(clinicId, petId, day);
  const plan = planCustody(snap);
  if (plan.closeGroomingSessionIds.length > 0) {
    const { closeGroomingSessionFromCustody } = await import('./hubGroomingController');
    for (const sessionId of plan.closeGroomingSessionIds) {
      await closeGroomingSessionFromCustody(clinicId, sessionId);
    }
  }
  const existing = await loadStored(clinicId, petId);
  const { insert, cancelIds } = reconcileHandoffRows(existing, plan.handoffs, day);
  if (cancelIds.length > 0) {
    const now = new Date().toISOString();
    await supabaseAdmin
      .from('hub_reception_handoffs')
      .update({ status: 'cancelled', resolved_at: now, resolution: 'superseded', updated_at: now })
      .in('id', cancelIds)
      .eq('status', 'open');
  }
  if (insert.length > 0) {
    const { error } = await supabaseAdmin.from('hub_reception_handoffs').insert(
      insert.map((h) => ({
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
      })),
    );
    if (error && !/duplicate|unique/i.test(error.message)) {
      throw new Error(error.message);
    }
  }
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
    .select('id, unit_id, status')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId);
  if (bErr) throw new Error(bErr.message);

  const apptIds = appointments.map((a) => a.id);
  let stops: Array<Record<string, unknown>> = [];
  if (apptIds.length > 0) {
    const { data: stopRows, error: stErr } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('id, hub_appointment_id, direction, status, hub_pickup_route_id, completed_at')
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
      };
    });

  const unresolvedArrivals: CustodySnapshot['unresolvedArrivals'] = [];
  for (const stop of stops) {
    const direction = String(stop.direction || '');
    if (stop.status !== 'completed') continue;
    if (direction !== 'pickup' && direction !== 'clinic_return') continue;
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
    nowIso: new Date().toISOString(),
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
    })),
    legs,
    unresolvedArrivals,
  };
}

export async function collectReceptionPetIds(clinicId: string, unitId: string, dayYmd: string): Promise<string[]> {
  const { dayBoundsFromYmdSaoPaulo } = await import('./boardingOperational');
  const { from, to } = dayBoundsFromYmdSaoPaulo(dayYmd);
  const ids = new Set<string>();

  const { data: appts } = await supabaseAdmin
    .from('hub_appointments')
    .select('pet_id')
    .eq('clinic_id', clinicId)
    .eq('unit_id', unitId)
    .is('deleted_at', null)
    .gte('starts_at', from)
    .lte('starts_at', to)
    .limit(200);
  for (const row of appts ?? []) if (row.pet_id) ids.add(row.pet_id as string);

  const { data: sessions } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select('pet_id')
    .eq('clinic_id', clinicId)
    .eq('unit_id', unitId)
    .is('deleted_at', null)
    .in('grooming_stage', ['ready', 'delivered'])
    .limit(100);
  for (const row of sessions ?? []) if (row.pet_id) ids.add(row.pet_id as string);

  const { data: open } = await supabaseAdmin
    .from('hub_reception_handoffs')
    .select('pet_id')
    .eq('clinic_id', clinicId)
    .eq('unit_id', unitId)
    .eq('status', 'open')
    .limit(200);
  for (const row of open ?? []) if (row.pet_id) ids.add(row.pet_id as string);

  const { data: encounters } = await supabaseAdmin
    .from('hub_encounters')
    .select('pet_id')
    .eq('clinic_id', clinicId)
    .eq('unit_id', unitId)
    .eq('status', 'completed')
    .gte('completed_at', from)
    .lte('completed_at', to)
    .limit(100);
  for (const row of encounters ?? []) if (row.pet_id) ids.add(row.pet_id as string);

  const { data: discharges } = await supabaseAdmin
    .from('hub_hospitalizations')
    .select('pet_id')
    .eq('clinic_id', clinicId)
    .eq('status', 'discharged')
    .gte('discharged_at', from)
    .lte('discharged_at', to)
    .limit(100);
  for (const row of discharges ?? []) if (row.pet_id) ids.add(row.pet_id as string);

  return [...ids].slice(0, 80);
}

export async function syncReceptionUnit(clinicId: string, unitId: string, dayYmd: string): Promise<void> {
  const petIds = await collectReceptionPetIds(clinicId, unitId, dayYmd);
  for (const petId of petIds) {
    await syncReceptionHandoffsForPet(clinicId, petId, dayYmd);
  }
}

const ACTION_BY_KIND: Record<string, string[]> = {
  retirada_balcao: ['entreguei'],
  embarque: ['embarquei'],
  chegada: ['chegou'],
  autorizar_extra: ['autorizar', 'dispensar'],
  encaminhar: ['recebi'],
};

export async function resolveReceptionHandoff(opts: {
  clinicId: string;
  handoffId: string;
  action: string;
  staffId: string | null;
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
    await applyResolution(opts.clinicId, row as HandoffClaim, opts.action, opts.staffId);
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

async function applyResolution(clinicId: string, row: HandoffClaim, action: string, staffId: string | null): Promise<void> {
  const ctx = row.context ?? { label: '' };
  if (action === 'dispensar' || action === 'recebi') return;

  if (action === 'entreguei' || action === 'embarquei') {
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

export function handoffInDay(row: { status: string; opened_at: string; resolved_at: string | null }, dayYmd: string): boolean {
  if (row.status === 'open') return true;
  const stamp = row.resolved_at || row.opened_at;
  return ymdInSaoPaulo(stamp) === dayYmd;
}

export type { DesiredHandoff };
