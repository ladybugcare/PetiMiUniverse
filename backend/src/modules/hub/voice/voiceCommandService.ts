import { supabaseAdmin } from '../../../config/supabase';
import { GROOMING_STAGE_LABELS, type GroomingStage } from '../groomingStages';
import { transitionGroomingSessionStage } from '../groomingSessionService';
import { normalizePetName } from './normalizePetName';

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
};

export type VoiceCommandInput = {
  intent: VoiceIntent;
  petName?: string | null;
  scope: VoiceScope;
  confirmed?: boolean;
};

export type VoiceCommandResult = {
  status:
    | 'executed'
    | 'already_applied'
    | 'needs_confirmation'
    | 'needs_disambiguation'
    | 'not_found'
    | 'invalid_state'
    | 'forbidden'
    | 'resource_conflict'
    | 'temporarily_unavailable';
  message: string;
  sessionId?: string;
  petName?: string;
  candidates?: Array<{ sessionId: string; petName: string; stage: GroomingStage }>;
};

type SessionTarget = {
  sessionId: string;
  petId: string;
  petName: string;
  stage: GroomingStage;
  hubAppointmentId: string | null;
  unitId: string | null;
};

const ACTIVE_STAGES: GroomingStage[] = ['queued', 'in_service', 'finishing', 'ready'];
const PENDING_LIST_STAGES: GroomingStage[] = ['queued', 'in_service', 'finishing'];

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

/** Sessões da unidade no dia operacional (alinhado ao board de banho e tosa). */
async function loadDaySessions(scope: VoiceScope): Promise<SessionTarget[]> {
  const { from, to } = dayBoundsSaoPaulo();

  const { data: appts, error: apptErr } = await supabaseAdmin
    .from('hub_appointments')
    .select('id')
    .eq('clinic_id', scope.clinicId)
    .eq('unit_id', scope.unitId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .lt('starts_at', to)
    .gt('ends_at', from)
    .limit(200);
  if (apptErr) throw new Error(apptErr.message);
  const dayAppointmentIds = new Set((appts ?? []).map((a: { id: string }) => a.id));

  const { data, error } = await supabaseAdmin
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

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row: Record<string, unknown>) => {
      const pet = row.hub_pets as { id?: string; name?: string } | null;
      return {
        sessionId: row.id as string,
        petId: (row.pet_id as string) ?? pet?.id ?? '',
        petName: (pet?.name ?? '').trim() || 'Pet',
        stage: row.grooming_stage as GroomingStage,
        hubAppointmentId: (row.hub_appointment_id as string | null) ?? null,
        unitId: (row.unit_id as string | null) ?? null,
        checkedInAt: (row.checked_in_at as string | null) ?? null,
        createdAt: (row.created_at as string) ?? '',
      };
    })
    .filter((s) =>
      isSessionOnGroomingDay(
        {
          hubAppointmentId: s.hubAppointmentId,
          checkedInAt: s.checkedInAt,
          createdAt: s.createdAt,
        },
        dayAppointmentIds,
        from,
        to,
      ),
    )
    .map(({ checkedInAt: _c, createdAt: _d, ...target }) => target);
}

export function resolveGroomingTargets(
  sessions: SessionTarget[],
  petName: string,
): { matches: SessionTarget[]; normalized: string } {
  const normalized = normalizePetName(petName);
  const matches = sessions.filter((s) => normalizePetName(s.petName) === normalized);
  return { matches, normalized };
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

function disambiguationResult(matches: SessionTarget[]): VoiceCommandResult {
  return {
    status: 'needs_disambiguation',
    message:
      'Encontrei mais de um pet com esse nome. Use o Hub para escolher o atendimento certo.',
    candidates: matches.map((m) => ({
      sessionId: m.sessionId,
      petName: m.petName,
      stage: m.stage,
    })),
  };
}

async function handleStartService(
  scope: VoiceScope,
  petName: string,
): Promise<VoiceCommandResult> {
  const sessions = await loadDaySessions(scope);
  const { matches } = resolveGroomingTargets(sessions, petName);
  if (matches.length === 0) {
    return {
      status: 'not_found',
      message: `Não encontrei ${petName} na fila de banho e tosa de hoje. Confira no Hub.`,
      petName,
    };
  }
  if (matches.length > 1) return disambiguationResult(matches);

  const target = matches[0]!;
  if (target.stage === 'in_service' || target.stage === 'finishing') {
    return {
      status: 'already_applied',
      message: `${target.petName} já está em atendimento.`,
      sessionId: target.sessionId,
      petName: target.petName,
    };
  }
  if (target.stage !== 'queued') {
    return {
      status: 'invalid_state',
      message: `${target.petName} está em ${GROOMING_STAGE_LABELS[target.stage]}. Não dá para iniciar agora.`,
      sessionId: target.sessionId,
      petName: target.petName,
    };
  }

  const result = await transitionGroomingSessionStage({
    clinicId: scope.clinicId,
    sessionId: target.sessionId,
    to: 'in_service',
    actorUserId: scope.actorUserId,
    source: 'voice_alexa',
  });

  if (result.status === 'executed' || result.status === 'already_applied') {
    return {
      status: result.status,
      message:
        result.status === 'already_applied'
          ? `${target.petName} já estava em atendimento.`
          : `Atendimento de ${target.petName} iniciado.`,
      sessionId: target.sessionId,
      petName: target.petName,
    };
  }
  if (result.status === 'resource_conflict') {
    return {
      status: 'resource_conflict',
      message: `${result.message} Escolha pelo Hub.`,
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

async function handleMarkReady(
  scope: VoiceScope,
  petName: string,
  confirmed: boolean,
): Promise<VoiceCommandResult> {
  const sessions = await loadDaySessions(scope);
  const { matches } = resolveGroomingTargets(sessions, petName);
  if (matches.length === 0) {
    return {
      status: 'not_found',
      message: `Não encontrei ${petName} na fila de banho e tosa de hoje. Confira no Hub.`,
      petName,
    };
  }
  if (matches.length > 1) return disambiguationResult(matches);

  const target = matches[0]!;
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
    source: 'voice_alexa',
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

async function handleListPending(scope: VoiceScope): Promise<VoiceCommandResult> {
  const sessions = await loadDaySessions(scope);
  const pending = sessions.filter((s) => PENDING_LIST_STAGES.includes(s.stage));
  if (pending.length === 0) {
    return {
      status: 'executed',
      message: 'Nenhum pet aguardando ou em atendimento agora.',
    };
  }

  const names = pending.map((s) => s.petName);
  let list: string;
  if (names.length === 1) list = names[0]!;
  else if (names.length === 2) list = `${names[0]} e ${names[1]}`;
  else list = `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;

  return {
    status: 'executed',
    message: `Faltam ${pending.length}: ${list}.`,
  };
}

function handleFinishBath(petName: string | null | undefined): VoiceCommandResult {
  const name = (petName ?? '').trim() || 'o pet';
  return {
    status: 'executed',
    message: `Para registrar o fim do atendimento, diga que ${name} está pronto.`,
    petName: petName ?? undefined,
  };
}

/** Executa um comando de voz autenticado/autorizado no escopo da conexão. */
export async function executeVoiceCommand(input: VoiceCommandInput): Promise<VoiceCommandResult> {
  if (!VOICE_INTENTS.includes(input.intent)) {
    return { status: 'forbidden', message: 'Esse comando não está disponível no PetMi Voice.' };
  }

  try {
    switch (input.intent) {
      case 'grooming.start_service': {
        const petName = (input.petName ?? '').trim();
        if (!petName) {
          return { status: 'not_found', message: 'Qual pet você quer iniciar?' };
        }
        return await handleStartService(input.scope, petName);
      }
      case 'grooming.mark_ready': {
        const petName = (input.petName ?? '').trim();
        if (!petName) {
          return { status: 'not_found', message: 'Qual pet está pronto?' };
        }
        return await handleMarkReady(input.scope, petName, Boolean(input.confirmed));
      }
      case 'grooming.list_pending':
        return await handleListPending(input.scope);
      case 'grooming.finish_bath':
        return handleFinishBath(input.petName);
      default:
        return { status: 'forbidden', message: 'Esse comando não está disponível no PetMi Voice.' };
    }
  } catch (e: unknown) {
    console.error('[voice] executeVoiceCommand', e);
    return {
      status: 'temporarily_unavailable',
      message: 'Não consegui processar agora. Tente de novo ou use o Hub.',
    };
  }
}
