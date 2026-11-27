"use strict";
/**
 * Regras de custódia da Operação da Recepção.
 * Não copia o status dos outros módulos: lê um retrato e diz quais handoffs
 * abrir e quais sessões de banho fechar (estadia ativa ou entrega já concluída).
 * Sem valores financeiros.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECEPTION_HANDOFF_KINDS = void 0;
exports.ymdInSaoPaulo = ymdInSaoPaulo;
exports.todayYmdSaoPaulo = todayYmdSaoPaulo;
exports.linkedAppointmentIds = linkedAppointmentIds;
exports.deliveryOutcome = deliveryOutcome;
exports.arrivalPendingAppointmentIds = arrivalPendingAppointmentIds;
exports.planCustody = planCustody;
exports.reconcileHandoffRows = reconcileHandoffRows;
exports.RECEPTION_HANDOFF_KINDS = [
    'chegada',
    'autorizar_extra',
    'encaminhar',
    'retirada_balcao',
    'embarque',
    'lt_falha',
    'saida_prevista',
    'no_consultorio',
];
const ARRIVAL_GROUPS = new Set(['banho_tosa', 'clinica', 'internacao', 'cirurgia']);
const CLINICAL_OPS_GROUPS = new Set(['clinica', 'internacao', 'cirurgia']);
const CLINICAL_WALK_IN_KINDS = new Set(['clinical_walk_in', 'clinical_emergency']);
const TERMINAL_APPT = new Set(['done', 'cancelled', 'paid']);
const OPEN_GROOMING = new Set(['scheduled', 'checked_in', 'queued', 'in_service', 'finishing']);
function ymdInSaoPaulo(iso) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(iso));
}
function todayYmdSaoPaulo(now = new Date()) {
    return ymdInSaoPaulo(now.toISOString());
}
const ACTIVE_STAY = new Set(['checked_in', 'checkout_preparing', 'ready_for_handoff']);
function hasActiveStay(snap, unitId) {
    return snap.boarding.some((b) => {
        if (!ACTIVE_STAY.has(b.status))
            return false;
        if (unitId && b.unit_id && b.unit_id !== unitId)
            return false;
        return true;
    });
}
function boardingLabel(mode) {
    return mode === 'daycare' ? 'Creche' : 'Hotel';
}
/** Agendamentos da mesma visita (visit_group / parent) a partir dos IDs de liberação. */
function linkedAppointmentIds(snap, releaseAppointmentIds) {
    const linked = new Set(releaseAppointmentIds.filter(Boolean));
    const groups = new Set();
    for (const id of linked) {
        const appt = snap.appointments.find((a) => a.id === id);
        if (appt?.visit_group_id)
            groups.add(appt.visit_group_id);
        if (appt?.parent_appointment_id)
            linked.add(appt.parent_appointment_id);
    }
    let changed = true;
    while (changed) {
        changed = false;
        for (const a of snap.appointments) {
            if (a.deleted_at)
                continue;
            const byParent = (a.parent_appointment_id && linked.has(a.parent_appointment_id)) ||
                (a.id && [...linked].some((id) => {
                    const other = snap.appointments.find((x) => x.id === id);
                    return other?.parent_appointment_id === a.id;
                }));
            const byGroup = a.visit_group_id != null && groups.has(a.visit_group_id);
            if ((byParent || byGroup) && !linked.has(a.id)) {
                linked.add(a.id);
                if (a.visit_group_id)
                    groups.add(a.visit_group_id);
                changed = true;
            }
        }
    }
    return linked;
}
/**
 * Bloqueios duros (clínico) sempre; serviços/agenda só se vinculados à visita de liberação.
 * Agendamentos independentes no mesmo dia não bloqueiam.
 */
function exitBlocked(snap, releaseAppointmentIds) {
    if (snap.hospitalizations.some((h) => h.status === 'active'))
        return true;
    // Soft-deleted não bloqueia saída (histórico permanece para auditoria).
    if (snap.surgeries.some((s) => !s.deleted_at && s.status === 'in_progress'))
        return true;
    const linked = linkedAppointmentIds(snap, releaseAppointmentIds);
    // Encounters abertos só bloqueiam se forem da mesma visita de liberação (ou sem agenda).
    // Encounters órfãos de internação cancelada / consultas abandonadas não prendem a saída.
    const cancelledHospAppointmentIds = new Set(snap.hospitalizations
        .filter((h) => h.status === 'cancelled' && h.hub_appointment_id)
        .map((h) => h.hub_appointment_id));
    if (snap.encounters.some((e) => {
        if (e.status !== 'in_progress' && e.status !== 'waiting')
            return false;
        if (e.hub_appointment_id && cancelledHospAppointmentIds.has(e.hub_appointment_id)) {
            return false;
        }
        if (!e.hub_appointment_id)
            return true;
        return linked.has(e.hub_appointment_id);
    })) {
        return true;
    }
    if (snap.groomingSessions.some((s) => {
        if (s.deleted_at || !OPEN_GROOMING.has(s.grooming_stage))
            return false;
        if (!s.hub_appointment_id)
            return true;
        if (releaseAppointmentIds.includes(s.hub_appointment_id))
            return false;
        return linked.has(s.hub_appointment_id);
    })) {
        return true;
    }
    return snap.appointments.some((a) => {
        if (a.deleted_at)
            return false;
        if (releaseAppointmentIds.includes(a.id))
            return false;
        if (!linked.has(a.id))
            return false;
        if (a.appointment_kind === 'pickup_route')
            return false;
        if (a.appointment_kind === 'hotel_stay' || a.appointment_kind === 'daycare_block')
            return false;
        if (TERMINAL_APPT.has(a.status))
            return false;
        if (!a.starts_at)
            return false;
        if (ymdInSaoPaulo(a.starts_at) !== snap.dayYmd)
            return false;
        return true;
    });
}
function deliveryOutcome(legs) {
    const deliveries = legs.filter((l) => l.direction === 'delivery' && l.appointment_status !== 'cancelled');
    if (deliveries.length === 0)
        return 'none';
    if (deliveries.some((l) => l.stop_status === 'completed' || l.appointment_status === 'done' || l.appointment_status === 'paid')) {
        return 'delivered';
    }
    const live = deliveries.filter((l) => l.stop_status !== 'failed');
    if (live.length === 0)
        return 'failed';
    if (live.some((l) => l.boarded_at))
        return 'boarded';
    return 'needs_boarding';
}
function legsFor(snap, parentId) {
    if (!parentId)
        return [];
    return snap.legs.filter((l) => l.parent_appointment_id === parentId);
}
function strictestOutcome(outcomes) {
    if (outcomes.includes('delivered'))
        return 'delivered';
    if (outcomes.includes('boarded'))
        return 'boarded';
    if (outcomes.includes('needs_boarding'))
        return 'needs_boarding';
    if (outcomes.includes('failed'))
        return 'failed';
    return 'none';
}
/** Ainda falta a recepção confirmar a chegada deste agendamento (qualquer dia). */
function isArrivalCandidate(snap, appt) {
    if (appt.deleted_at)
        return false;
    if (appt.appointment_kind === 'pickup_route')
        return false;
    if (appt.status !== 'pending_confirm' && appt.status !== 'confirmed')
        return false;
    if (!appt.service_group || !ARRIVAL_GROUPS.has(appt.service_group))
        return false;
    if (!tutorBrings(snap, appt.id))
        return false;
    const session = snap.groomingSessions.find((s) => !s.deleted_at && s.hub_appointment_id === appt.id);
    // Banho já passou do agendado: pet já está no salão (ou pronto).
    if (session && session.grooming_stage !== 'scheduled')
        return false;
    return true;
}
/** Pet clínico já no consultório (encaixe / em atendimento) — sinal informativo. */
function isInConsultorioCandidate(snap, appt) {
    if (appt.deleted_at)
        return false;
    if (appt.appointment_kind === 'pickup_route')
        return false;
    if (appt.status !== 'checked_in' && appt.status !== 'in_progress')
        return false;
    const isClinicalGroup = !!appt.service_group && CLINICAL_OPS_GROUPS.has(appt.service_group);
    const isWalkInKind = !!appt.appointment_kind && CLINICAL_WALK_IN_KINDS.has(appt.appointment_kind);
    if (!isClinicalGroup && !isWalkInKind)
        return false;
    if (!appt.starts_at || ymdInSaoPaulo(appt.starts_at) !== snap.dayYmd)
        return false;
    return true;
}
/** IDs de agendamento que ainda devem manter handoff `chegada` aberto. */
function arrivalPendingAppointmentIds(snap) {
    const ids = new Set();
    for (const appt of snap.appointments) {
        if (!isArrivalCandidate(snap, appt))
            continue;
        ids.add(appt.id);
    }
    return ids;
}
function tutorBrings(snap, appointmentId) {
    const incoming = snap.legs.filter((l) => l.parent_appointment_id === appointmentId &&
        l.direction === 'pickup' &&
        l.appointment_status !== 'cancelled');
    if (incoming.length === 0)
        return true;
    return incoming.every((l) => l.stop_status === 'failed' && l.failure_outcome !== 'return_to_clinic');
}
function pushExit(handoffs, snap, kind, sourceType, sourceId, unitId, guardianId, openedAt, label, appointmentId, sessionId) {
    const deliveryLegs = appointmentId
        ? legsFor(snap, appointmentId).filter((l) => l.direction === 'delivery' && l.stop_status !== 'failed')
        : [];
    const withDriver = deliveryLegs.find((l) => l.route_id && l.driver_id) ?? deliveryLegs[0];
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
            ...(kind === 'embarque' && withDriver
                ? {
                    route_id: withDriver.route_id,
                }
                : {}),
        },
    });
}
function planBoardingExits(snap, handoffs, completeBoardingReservationIds) {
    for (const stay of snap.boarding) {
        const expected = stay.expected_check_out ?? null;
        const label = boardingLabel(stay.mode);
        const appointmentId = stay.hub_appointment_id ?? null;
        if (stay.status === 'checked_in' || stay.status === 'checkout_preparing') {
            if (!expected || ymdInSaoPaulo(expected) !== snap.dayYmd)
                continue;
            handoffs.push({
                kind: 'saida_prevista',
                source_type: 'boarding_reservation',
                source_id: stay.id,
                pet_id: snap.petId,
                guardian_id: stay.guardian_id ?? null,
                unit_id: stay.unit_id,
                opened_at: expected,
                context: {
                    label,
                    starts_at: expected,
                    appointment_id: appointmentId,
                    preparing: stay.status === 'checkout_preparing',
                    boarding_mode: stay.mode ?? null,
                    boarding_reservation_id: stay.id,
                },
            });
            continue;
        }
        if (stay.status !== 'ready_for_handoff')
            continue;
        const legs = legsFor(snap, appointmentId);
        const outcome = deliveryOutcome(legs);
        if (outcome === 'delivered') {
            completeBoardingReservationIds.push(stay.id);
            continue;
        }
        // Pet já com o motorista: sem tarefa de embarque; checkout só após entrega.
        if (outcome === 'boarded')
            continue;
        const openedAt = stay.handoff_ready_at || snap.nowIso;
        const liveLegs = legs.filter((l) => l.appointment_status !== 'cancelled');
        // Volta contratada (há perna L&T do pai) sem devolução identificável:
        // não abrir balcão — manter pendente até configurar a devolução.
        if (outcome === 'none' && liveLegs.length > 0) {
            handoffs.push({
                kind: 'saida_prevista',
                source_type: 'boarding_reservation',
                source_id: stay.id,
                pet_id: snap.petId,
                guardian_id: stay.guardian_id ?? null,
                unit_id: stay.unit_id,
                opened_at: openedAt,
                context: {
                    label,
                    starts_at: expected,
                    appointment_id: appointmentId,
                    preparing: true,
                    boarding_mode: stay.mode ?? null,
                    boarding_reservation_id: stay.id,
                    needs_return_config: true,
                },
            });
            continue;
        }
        const kind = outcome === 'needs_boarding' ? 'embarque' : 'retirada_balcao';
        pushExit(handoffs, snap, kind, 'boarding_reservation', stay.id, stay.unit_id, stay.guardian_id ?? null, openedAt, label, appointmentId, null);
        const last = handoffs[handoffs.length - 1];
        if (last) {
            last.context.boarding_mode = stay.mode ?? null;
            last.context.boarding_reservation_id = stay.id;
            last.context.starts_at = expected;
        }
    }
}
function planCustody(snap) {
    const handoffs = [];
    const closeGroomingSessionIds = [];
    const completeBoardingReservationIds = [];
    for (const appt of snap.appointments) {
        if (!isArrivalCandidate(snap, appt))
            continue;
        if (!appt.starts_at || ymdInSaoPaulo(appt.starts_at) !== snap.dayYmd)
            continue;
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
    for (const appt of snap.appointments) {
        if (!isInConsultorioCandidate(snap, appt))
            continue;
        handoffs.push({
            kind: 'no_consultorio',
            source_type: 'appointment',
            source_id: appt.id,
            pet_id: snap.petId,
            guardian_id: appt.guardian_id,
            unit_id: appt.unit_id,
            opened_at: appt.starts_at || snap.nowIso,
            context: {
                label: appt.service_name || 'Consultório',
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
        if (!failure.returned_at)
            continue;
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
    // Saídas de hotel/creche (prevista / liberada) convivem com a custódia — independente do banho.
    planBoardingExits(snap, handoffs, completeBoardingReservationIds);
    const ready = snap.groomingSessions.filter((s) => !s.deleted_at && (s.grooming_stage === 'ready' || s.grooming_stage === 'delivered'));
    const readyLive = ready.filter((s) => {
        const appt = snap.appointments.find((a) => a.id === s.hub_appointment_id);
        return !appt || appt.status !== 'cancelled';
    });
    const unitForStay = readyLive[0]?.unit_id ?? snap.boarding[0]?.unit_id ?? null;
    const stay = hasActiveStay(snap, unitForStay);
    const dischargedToday = snap.hospitalizations.filter((h) => h.status === 'discharged' && h.discharged_at && ymdInSaoPaulo(h.discharged_at) === snap.dayYmd);
    // Alta ambulatorial da cirurgia (discharge_at) — distinto de concluir o procedimento.
    const surgeryDischargedToday = snap.surgeries.filter((s) => !s.deleted_at &&
        s.discharge_at &&
        ymdInSaoPaulo(s.discharge_at) === snap.dayYmd);
    const encountersToday = snap.encounters.filter((e) => e.status === 'completed' && e.completed_at && ymdInSaoPaulo(e.completed_at) === snap.dayYmd);
    if (stay) {
        for (const s of readyLive)
            closeGroomingSessionIds.push(s.id);
        return { handoffs, closeGroomingSessionIds, completeBoardingReservationIds };
    }
    // Saída só depois da decisão sobre a falha (tutor busca ou novo Leva e Traz).
    if (failedReturns.length > 0) {
        return { handoffs, closeGroomingSessionIds, completeBoardingReservationIds };
    }
    const releaseAppointmentIds = [
        ...readyLive.map((s) => s.hub_appointment_id),
        ...encountersToday.map((e) => e.hub_appointment_id),
        ...dischargedToday.map((h) => h.hub_appointment_id),
        ...surgeryDischargedToday.map((s) => s.hub_appointment_id),
    ].filter((id) => Boolean(id));
    const blocked = exitBlocked(snap, releaseAppointmentIds);
    if (blocked) {
        return { handoffs, closeGroomingSessionIds, completeBoardingReservationIds };
    }
    const outcomes = releaseAppointmentIds.map((id) => deliveryOutcome(legsFor(snap, id)));
    const outcome = strictestOutcome(outcomes);
    if (outcome === 'delivered') {
        for (const s of readyLive)
            closeGroomingSessionIds.push(s.id);
        return { handoffs, closeGroomingSessionIds, completeBoardingReservationIds };
    }
    // Já embarcado: fecha banho e não abre tarefa (motorista segue com o pet).
    if (outcome === 'boarded') {
        for (const s of readyLive)
            closeGroomingSessionIds.push(s.id);
        return { handoffs, closeGroomingSessionIds, completeBoardingReservationIds };
    }
    const latestReady = [...readyLive].sort((a, b) => String(b.ready_at).localeCompare(String(a.ready_at)))[0];
    // Uma saída por pet: usa a alta mais recente do dia (evita órfão quando há retries/QA).
    const discharge = [...dischargedToday].sort((a, b) => String(b.discharged_at ?? '').localeCompare(String(a.discharged_at ?? '')))[0];
    const surgeryDischarge = dischargedToday.length > 0
        ? undefined
        : [...surgeryDischargedToday].sort((a, b) => String(b.discharge_at ?? '').localeCompare(String(a.discharge_at ?? '')))[0];
    const encounter = dischargedToday.length > 0 || surgeryDischargedToday.length > 0
        ? undefined
        : encountersToday[0];
    if (!latestReady && !discharge && !surgeryDischarge && !encounter) {
        return { handoffs, closeGroomingSessionIds, completeBoardingReservationIds };
    }
    const kind = outcome === 'needs_boarding' ? 'embarque' : 'retirada_balcao';
    if (latestReady) {
        pushExit(handoffs, snap, kind, 'grooming_session', latestReady.id, latestReady.unit_id, latestReady.guardian_id, latestReady.ready_at || snap.nowIso, 'Banho', latestReady.hub_appointment_id, latestReady.id);
    }
    else if (discharge) {
        pushExit(handoffs, snap, kind, 'hospitalization', discharge.id, discharge.unit_id, discharge.guardian_id, discharge.discharged_at || snap.nowIso, 'Alta', discharge.hub_appointment_id, null);
    }
    else if (surgeryDischarge) {
        pushExit(handoffs, snap, kind, 'surgery', surgeryDischarge.id, surgeryDischarge.unit_id ?? null, surgeryDischarge.guardian_id ?? null, surgeryDischarge.discharge_at || snap.nowIso, 'Alta cirúrgica', surgeryDischarge.hub_appointment_id ?? null, null);
    }
    else if (encounter) {
        pushExit(handoffs, snap, kind, 'encounter', encounter.id, encounter.unit_id, encounter.guardian_id, encounter.completed_at || snap.nowIso, 'Consulta', encounter.hub_appointment_id, null);
    }
    return { handoffs, closeGroomingSessionIds, completeBoardingReservationIds };
}
function handoffKey(kind, sourceType, sourceId) {
    return `${kind}|${sourceType}|${sourceId}`;
}
/** Abre o que falta e cancela abertos que deixaram de ser responsabilidade da recepção. */
function reconcileHandoffRows(existing, desired, dayYmd, opts) {
    const desiredKeys = new Set(desired.map((d) => handoffKey(d.kind, d.source_type, d.source_id)));
    const preserveChegada = opts?.preserveChegadaSourceIds;
    const insert = [];
    const refresh = [];
    for (const d of desired) {
        const open = existing.find((e) => e.status === 'open' &&
            e.kind === d.kind &&
            e.source_type === d.source_type &&
            e.source_id === d.source_id);
        if (open) {
            if (d.kind === 'saida_prevista') {
                const prevPreparing = Boolean(open.context?.preparing);
                const nextPreparing = Boolean(d.context.preparing);
                if (prevPreparing !== nextPreparing || open.context?.label !== d.context.label) {
                    refresh.push({ id: open.id, context: d.context });
                }
            }
            continue;
        }
        if (d.kind === 'retirada_balcao' || d.kind === 'embarque') {
            const readyAt = d.context.ready_at;
            const already = existing.some((e) => e.status === 'done' &&
                e.kind === d.kind &&
                e.source_type === d.source_type &&
                e.source_id === d.source_id &&
                e.resolved_at &&
                readyAt &&
                e.resolved_at >= readyAt);
            if (already)
                continue;
        }
        if (d.kind === 'autorizar_extra' || d.kind === 'encaminhar' || d.kind === 'lt_falha') {
            const already = existing.some((e) => e.status === 'done' &&
                e.kind === d.kind &&
                e.source_type === d.source_type &&
                e.source_id === d.source_id);
            if (already)
                continue;
        }
        if (d.kind === 'saida_prevista') {
            const alreadyOpenOrDoneToday = existing.some((e) => e.kind === d.kind &&
                e.source_type === d.source_type &&
                e.source_id === d.source_id &&
                e.status === 'done' &&
                e.resolved_at &&
                ymdInSaoPaulo(e.resolved_at) === dayYmd);
            if (alreadyOpenOrDoneToday)
                continue;
        }
        insert.push(d);
    }
    const cancelIds = [];
    for (const e of existing) {
        if (e.status !== 'open')
            continue;
        if (desiredKeys.has(handoffKey(e.kind, e.source_type, e.source_id)))
            continue;
        // Chegada de outro dia: só preserva se o agendamento ainda espera a recepção.
        // Sem isso, handoff antigo fica eterno no quadro depois que o banho já iniciou/pronto.
        if (e.kind === 'chegada') {
            const starts = e.context?.starts_at;
            if (starts && ymdInSaoPaulo(starts) !== dayYmd) {
                if (preserveChegada?.has(e.source_id))
                    continue;
            }
        }
        cancelIds.push(e.id);
    }
    return { insert, cancelIds, refresh };
}
