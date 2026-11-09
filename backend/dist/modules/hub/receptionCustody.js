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
];
const ARRIVAL_GROUPS = new Set(['banho_tosa', 'clinica', 'internacao', 'cirurgia']);
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
function exitBlocked(snap, exceptAppointmentId) {
    if (snap.hospitalizations.some((h) => h.status === 'active'))
        return true;
    if (snap.surgeries.some((s) => s.status === 'in_progress'))
        return true;
    if (snap.encounters.some((e) => e.status === 'in_progress' || e.status === 'waiting'))
        return true;
    if (snap.groomingSessions.some((s) => !s.deleted_at && OPEN_GROOMING.has(s.grooming_stage))) {
        return true;
    }
    return snap.appointments.some((a) => {
        if (a.deleted_at)
            return false;
        if (exceptAppointmentId && a.id === exceptAppointmentId)
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
    if (live.some((l) => l.route_id && l.driver_id))
        return 'wait_driver';
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
    if (outcomes.includes('wait_driver'))
        return 'wait_driver';
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
        const outcome = deliveryOutcome(legsFor(snap, appointmentId));
        if (outcome === 'delivered') {
            completeBoardingReservationIds.push(stay.id);
            continue;
        }
        if (outcome === 'wait_driver')
            continue;
        const kind = outcome === 'needs_boarding' ? 'embarque' : 'retirada_balcao';
        const openedAt = stay.handoff_ready_at || snap.nowIso;
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
    ].filter((id) => Boolean(id));
    const blocked = exitBlocked(snap, releaseAppointmentIds.length === 1 ? releaseAppointmentIds[0] : null) &&
        releaseAppointmentIds.length <= 1
        ? exitBlocked(snap, releaseAppointmentIds[0] ?? null)
        : snap.hospitalizations.some((h) => h.status === 'active') ||
            snap.surgeries.some((s) => s.status === 'in_progress') ||
            snap.encounters.some((e) => e.status === 'in_progress' || e.status === 'waiting') ||
            snap.groomingSessions.some((s) => !s.deleted_at && OPEN_GROOMING.has(s.grooming_stage)) ||
            snap.appointments.some((a) => {
                if (a.deleted_at)
                    return false;
                if (releaseAppointmentIds.includes(a.id))
                    return false;
                if (a.appointment_kind === 'pickup_route')
                    return false;
                if (a.appointment_kind === 'hotel_stay' || a.appointment_kind === 'daycare_block')
                    return false;
                if (TERMINAL_APPT.has(a.status))
                    return false;
                if (!a.starts_at || ymdInSaoPaulo(a.starts_at) !== snap.dayYmd)
                    return false;
                return true;
            });
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
    if (outcome === 'wait_driver') {
        return { handoffs, closeGroomingSessionIds, completeBoardingReservationIds };
    }
    const latestReady = [...readyLive].sort((a, b) => String(b.ready_at).localeCompare(String(a.ready_at)))[0];
    const discharge = dischargedToday[0];
    const encounter = dischargedToday.length > 0 ? undefined : encountersToday[0];
    if (!latestReady && !discharge && !encounter) {
        return { handoffs, closeGroomingSessionIds, completeBoardingReservationIds };
    }
    const kind = outcome === 'needs_boarding' ? 'embarque' : 'retirada_balcao';
    if (latestReady) {
        pushExit(handoffs, snap, kind, 'grooming_session', latestReady.id, latestReady.unit_id, latestReady.guardian_id, latestReady.ready_at || snap.nowIso, 'Banho', latestReady.hub_appointment_id, latestReady.id);
    }
    else if (discharge) {
        pushExit(handoffs, snap, kind, 'hospitalization', discharge.id, discharge.unit_id, discharge.guardian_id, discharge.discharged_at || snap.nowIso, 'Alta', discharge.hub_appointment_id, null);
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
