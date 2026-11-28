import { supabaseAdmin } from '../../../../config/supabase';
import {
  GROOMING_STAGE_LABELS,
  boardStageFromAppointmentStatus,
  type GroomingStage,
} from '../../groomingStages';
import {
  logGroomingEvent,
  syncAppointmentStatusForStage,
  transitionGroomingSessionStage,
  type GroomingTransitionSource,
} from '../../groomingSessionService';
import { OPEN_GROOMING_SESSION_STAGES } from '../../hubGroomingOpenPresence';
import { normalizePetName } from '../../voice/normalizePetName';
import { groomingSourceFromProvider } from '../context';
import type { ActionProvider, ActionResult } from '../types';

/** Intents legados Alexa — mapeados para action ids canônicos. */
export const VOICE_INTENTS = [
  'grooming.start_service',
  'grooming.mark_ready',
  'grooming.list_pending',
  'grooming.finish_bath',
] as const;

export type VoiceIntent = (typeof VOICE_INTENTS)[number];

export type VoiceScope = {
  clinicId: string;
  unitId: string;
  actorUserId: string;
  provider?: ActionProvider;
};

export type VoiceCommandInput = {
  intent: VoiceIntent;
  petName?: string | null;
  scope: VoiceScope;
  confirmed?: boolean;
};

export type VoiceCommandResult = ActionResult;

function transitionSource(scope: VoiceScope): GroomingTransitionSource {
  return groomingSourceFromProvider(scope.provider ?? 'alexa');
}

type DayTarget = {
  sessionId: string | null;
  appointmentId: string | null;
  petId: string;
  petName: string;
  stage: GroomingStage;
  unitId: string | null;
  startsAt: string | null;
};

const ACTIVE_STAGES: GroomingStage[] = ['queued', 'in_service', 'finishing', 'ready'];
/** Alinhado ao board: agendado/check-in ainda «faltam», mais fila e em atendimento. */
const PENDING_LIST_STAGES: GroomingStage[] = [
  'scheduled',
  'checked_in',
  'queued',
  'in_service',
  'finishing',
];
const PENDING_STAGE_RANK: Partial<Record<GroomingStage, number>> = {
  in_service: 5,
  finishing: 4,
  queued: 3,
  checked_in: 2,
  scheduled: 1,
};
const GROOMING_SERVICE_GROUP = 'banho_tosa';

/** Limites do dia civil em America/Sao_Paulo (igual ao day-board). */
export function dayBoundsSaoPaulo(now = new Date()): { from: string; to: string; dateYmd: string } {
  const dateYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return {
    from: new Date(`${dateYmd}T00:00:00-03:00`).toISOString(),
    to: new Date(`${dateYmd}T23:59:59.999-03:00`).toISOString(),
    dateYmd,
  };
}

/**
 * Mesmo critério do day-board: agendamento do dia, check-in no dia,
 * ou walk-in criado no dia. Evita sessões demo/antigas ainda "abertas".
 */
export function isSessionOnGroomingDay(
  session: {
    hubAppointmentId: string | null;
    checkedInAt: string | null;
    createdAt: string;
  },
  dayAppointmentIds: Set<string>,
  from: string,
  to: string,
): boolean {
  const aid = session.hubAppointmentId;
  if (aid && dayAppointmentIds.has(aid)) return true;
  const checkedIn = session.checkedInAt;
  if (checkedIn && checkedIn >= from && checkedIn <= to) return true;
  if (!aid && session.createdAt >= from && session.createdAt <= to) return true;
  return false;
}

async function getGroomingServiceTypeIds(clinicId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_types')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('service_group', GROOMING_SERVICE_GROUP)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: { id: string }) => r.id));
}

/**
 * Encerra sessões abertas do pet que não pertencem ao alvo do dia
 * (ex.: encaixe antigo preso em «em atendimento» enquanto o board mostra o agendamento de hoje).
 */
export async function abandonStaleOpenSessionsForPet(opts: {
  clinicId: string;
  petId: string;
  keepSessionId?: string | null;
  keepAppointmentId?: string | null;
}): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select('id, hub_appointment_id, grooming_stage')
    .eq('clinic_id', opts.clinicId)
    .eq('pet_id', opts.petId)
    .in('grooming_stage', [...OPEN_GROOMING_SESSION_STAGES])
    .is('deleted_at', null)
    .limit(20);
  if (error) throw new Error(error.message);

  let closed = 0;
  const now = new Date().toISOString();
  for (const row of data ?? []) {
    const id = row.id as string;
    const aid = (row.hub_appointment_id as string | null) ?? null;
    if (opts.keepSessionId && id === opts.keepSessionId) continue;
    if (opts.keepAppointmentId && aid === opts.keepAppointmentId) continue;

    const from = row.grooming_stage as GroomingStage;
    const { error: upErr } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .update({ grooming_stage: 'closed', closed_at: now, paused_at: null })
      .eq('id', id)
      .eq('clinic_id', opts.clinicId);
    if (upErr) throw new Error(upErr.message);

    await logGroomingEvent({
      clinic_id: opts.clinicId,
      session_id: id,
      event_type: 'stage_change',
      body: `${GROOMING_STAGE_LABELS[from] ?? from} → ${GROOMING_STAGE_LABELS.closed}`,
      payload: { from, to: 'closed', via: 'voice_stale_cleanup' },
    });
    await syncAppointmentStatusForStage(opts.clinicId, aid, 'closed');
    closed += 1;
  }
  return closed;
}

/** Alvos do board de hoje: sessões do dia + agendamentos B&T do dia sem sessão do dia. */
async function loadDayTargets(scope: VoiceScope): Promise<DayTarget[]> {
  const { from, to } = dayBoundsSaoPaulo();
  const groomingTypeIds = await getGroomingServiceTypeIds(scope.clinicId);

  const { data: apptsRaw, error: apptErr } = await supabaseAdmin
    .from('hub_appointments')
    .select(
      'id, pet_id, unit_id, status, appointment_kind, hub_service_type_id, starts_at, ends_at',
    )
    .eq('clinic_id', scope.clinicId)
    .eq('unit_id', scope.unitId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .lt('starts_at', to)
    .gt('ends_at', from)
    .limit(200);
  if (apptErr) throw new Error(apptErr.message);

  const apptRows = (apptsRaw ?? []) as Array<Record<string, unknown>>;
  const apptIds = apptRows.map((a) => a.id as string);

  const lineTypeIdsByAppt = new Map<string, string[]>();
  if (apptIds.length > 0) {
    const { data: lines, error: lineErr } = await supabaseAdmin
      .from('hub_appointment_services')
      .select('appointment_id, hub_service_type_id')
      .in('appointment_id', apptIds);
    if (lineErr) throw new Error(lineErr.message);
    for (const row of lines ?? []) {
      const aid = (row as { appointment_id: string }).appointment_id;
      const stid = (row as { hub_service_type_id: string }).hub_service_type_id;
      const list = lineTypeIdsByAppt.get(aid) ?? [];
      list.push(stid);
      lineTypeIdsByAppt.set(aid, list);
    }
  }

  const groomingAppts = apptRows.filter((a) => {
    const primary = a.hub_service_type_id as string | null;
    if (primary && groomingTypeIds.has(primary)) return true;
    const lines = lineTypeIdsByAppt.get(a.id as string) ?? [];
    return lines.some((id) => groomingTypeIds.has(id));
  });
  const dayAppointmentIds = new Set(groomingAppts.map((a) => a.id as string));

  const { data: sessRaw, error: sessErr } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select(
      `
      id,
      pet_id,
      unit_id,
      hub_appointment_id,
      grooming_stage,
      checked_in_at,
      created_at,
      hub_pets!inner ( id, name )
    `,
    )
    .eq('clinic_id', scope.clinicId)
    .eq('unit_id', scope.unitId)
    .is('deleted_at', null)
    .in('grooming_stage', ACTIVE_STAGES)
    .limit(100);
  if (sessErr) throw new Error(sessErr.message);

  const startsAtByAppt = new Map<string, string>();
  for (const a of groomingAppts) {
    startsAtByAppt.set(a.id as string, String(a.starts_at || ''));
  }

  const daySessions = (sessRaw ?? [])
    .map((row: Record<string, unknown>) => {
      const pet = row.hub_pets as { id?: string; name?: string } | null;
      return {
        sessionId: row.id as string,
        appointmentId: (row.hub_appointment_id as string | null) ?? null,
        petId: (row.pet_id as string) ?? pet?.id ?? '',
        petName: (pet?.name ?? '').trim() || 'Pet',
        stage: row.grooming_stage as GroomingStage,
        unitId: (row.unit_id as string | null) ?? null,
        checkedInAt: (row.checked_in_at as string | null) ?? null,
        createdAt: (row.created_at as string) ?? '',
      };
    })
    .filter((s) =>
      isSessionOnGroomingDay(
        {
          hubAppointmentId: s.appointmentId,
          checkedInAt: s.checkedInAt,
          createdAt: s.createdAt,
        },
        dayAppointmentIds,
        from,
        to,
      ),
    );

  const sessionByAppt = new Map<string, (typeof daySessions)[number]>();
  for (const s of daySessions) {
    if (s.appointmentId) sessionByAppt.set(s.appointmentId, s);
  }

  const petIdsNeeded = new Set<string>();
  for (const a of groomingAppts) {
    if (a.pet_id) petIdsNeeded.add(a.pet_id as string);
  }
  for (const s of daySessions) {
    if (s.petId) petIdsNeeded.add(s.petId);
  }
  const petNameById = new Map<string, string>();
  if (petIdsNeeded.size > 0) {
    const { data: pets, error: petErr } = await supabaseAdmin
      .from('hub_pets')
      .select('id, name')
      .eq('clinic_id', scope.clinicId)
      .in('id', [...petIdsNeeded]);
    if (petErr) throw new Error(petErr.message);
    for (const p of pets ?? []) {
      petNameById.set((p as { id: string }).id, String((p as { name: string }).name || '').trim() || 'Pet');
    }
  }

  const targets: DayTarget[] = daySessions.map((s) => ({
    sessionId: s.sessionId,
    appointmentId: s.appointmentId,
    petId: s.petId,
    petName: petNameById.get(s.petId) || s.petName,
    stage: s.stage,
    unitId: s.unitId,
    startsAt:
      (s.appointmentId ? startsAtByAppt.get(s.appointmentId) : null) ||
      s.checkedInAt ||
      s.createdAt ||
      null,
  }));

  for (const a of groomingAppts) {
    const apptId = a.id as string;
    if (sessionByAppt.has(apptId)) continue;
    const petId = (a.pet_id as string | null) ?? '';
    if (!petId) continue;
    const stage = boardStageFromAppointmentStatus(
      String(a.status || ''),
      a.appointment_kind as string | null,
    );
    if (stage === 'ready' || stage === 'closed' || stage === 'delivered') continue;
    targets.push({
      sessionId: null,
      appointmentId: apptId,
      petId,
      petName: petNameById.get(petId) || 'Pet',
      stage,
      unitId: (a.unit_id as string | null) ?? scope.unitId,
      startsAt: String(a.starts_at || '') || null,
    });
  }

  return targets;
}

export function resolveGroomingTargets(
  sessions: Array<{ petName: string } & Record<string, unknown>>,
  petName: string,
): { matches: typeof sessions; normalized: string } {
  const normalized = normalizePetName(petName);
  const matches = sessions.filter((s) => normalizePetName(s.petName) === normalized);
  return { matches, normalized };
}

/**
 * Homônimos (pets distintos) → desambiguar.
 * Vários agendamentos do mesmo pet no dia (ex.: Frete 16h e 20h) → pega o próximo (estágio + horário).
 */
export function pickVoiceTarget<T extends DayTarget>(
  matches: T[],
): { kind: 'one'; target: T } | { kind: 'homonyms'; matches: T[] } | { kind: 'none' } {
  if (matches.length === 0) return { kind: 'none' };
  const byPet = new Map<string, T[]>();
  for (const m of matches) {
    const list = byPet.get(m.petId) ?? [];
    list.push(m);
    byPet.set(m.petId, list);
  }
  if (byPet.size > 1) return { kind: 'homonyms', matches };
  const samePet = [...byPet.values()][0] ?? [];
  if (samePet.length === 1) return { kind: 'one', target: samePet[0]! };

  samePet.sort((a, b) => {
    const rankA = PENDING_STAGE_RANK[a.stage] ?? 0;
    const rankB = PENDING_STAGE_RANK[b.stage] ?? 0;
    if (rankA !== rankB) return rankB - rankA;
    const ta = a.startsAt ? new Date(a.startsAt).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.startsAt ? new Date(b.startsAt).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  return { kind: 'one', target: samePet[0]! };
}

type ResourceOption = { id: string; name?: string; busy?: boolean };

async function transitionInServiceForVoice(opts: {
  clinicId: string;
  sessionId: string;
  actorUserId: string;
  source: GroomingTransitionSource;
}): Promise<{
  result: Awaited<ReturnType<typeof transitionGroomingSessionStage>>;
  spokenExtra?: string;
}> {
  const first = await transitionGroomingSessionStage({
    clinicId: opts.clinicId,
    sessionId: opts.sessionId,
    to: 'in_service',
    actorUserId: opts.actorUserId,
    source: opts.source,
  });
  if (first.status !== 'resource_conflict') return { result: first };

  const body = (first.body ?? {}) as { resources?: ResourceOption[] };
  const resources = Array.isArray(body.resources) ? body.resources : [];
  const free = resources.find((r) => r && r.id && !r.busy);
  if (free) {
    const retry = await transitionGroomingSessionStage({
      clinicId: opts.clinicId,
      sessionId: opts.sessionId,
      to: 'in_service',
      actorUserId: opts.actorUserId,
      source: opts.source,
      hubResourceId: free.id,
    });
    if (retry.status === 'executed' || retry.status === 'already_applied') {
      return {
        result: retry,
        spokenExtra: `na ${free.name || 'banheira livre'}`,
      };
    }
    if (retry.status !== 'resource_conflict') return { result: retry };
  }

  // Igual ao Hub com política opcional: inicia sem alocar se nada estiver livre.
  const skip = await transitionGroomingSessionStage({
    clinicId: opts.clinicId,
    sessionId: opts.sessionId,
    to: 'in_service',
    actorUserId: opts.actorUserId,
    source: opts.source,
    hubResourceId: null,
    skipResource: true,
  });
  if (skip.status === 'executed' || skip.status === 'already_applied') {
    return { result: skip, spokenExtra: 'sem banheira alocada' };
  }
  return { result: first };
}

async function petHasActiveBoarding(clinicId: string, petId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('hub_boarding_reservations')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('pet_id', petId)
    .is('deleted_at', null)
    .in('status', ['checked_in', 'checkout_preparing', 'ready_for_handoff'])
    .limit(1);
  if (error) {
    console.warn('[voice] boarding lookup failed', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

function disambiguationResult(matches: DayTarget[]): VoiceCommandResult {
  return {
    status: 'needs_disambiguation',
    message:
      'Encontrei mais de um pet com esse nome. Use o Hub para escolher o atendimento certo.',
    candidates: matches.map((m) => ({
      sessionId: m.sessionId ?? m.appointmentId ?? '',
      petName: m.petName,
      stage: m.stage,
    })),
  };
}

async function ensureSessionForStart(
  scope: VoiceScope,
  target: DayTarget,
): Promise<{ ok: true; sessionId: string } | { ok: false; result: VoiceCommandResult }> {
  // Import dinâmico evita ciclo hubGroomingController ↔ actions no boot do Railway.
  const { ensureGroomingQueuedForAppointment } = await import('../../hubGroomingController');

  if (target.sessionId) {
    await abandonStaleOpenSessionsForPet({
      clinicId: scope.clinicId,
      petId: target.petId,
      keepSessionId: target.sessionId,
      keepAppointmentId: target.appointmentId,
    });
    if (
      (target.stage === 'scheduled' || target.stage === 'checked_in') &&
      target.appointmentId
    ) {
      const bumped = await ensureGroomingQueuedForAppointment(
        scope.clinicId,
        target.appointmentId,
      );
      if (!bumped.ok) {
        return {
          ok: false,
          result: {
            status: 'temporarily_unavailable',
            message: bumped.error || 'Não consegui colocar na fila. Use o Hub.',
            petName: target.petName,
          },
        };
      }
    } else if (target.stage === 'scheduled' || target.stage === 'checked_in') {
      const toQueued = await transitionGroomingSessionStage({
        clinicId: scope.clinicId,
        sessionId: target.sessionId,
        to: 'queued',
        actorUserId: scope.actorUserId,
        source: transitionSource(scope),
      });
      if (toQueued.status !== 'executed' && toQueued.status !== 'already_applied') {
        return {
          ok: false,
          result: {
            status: 'temporarily_unavailable',
            message: 'Não consegui colocar na fila. Use o Hub.',
            petName: target.petName,
            sessionId: target.sessionId,
          },
        };
      }
    }
    return { ok: true, sessionId: target.sessionId };
  }

  if (!target.appointmentId) {
    return {
      ok: false,
      result: {
        status: 'not_found',
        message: `Não encontrei atendimento de ${target.petName} hoje. Confira no Hub.`,
        petName: target.petName,
      },
    };
  }

  await abandonStaleOpenSessionsForPet({
    clinicId: scope.clinicId,
    petId: target.petId,
    keepAppointmentId: target.appointmentId,
  });

  const ensured = await ensureGroomingQueuedForAppointment(scope.clinicId, target.appointmentId);
  if (!ensured.ok) {
    return {
      ok: false,
      result: {
        status: 'temporarily_unavailable',
        message: ensured.error || 'Não consegui abrir a sessão. Use o Hub.',
        petName: target.petName,
      },
    };
  }

  const { data: session, error } = await supabaseAdmin
    .from('hub_grooming_sessions')
    .select('id')
    .eq('clinic_id', scope.clinicId)
    .eq('hub_appointment_id', target.appointmentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !session) {
    return {
      ok: false,
      result: {
        status: 'temporarily_unavailable',
        message: 'Não consegui abrir a sessão. Use o Hub.',
        petName: target.petName,
      },
    };
  }
  return { ok: true, sessionId: session.id as string };
}

export async function handleStartService(
  scope: VoiceScope,
  petName: string,
): Promise<VoiceCommandResult> {
  const targets = await loadDayTargets(scope);
  const { matches } = resolveGroomingTargets(targets, petName);
  const picked = pickVoiceTarget(matches as DayTarget[]);
  if (picked.kind === 'none') {
    return {
      status: 'not_found',
      message: `Não encontrei ${petName} na fila de banho e tosa de hoje. Confira no Hub.`,
      petName,
    };
  }
  if (picked.kind === 'homonyms') return disambiguationResult(picked.matches);

  const target = picked.target;
  if (target.sessionId && (target.stage === 'in_service' || target.stage === 'finishing')) {
    return {
      status: 'already_applied',
      message: `${target.petName} já está em atendimento.`,
      sessionId: target.sessionId,
      petName: target.petName,
    };
  }
  if (target.stage === 'ready') {
    return {
      status: 'invalid_state',
      message: `${target.petName} já está pronta. Não dá para iniciar agora.`,
      sessionId: target.sessionId ?? undefined,
      petName: target.petName,
    };
  }

  const ensured = await ensureSessionForStart(scope, target);
  if (!ensured.ok) return ensured.result;

  const { result, spokenExtra } = await transitionInServiceForVoice({
    clinicId: scope.clinicId,
    sessionId: ensured.sessionId,
    actorUserId: scope.actorUserId,
    source: transitionSource(scope),
  });

  if (result.status === 'executed' || result.status === 'already_applied') {
    return {
      status: result.status,
      message:
        result.status === 'already_applied'
          ? `${target.petName} já estava em atendimento.`
          : spokenExtra
            ? `Atendimento de ${target.petName} iniciado ${spokenExtra}.`
            : `Atendimento de ${target.petName} iniciado.`,
      sessionId: ensured.sessionId,
      petName: target.petName,
    };
  }
  if (result.status === 'resource_conflict') {
    return {
      status: 'resource_conflict',
      message: `${result.message} Escolha pelo Hub.`,
      sessionId: ensured.sessionId,
      petName: target.petName,
    };
  }
  if (result.status === 'invalid_state') {
    return {
      status: 'invalid_state',
      message: result.message,
      sessionId: ensured.sessionId,
      petName: target.petName,
    };
  }
  if (result.status === 'not_found') {
    return {
      status: 'not_found',
      message: `Não encontrei a sessão de ${petName}. Confira no Hub.`,
      petName,
    };
  }
  return {
    status: 'temporarily_unavailable',
    message: 'Não consegui atualizar agora. Tente de novo ou use o Hub.',
    sessionId: ensured.sessionId,
    petName: target.petName,
  };
}

export async function handleMarkReady(
  scope: VoiceScope,
  petName: string,
  confirmed: boolean,
): Promise<VoiceCommandResult> {
  const targets = await loadDayTargets(scope);
  const { matches } = resolveGroomingTargets(targets, petName);
  const picked = pickVoiceTarget(matches as DayTarget[]);
  if (picked.kind === 'none') {
    return {
      status: 'not_found',
      message: `Não encontrei ${petName} na fila de banho e tosa de hoje. Confira no Hub.`,
      petName,
    };
  }
  if (picked.kind === 'homonyms') return disambiguationResult(picked.matches);

  const target = picked.target;
  if (!target.sessionId) {
    return {
      status: 'invalid_state',
      message: `${target.petName} ainda não está em atendimento. Inicie o banho ou a tosa primeiro.`,
      petName: target.petName,
    };
  }
  if (target.stage === 'ready') {
    return {
      status: 'already_applied',
      message: `${target.petName} já está marcada como pronta.`,
      sessionId: target.sessionId,
      petName: target.petName,
    };
  }
  if (target.stage !== 'in_service' && target.stage !== 'finishing') {
    return {
      status: 'invalid_state',
      message: `${target.petName} está em ${GROOMING_STAGE_LABELS[target.stage]}. Só dá para marcar pronto durante o atendimento.`,
      sessionId: target.sessionId,
      petName: target.petName,
    };
  }

  if (!confirmed) {
    return {
      status: 'needs_confirmation',
      message: `${target.petName}, atendimento de banho e tosa. Confirmar que está pronta?`,
      sessionId: target.sessionId,
      petName: target.petName,
    };
  }

  const result = await transitionGroomingSessionStage({
    clinicId: scope.clinicId,
    sessionId: target.sessionId,
    to: 'ready',
    actorUserId: scope.actorUserId,
    source: transitionSource(scope),
  });

  if (result.status === 'executed' || result.status === 'already_applied') {
    const boarding = await petHasActiveBoarding(scope.clinicId, target.petId);
    const message = boarding
      ? `Atendimento de ${target.petName} marcado como pronto.`
      : `Atendimento de ${target.petName} finalizado. Está aguardando retirada.`;
    return {
      status: result.status,
      message,
      sessionId: target.sessionId,
      petName: target.petName,
    };
  }
  if (result.status === 'invalid_state') {
    return {
      status: 'invalid_state',
      message: result.message,
      sessionId: target.sessionId,
      petName: target.petName,
    };
  }
  if (result.status === 'not_found') {
    return {
      status: 'not_found',
      message: `Não encontrei a sessão de ${petName}. Confira no Hub.`,
      petName,
    };
  }
  return {
    status: 'temporarily_unavailable',
    message: 'Não consegui atualizar agora. Tente de novo ou use o Hub.',
    sessionId: target.sessionId,
    petName: target.petName,
  };
}

export async function handleListPending(scope: VoiceScope): Promise<VoiceCommandResult> {
  const targets = await loadDayTargets(scope);
  const pending = targets.filter((s) => PENDING_LIST_STAGES.includes(s.stage));
  if (pending.length === 0) {
    return {
      status: 'executed',
      message: 'Nenhum pet aguardando ou em atendimento agora.',
    };
  }

  // Um nome por pet (vários agendamentos no dia → escolhe o estágio mais avançado).
  const byPet = new Map<string, DayTarget>();
  for (const t of pending) {
    const prev = byPet.get(t.petId);
    if (!prev) {
      byPet.set(t.petId, t);
      continue;
    }
    const prevRank = PENDING_STAGE_RANK[prev.stage] ?? 0;
    const nextRank = PENDING_STAGE_RANK[t.stage] ?? 0;
    if (nextRank > prevRank) byPet.set(t.petId, t);
  }
  const unique = [...byPet.values()];
  const names = unique.map((s) => s.petName);
  let list: string;
  if (names.length === 1) list = names[0]!;
  else if (names.length === 2) list = `${names[0]} e ${names[1]}`;
  else list = `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;

  return {
    status: 'executed',
    message: `Faltam ${unique.length}: ${list}.`,
  };
}

export function handleFinishBath(petName: string | null | undefined): VoiceCommandResult {
  const name = (petName ?? '').trim() || 'o pet';
  return {
    status: 'executed',
    message: `Para registrar o fim do atendimento, diga que ${name} está pronto.`,
    petName: petName ?? undefined,
  };
}

/** Action ids canônicos (ChatGPT / engine). */
export const GROOMING_ACTION_IDS = {
  list: 'grooming.list_active_appointments',
  start: 'grooming.start_bath',
  markReady: 'grooming.mark_ready',
  finishBathHint: 'grooming.finish_bath_hint',
} as const;

export const VOICE_INTENT_TO_ACTION: Record<VoiceIntent, string> = {
  'grooming.list_pending': GROOMING_ACTION_IDS.list,
  'grooming.start_service': GROOMING_ACTION_IDS.start,
  'grooming.mark_ready': GROOMING_ACTION_IDS.markReady,
  'grooming.finish_bath': GROOMING_ACTION_IDS.finishBathHint,
};
