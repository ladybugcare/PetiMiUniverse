/**
 * Regras de custódia da Operação da Recepção.
 * Não copia o status dos outros módulos: lê um retrato e diz quais handoffs
 * abrir e quais sessões de banho fechar (estadia ativa ou entrega já concluída).
 * Sem valores financeiros.
 */

export const RECEPTION_HANDOFF_KINDS = [
  'chegada',
  'autorizar_extra',
  'encaminhar',
  'retirada_balcao',
  'embarque',
  'lt_falha',
] as const;

export type ReceptionHandoffKind = (typeof RECEPTION_HANDOFF_KINDS)[number];

export type ReceptionContext = {
  label: string;
  starts_at?: string | null;
  ready_at?: string | null;
  hub_service_type_id?: string | null;
  session_id?: string | null;
  appointment_id?: string | null;
  extra_name?: string | null;
  failure_reason?: string | null;
  failed_stop_id?: string | null;
  failed_direction?: 'pickup' | 'delivery' | null;
  route_id?: string | null;
  failed_at?: string | null;
};

export type DesiredHandoff = {
  kind: ReceptionHandoffKind;
  source_type: string;
  source_id: string;
  pet_id: string | null;
  guardian_id: string | null;
  unit_id: string | null;
  opened_at: string;
  context: ReceptionContext;
};

export type CustodyAppointment = {
  id: string;
  unit_id: string | null;
  guardian_id: string | null;
  status: string;
  appointment_kind: string | null;
  starts_at: string | null;
  service_group: string | null;
  service_name: string | null;
  parent_appointment_id: string | null;
  deleted_at?: string | null;
};

export type CustodyGroomingSession = {
  id: string;
  unit_id: string | null;
  guardian_id: string | null;
  hub_appointment_id: string | null;
  grooming_stage: string;
  ready_at: string | null;
  deleted_at?: string | null;
};

export type CustodyExtra = {
  event_id: string;
  session_id: string;
  unit_id: string | null;
  guardian_id: string | null;
  created_at: string;
  hub_service_type_id: string | null;
  extra_name: string | null;
};

export type CustodyEncounter = {
  id: string;
  unit_id: string | null;
  guardian_id: string | null;
  hub_appointment_id: string | null;
  status: string;
  completed_at: string | null;
};

export type CustodyHospitalization = {
  id: string;
  unit_id: string | null;
  guardian_id: string | null;
  hub_appointment_id: string | null;
  status: string;
  discharged_at: string | null;
};

export type CustodySurgery = {
  id: string;
  status: string;
};

export type CustodyBoarding = {
  id: string;
  unit_id: string | null;
  status: string;
};

export type CustodyLeg = {
  parent_appointment_id: string | null;
  appointment_status: string;
  direction: 'pickup' | 'delivery' | 'clinic_return' | null;
  stop_status: string | null;
  route_id: string | null;
  driver_id: string | null;
  failure_outcome?: 'no_pet' | 'return_to_clinic' | null;
};

export type CustodyArrival = {
  stop_id: string;
  unit_id: string | null;
  guardian_id: string | null;
  completed_at: string;
};

/**
 * Falha com pet a bordo sem decisão da recepção.
 * `returned_at` nulo = pet ainda voltando com o motorista (segura a saída, sem tarefa).
 */
export type CustodyFailedReturn = {
  stop_id: string;
  unit_id: string | null;
  guardian_id: string | null;
  direction: 'pickup' | 'delivery';
  appointment_id: string | null;
  route_id: string | null;
  failure_reason: string | null;
  failed_at: string | null;
  returned_at: string | null;
};

export type CustodySnapshot = {
  petId: string;
  dayYmd: string;
  nowIso: string;
  appointments: CustodyAppointment[];
  groomingSessions: CustodyGroomingSession[];
  extras: CustodyExtra[];
  encounters: CustodyEncounter[];
  hospitalizations: CustodyHospitalization[];
  surgeries: CustodySurgery[];
  boarding: CustodyBoarding[];
  legs: CustodyLeg[];
  unresolvedArrivals: CustodyArrival[];
  failedReturns?: CustodyFailedReturn[];
};

export type CustodyPlan = {
  handoffs: DesiredHandoff[];
  closeGroomingSessionIds: string[];
};

export type StoredHandoff = {
  id: string;
  kind: ReceptionHandoffKind;
  source_type: string;
  source_id: string;
  status: 'open' | 'done' | 'cancelled';
  resolved_at: string | null;
  context: ReceptionContext;
};

const ARRIVAL_GROUPS = new Set(['banho_tosa', 'clinica', 'internacao', 'cirurgia']);
const TERMINAL_APPT = new Set(['done', 'cancelled', 'paid']);
const OPEN_GROOMING = new Set(['scheduled', 'checked_in', 'queued', 'in_service', 'finishing']);

export function ymdInSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function todayYmdSaoPaulo(now = new Date()): string {
  return ymdInSaoPaulo(now.toISOString());
}

function hasActiveStay(snap: CustodySnapshot, unitId: string | null): boolean {
  return snap.boarding.some((b) => {
    if (b.status !== 'checked_in') return false;
    if (unitId && b.unit_id && b.unit_id !== unitId) return false;
    return true;
  });
}

function exitBlocked(snap: CustodySnapshot, exceptAppointmentId: string | null): boolean {
  if (snap.hospitalizations.some((h) => h.status === 'active')) return true;
  if (snap.surgeries.some((s) => s.status === 'in_progress')) return true;
  if (snap.encounters.some((e) => e.status === 'in_progress' || e.status === 'waiting')) return true;
  if (
    snap.groomingSessions.some(
      (s) => !s.deleted_at && OPEN_GROOMING.has(s.grooming_stage),
    )
  ) {
    return true;
  }
  return snap.appointments.some((a) => {
    if (a.deleted_at) return false;
    if (exceptAppointmentId && a.id === exceptAppointmentId) return false;
    if (a.appointment_kind === 'pickup_route') return false;
    if (a.appointment_kind === 'hotel_stay' || a.appointment_kind === 'daycare_block') return false;
    if (TERMINAL_APPT.has(a.status)) return false;
    if (!a.starts_at) return false;
    if (ymdInSaoPaulo(a.starts_at) !== snap.dayYmd) return false;
    return true;
  });
}

type DeliveryOutcome = 'none' | 'wait_driver' | 'needs_boarding' | 'delivered' | 'failed';

function deliveryOutcome(legs: CustodyLeg[]): DeliveryOutcome {
  const deliveries = legs.filter((l) => l.direction === 'delivery' && l.appointment_status !== 'cancelled');
  if (deliveries.length === 0) return 'none';
  if (deliveries.some((l) => l.stop_status === 'completed' || l.appointment_status === 'done' || l.appointment_status === 'paid')) {
    return 'delivered';
  }
  const live = deliveries.filter((l) => l.stop_status !== 'failed');
  if (live.length === 0) return 'failed';
  if (live.some((l) => l.route_id && l.driver_id)) return 'wait_driver';
  return 'needs_boarding';
}

function legsFor(snap: CustodySnapshot, parentId: string | null): CustodyLeg[] {
  if (!parentId) return [];
  return snap.legs.filter((l) => l.parent_appointment_id === parentId);
}

function strictestOutcome(outcomes: DeliveryOutcome[]): DeliveryOutcome {
  if (outcomes.includes('delivered')) return 'delivered';
  if (outcomes.includes('wait_driver')) return 'wait_driver';
  if (outcomes.includes('needs_boarding')) return 'needs_boarding';
  if (outcomes.includes('failed')) return 'failed';
  return 'none';
}

function tutorBrings(snap: CustodySnapshot, appointmentId: string): boolean {
  const incoming = snap.legs.filter(
    (l) =>
      l.parent_appointment_id === appointmentId &&
      l.direction === 'pickup' &&
      l.appointment_status !== 'cancelled',
  );
  if (incoming.length === 0) return true;
  return incoming.every((l) => l.stop_status === 'failed' && l.failure_outcome !== 'return_to_clinic');
}

function pushExit(
  handoffs: DesiredHandoff[],
  snap: CustodySnapshot,
  kind: 'retirada_balcao' | 'embarque',
  sourceType: string,
  sourceId: string,
  unitId: string | null,
  guardianId: string | null,
  openedAt: string,
  label: string,
  appointmentId: string | null,
  sessionId: string | null,
): void {
  handoffs.push({
    kind,
    source_type: sourceType,
    source_id: sourceId,
    pet_id: snap.petId,
    guardian_id: guardianId,
    unit_id: unitId,
    opened_at: openedAt,
    context: {
      label,
      ready_at: openedAt,
      appointment_id: appointmentId,
      session_id: sessionId,
    },
  });
}

export function planCustody(snap: CustodySnapshot): CustodyPlan {
  const handoffs: DesiredHandoff[] = [];
  const closeGroomingSessionIds: string[] = [];

  for (const appt of snap.appointments) {
    if (appt.deleted_at) continue;
    if (appt.appointment_kind === 'pickup_route') continue;
    if (appt.status !== 'pending_confirm' && appt.status !== 'confirmed') continue;
    if (!appt.service_group || !ARRIVAL_GROUPS.has(appt.service_group)) continue;
    if (!appt.starts_at || ymdInSaoPaulo(appt.starts_at) !== snap.dayYmd) continue;
    if (!tutorBrings(snap, appt.id)) continue;
    handoffs.push({
      kind: 'chegada',
      source_type: 'appointment',
      source_id: appt.id,
      pet_id: snap.petId,
      guardian_id: appt.guardian_id,
      unit_id: appt.unit_id,
      opened_at: appt.starts_at,
      context: {
        label: appt.service_name || 'Chegada',
        starts_at: appt.starts_at,
        appointment_id: appt.id,
      },
    });
  }

  for (const extra of snap.extras) {
    handoffs.push({
      kind: 'autorizar_extra',
      source_type: 'grooming_event',
      source_id: extra.event_id,
      pet_id: snap.petId,
      guardian_id: extra.guardian_id,
      unit_id: extra.unit_id,
      opened_at: extra.created_at,
      context: {
        label: extra.extra_name || 'Serviço extra',
        extra_name: extra.extra_name,
        hub_service_type_id: extra.hub_service_type_id,
        session_id: extra.session_id,
      },
    });
  }

  for (const arrival of snap.unresolvedArrivals) {
    handoffs.push({
      kind: 'encaminhar',
      source_type: 'pickup_stop',
      source_id: arrival.stop_id,
      pet_id: snap.petId,
      guardian_id: arrival.guardian_id,
      unit_id: arrival.unit_id,
      opened_at: arrival.completed_at,
      context: { label: 'Chegou sem setor' },
    });
  }

  const failedReturns = snap.failedReturns ?? [];
  for (const failure of failedReturns) {
    if (!failure.returned_at) continue;
    handoffs.push({
      kind: 'lt_falha',
      source_type: 'pickup_stop',
      source_id: failure.stop_id,
      pet_id: snap.petId,
      guardian_id: failure.guardian_id,
      unit_id: failure.unit_id,
      opened_at: failure.returned_at,
      context: {
        label: failure.direction === 'pickup' ? 'Coleta não concluída' : 'Entrega não concluída',
        appointment_id: failure.appointment_id,
        failure_reason: failure.failure_reason,
        failed_stop_id: failure.stop_id,
        failed_direction: failure.direction,
        route_id: failure.route_id,
        failed_at: failure.failed_at,
      },
    });
  }

  const ready = snap.groomingSessions.filter(
    (s) => !s.deleted_at && (s.grooming_stage === 'ready' || s.grooming_stage === 'delivered'),
  );
  const readyLive = ready.filter((s) => {
    const appt = snap.appointments.find((a) => a.id === s.hub_appointment_id);
    return !appt || appt.status !== 'cancelled';
  });

  const unitForStay = readyLive[0]?.unit_id ?? snap.boarding[0]?.unit_id ?? null;
  const stay = hasActiveStay(snap, unitForStay);

  const dischargedToday = snap.hospitalizations.filter(
    (h) => h.status === 'discharged' && h.discharged_at && ymdInSaoPaulo(h.discharged_at) === snap.dayYmd,
  );
  const encountersToday = snap.encounters.filter(
    (e) => e.status === 'completed' && e.completed_at && ymdInSaoPaulo(e.completed_at) === snap.dayYmd,
  );

  if (stay) {
    for (const s of readyLive) closeGroomingSessionIds.push(s.id);
    return { handoffs, closeGroomingSessionIds };
  }

  // Saída só depois da decisão sobre a falha (tutor busca ou novo Leva e Traz).
  if (failedReturns.length > 0) {
    return { handoffs, closeGroomingSessionIds };
  }

  const releaseAppointmentIds = [
    ...readyLive.map((s) => s.hub_appointment_id),
    ...encountersToday.map((e) => e.hub_appointment_id),
    ...dischargedToday.map((h) => h.hub_appointment_id),
  ].filter((id): id is string => Boolean(id));

  const blocked =
    exitBlocked(snap, releaseAppointmentIds.length === 1 ? releaseAppointmentIds[0] : null) &&
    releaseAppointmentIds.length <= 1
      ? exitBlocked(snap, releaseAppointmentIds[0] ?? null)
      : snap.hospitalizations.some((h) => h.status === 'active') ||
        snap.surgeries.some((s) => s.status === 'in_progress') ||
        snap.encounters.some((e) => e.status === 'in_progress' || e.status === 'waiting') ||
        snap.groomingSessions.some((s) => !s.deleted_at && OPEN_GROOMING.has(s.grooming_stage)) ||
        snap.appointments.some((a) => {
          if (a.deleted_at) return false;
          if (releaseAppointmentIds.includes(a.id)) return false;
          if (a.appointment_kind === 'pickup_route') return false;
          if (a.appointment_kind === 'hotel_stay' || a.appointment_kind === 'daycare_block') return false;
          if (TERMINAL_APPT.has(a.status)) return false;
          if (!a.starts_at || ymdInSaoPaulo(a.starts_at) !== snap.dayYmd) return false;
          return true;
        });

  if (blocked) {
    return { handoffs, closeGroomingSessionIds };
  }

  const outcomes = releaseAppointmentIds.map((id) => deliveryOutcome(legsFor(snap, id)));
  const outcome = strictestOutcome(outcomes);

  if (outcome === 'delivered') {
    for (const s of readyLive) closeGroomingSessionIds.push(s.id);
    return { handoffs, closeGroomingSessionIds };
  }
  if (outcome === 'wait_driver') {
    return { handoffs, closeGroomingSessionIds };
  }

  const latestReady = [...readyLive].sort((a, b) => String(b.ready_at).localeCompare(String(a.ready_at)))[0];
  const discharge = dischargedToday[0];
  const encounter = dischargedToday.length > 0 ? undefined : encountersToday[0];

  if (!latestReady && !discharge && !encounter) {
    return { handoffs, closeGroomingSessionIds };
  }

  const kind = outcome === 'needs_boarding' ? 'embarque' : 'retirada_balcao';
  if (latestReady) {
    pushExit(
      handoffs,
      snap,
      kind,
      'grooming_session',
      latestReady.id,
      latestReady.unit_id,
      latestReady.guardian_id,
      latestReady.ready_at || snap.nowIso,
      'Banho',
      latestReady.hub_appointment_id,
      latestReady.id,
    );
  } else if (discharge) {
    pushExit(
      handoffs,
      snap,
      kind,
      'hospitalization',
      discharge.id,
      discharge.unit_id,
      discharge.guardian_id,
      discharge.discharged_at || snap.nowIso,
      'Alta',
      discharge.hub_appointment_id,
      null,
    );
  } else if (encounter) {
    pushExit(
      handoffs,
      snap,
      kind,
      'encounter',
      encounter.id,
      encounter.unit_id,
      encounter.guardian_id,
      encounter.completed_at || snap.nowIso,
      'Consulta',
      encounter.hub_appointment_id,
      null,
    );
  }

  return { handoffs, closeGroomingSessionIds };
}

function handoffKey(kind: string, sourceType: string, sourceId: string): string {
  return `${kind}|${sourceType}|${sourceId}`;
}

/** Abre o que falta e cancela abertos que deixaram de ser responsabilidade da recepção. */
export function reconcileHandoffRows(
  existing: StoredHandoff[],
  desired: DesiredHandoff[],
  dayYmd: string,
): { insert: DesiredHandoff[]; cancelIds: string[] } {
  const desiredKeys = new Set(desired.map((d) => handoffKey(d.kind, d.source_type, d.source_id)));
  const insert: DesiredHandoff[] = [];

  for (const d of desired) {
    const open = existing.some(
      (e) =>
        e.status === 'open' &&
        e.kind === d.kind &&
        e.source_type === d.source_type &&
        e.source_id === d.source_id,
    );
    if (open) continue;

    if (d.kind === 'retirada_balcao' || d.kind === 'embarque') {
      const readyAt = d.context.ready_at;
      const already = existing.some(
        (e) =>
          e.status === 'done' &&
          e.kind === d.kind &&
          e.source_type === d.source_type &&
          e.source_id === d.source_id &&
          e.resolved_at &&
          readyAt &&
          e.resolved_at >= readyAt,
      );
      if (already) continue;
    }

    if (d.kind === 'autorizar_extra' || d.kind === 'encaminhar' || d.kind === 'lt_falha') {
      const already = existing.some(
        (e) =>
          e.status === 'done' &&
          e.kind === d.kind &&
          e.source_type === d.source_type &&
          e.source_id === d.source_id,
      );
      if (already) continue;
    }

    insert.push(d);
  }

  const cancelIds: string[] = [];
  for (const e of existing) {
    if (e.status !== 'open') continue;
    if (desiredKeys.has(handoffKey(e.kind, e.source_type, e.source_id))) continue;
    if (e.kind === 'chegada') {
      const starts = e.context?.starts_at;
      if (starts && ymdInSaoPaulo(starts) !== dayYmd) continue;
    }
    cancelIds.push(e.id);
  }

  return { insert, cancelIds };
}
