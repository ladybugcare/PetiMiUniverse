import { supabaseAdmin } from '../../config/supabase';
import { notifyHubPetReady } from './hubNotifyEvents';
import { scheduleReceptionSync } from './receptionSync';
import {
  GROOMING_EVENT_TITLES,
  GROOMING_STAGE_LABELS,
  appointmentStatusForGroomingStage,
  canTransitionGroomingStage,
  isGroomingServiceOperationallyDone,
  type GroomingStage,
} from './groomingStages';
import { ensureGroomingAppointmentLinesExecuted } from './groomingExecution';
import { prepareResourceForGroomingStart, releaseAppointmentResource } from './hubResourcesService';
import {
  syncOpenComandasAfterGroomingClosed,
  syncOpenComandasAfterAppointmentOperationalComplete,
} from './hubComandasController';

export const GROOMING_SESSION_SELECT = `
  id, clinic_id, unit_id, pet_id, guardian_id, hub_appointment_id, hub_staff_member_id,
  grooming_stage, priority, checked_in_at, started_at, ready_at, delivered_at, closed_at,
  paused_at,
  tutor_notes_snapshot, operational_notes, checklist, created_at, updated_at
`;

export type GroomingTransitionSource =
  | 'hub_ui'
  | 'voice_alexa'
  | 'chatgpt'
  | 'action_engine'
  | 'reception_custody'
  | 'system';

export type TransitionGroomingSessionResult =
  | { status: 'executed'; session: Record<string, unknown>; from: GroomingStage; to: GroomingStage }
  | { status: 'already_applied'; session: Record<string, unknown>; from: GroomingStage; to: GroomingStage }
  | { status: 'invalid_state'; from: GroomingStage; to: GroomingStage; message: string }
  | { status: 'not_found' }
  | {
      status: 'resource_conflict';
      httpStatus: number;
      body: Record<string, unknown>;
      message: string;
    }
  | { status: 'error'; message: string };

export async function logGroomingEvent(opts: {
  clinic_id: string;
  session_id: string;
  event_type: string;
  title?: string;
  body?: string | null;
  payload?: Record<string, unknown>;
  created_by_staff_id?: string | null;
}) {
  await supabaseAdmin.from('hub_grooming_events').insert({
    clinic_id: opts.clinic_id,
    hub_grooming_session_id: opts.session_id,
    event_type: opts.event_type,
    title: opts.title ?? GROOMING_EVENT_TITLES[opts.event_type] ?? opts.event_type,
    body: opts.body ?? null,
    payload: opts.payload ?? {},
    created_by_staff_id: opts.created_by_staff_id ?? null,
  });
}

export function stageTimestampsPatch(stage: GroomingStage, now: string): Record<string, string> {
  const patch: Record<string, string> = {};
  if (stage === 'checked_in') patch.checked_in_at = now;
  if (stage === 'in_service') patch.started_at = now;
  if (stage === 'ready') patch.ready_at = now;
  if (stage === 'delivered') patch.delivered_at = now;
  if (stage === 'closed') patch.closed_at = now;
  return patch;
}

export async function syncAppointmentStatusForStage(
  clinicId: string,
  appointmentId: string | null | undefined,
  stage: GroomingStage,
) {
  if (!appointmentId) return;
  const nextStatus = appointmentStatusForGroomingStage(stage);
  if (!nextStatus) return;

  const { data: current } = await supabaseAdmin
    .from('hub_appointments')
    .select('status')
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  // Quitação financeira (`paid`) não é rebaixada por encerramento operacional (`done`).
  if (current?.status === 'paid' && nextStatus !== 'paid') {
    if (nextStatus === 'done') {
      void syncOpenComandasAfterAppointmentOperationalComplete(clinicId, appointmentId);
    }
    return;
  }

  await supabaseAdmin
    .from('hub_appointments')
    .update({ status: nextStatus })
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId);
  if (nextStatus === 'done' || nextStatus === 'paid') {
    void syncOpenComandasAfterAppointmentOperationalComplete(clinicId, appointmentId);
  }
}

/**
 * Transição de estágio da sessão de banho e tosa.
 * Usa estado esperado no update para evitar sobrescrever mudança concorrente da UI.
 */
export async function transitionGroomingSessionStage(opts: {
  clinicId: string;
  sessionId: string;
  to: GroomingStage;
  actorUserId?: string | null;
  skipResource?: boolean;
  hubResourceId?: string | null;
  source?: GroomingTransitionSource;
}): Promise<TransitionGroomingSessionResult> {
  const source: GroomingTransitionSource = opts.source ?? 'hub_ui';

  const { data: current, error: curErr } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select(GROOMING_SESSION_SELECT)
    .eq('id', opts.sessionId)
    .eq('clinic_id', opts.clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (curErr) return { status: 'error', message: curErr.message };
  if (!current) return { status: 'not_found' };

  const from = current.grooming_stage as GroomingStage;
  const to = opts.to;

  if (from === to) {
    return { status: 'already_applied', session: current as Record<string, unknown>, from, to };
  }

  if (!canTransitionGroomingStage(from, to)) {
    return {
      status: 'invalid_state',
      from,
      to,
      message: `Transição inválida: ${GROOMING_STAGE_LABELS[from]} → ${GROOMING_STAGE_LABELS[to]}`,
    };
  }

  if (to === 'in_service') {
    const decision = await prepareResourceForGroomingStart({
      clinicId: opts.clinicId,
      appointmentId: current.hub_appointment_id as string | null,
      hubResourceId: opts.hubResourceId,
      skipResource: opts.skipResource,
    });
    if (!decision.ok) {
      const message =
        typeof decision.body.error === 'string'
          ? decision.body.error
          : 'Não foi possível alocar o recurso para iniciar o atendimento.';
      return {
        status: 'resource_conflict',
        httpStatus: decision.status,
        body: decision.body,
        message,
      };
    }
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    grooming_stage: to,
    paused_at: null,
    ...stageTimestampsPatch(to, now),
  };

  const { data, error } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .update(patch)
    .eq('id', opts.sessionId)
    .eq('clinic_id', opts.clinicId)
    .eq('grooming_stage', from)
    .is('deleted_at', null)
    .select(GROOMING_SESSION_SELECT)
    .maybeSingle();

  if (error) return { status: 'error', message: error.message };

  if (!data) {
    const { data: refreshed } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select(GROOMING_SESSION_SELECT)
      .eq('id', opts.sessionId)
      .eq('clinic_id', opts.clinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!refreshed) return { status: 'not_found' };
    const currentStage = refreshed.grooming_stage as GroomingStage;
    if (currentStage === to) {
      return {
        status: 'already_applied',
        session: refreshed as Record<string, unknown>,
        from,
        to,
      };
    }
    return {
      status: 'invalid_state',
      from: currentStage,
      to,
      message: `Estado mudou durante a operação: agora está em ${GROOMING_STAGE_LABELS[currentStage]}.`,
    };
  }

  await logGroomingEvent({
    clinic_id: opts.clinicId,
    session_id: opts.sessionId,
    event_type: 'stage_change',
    body: `${GROOMING_STAGE_LABELS[from]} → ${GROOMING_STAGE_LABELS[to]}`,
    payload: { from, to, via: source },
  });

  await syncAppointmentStatusForStage(
    opts.clinicId,
    current.hub_appointment_id as string | null,
    to,
  );

  if (isGroomingServiceOperationallyDone(to)) {
    await releaseAppointmentResource(opts.clinicId, current.hub_appointment_id as string | null);
    try {
      await ensureGroomingAppointmentLinesExecuted({
        clinicId: opts.clinicId,
        appointmentId: current.hub_appointment_id as string | null,
        executedByStaffId: (current.hub_staff_member_id as string | null) ?? null,
      });
    } catch (markErr) {
      console.error('ensureGroomingAppointmentLinesExecuted', opts.sessionId, markErr);
    }
    void syncOpenComandasAfterGroomingClosed(opts.clinicId, opts.sessionId);
  }

  if (to === 'ready') {
    void notifyHubPetReady({
      clinicId: opts.clinicId,
      unitId: (current as Record<string, unknown>).unit_id as string | null,
      petId: (current as Record<string, unknown>).pet_id as string | null,
      sessionId: opts.sessionId,
      excludeUserIds: opts.actorUserId ? [opts.actorUserId] : undefined,
    });
  }

  scheduleReceptionSync(opts.clinicId, (current as { pet_id?: string | null }).pet_id);

  return {
    status: 'executed',
    session: data as Record<string, unknown>,
    from,
    to,
  };
}
