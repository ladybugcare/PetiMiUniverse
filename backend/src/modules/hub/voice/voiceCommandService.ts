/**
 * Compatibilidade Alexa / testes — delega à Action Engine.
 * Domínio vive em `actions/grooming/groomingDomain.ts`.
 */
import { executeAction } from '../actions/executeAction';
import {
  VOICE_INTENT_TO_ACTION,
  VOICE_INTENTS,
  type VoiceCommandInput,
  type VoiceCommandResult,
  type VoiceIntent,
  type VoiceScope,
} from '../actions/grooming/groomingDomain';

export {
  abandonStaleOpenSessionsForPet,
  dayBoundsSaoPaulo,
  isSessionOnGroomingDay,
  pickVoiceTarget,
  resolveGroomingTargets,
  VOICE_INTENTS,
  type VoiceCommandInput,
  type VoiceCommandResult,
  type VoiceIntent,
  type VoiceScope,
} from '../actions/grooming/groomingDomain';

/** Executa um comando de voz autenticado/autorizado no escopo da conexão. */
export async function executeVoiceCommand(input: VoiceCommandInput): Promise<VoiceCommandResult> {
  if (!VOICE_INTENTS.includes(input.intent)) {
    return { status: 'forbidden', message: 'Esse comando não está disponível no PetMi Voice.' };
  }

  const actionId = VOICE_INTENT_TO_ACTION[input.intent];
  const petName = (input.petName ?? '').trim();

  let params: Record<string, unknown> = {};
  if (input.intent === 'grooming.list_pending') {
    params = {};
  } else if (input.intent === 'grooming.finish_bath') {
    params = petName ? { pet_name: petName } : {};
  } else if (input.intent === 'grooming.mark_ready') {
    if (!petName) {
      return { status: 'not_found', message: 'Qual pet está pronto?' };
    }
    params = { pet_name: petName, confirmed: Boolean(input.confirmed) };
  } else {
    if (!petName) {
      return { status: 'not_found', message: 'Qual pet você quer iniciar?' };
    }
    params = { pet_name: petName };
  }

  const enforceRbac =
    String(process.env.PETMI_ALEXA_ENFORCE_RBAC ?? '').toLowerCase() === 'true';

  return executeAction({
    actionId,
    params,
    context: {
      userId: input.scope.actorUserId,
      clinicId: input.scope.clinicId,
      unitId: input.scope.unitId,
      provider: input.scope.provider ?? 'alexa',
      // Allowlist amarra o dispositivo; com PETMI_ALEXA_ENFORCE_RBAC=true valida permissões do actor.
      enforceRbac,
    },
  });
}
