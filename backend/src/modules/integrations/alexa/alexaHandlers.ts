import type {
  HandlerInput,
  RequestHandler,
  ErrorHandler,
} from 'ask-sdk-core';
import { getRequestType, getIntentName, getSlotValue } from 'ask-sdk-core';
import type { IntentRequest, Response } from 'ask-sdk-model';
import {
  executeVoiceCommand,
  type VoiceIntent,
  type VoiceCommandResult,
} from '../../hub/voice/voiceCommandService';
import { expectedAlexaSkillId, resolveAlexaScope } from './alexaScope';

type ScopeAttrs = {
  clinicId: string;
  unitId: string;
  actorUserId: string;
};

function speak(handlerInput: HandlerInput, message: string, shouldEnd = true): Response {
  const builder = handlerInput.responseBuilder.speak(message);
  if (shouldEnd) builder.withShouldEndSession(true);
  return builder.getResponse();
}

function getAlexaUserId(handlerInput: HandlerInput): string | undefined {
  return handlerInput.requestEnvelope.context?.System?.user?.userId;
}

function getApplicationId(handlerInput: HandlerInput): string | undefined {
  return handlerInput.requestEnvelope.context?.System?.application?.applicationId;
}

function assertSkillId(handlerInput: HandlerInput): Response | null {
  const expected = expectedAlexaSkillId();
  if (!expected) return null;
  const actual = getApplicationId(handlerInput);
  if (actual !== expected) {
    console.warn('[alexa] skillId mismatch');
    return speak(handlerInput, 'Skill não autorizada.');
  }
  return null;
}

function resolveScopeOrSpeak(handlerInput: HandlerInput): ScopeAttrs | Response {
  const skillErr = assertSkillId(handlerInput);
  if (skillErr) return skillErr;

  const resolved = resolveAlexaScope(getAlexaUserId(handlerInput));
  if (!resolved.ok) {
    if (resolved.reason === 'disabled') {
      return speak(handlerInput, 'PetMi Voice está desabilitado.');
    }
    if (resolved.reason === 'misconfigured') {
      return speak(handlerInput, 'PetMi Voice está temporariamente indisponível.');
    }
    return speak(handlerInput, 'Dispositivo não autorizado. Peça ao administrador para vincular o Echo.');
  }
  return {
    clinicId: resolved.entry.clinicId,
    unitId: resolved.entry.unitId,
    actorUserId: resolved.entry.actorUserId,
  };
}

function isScope(value: ScopeAttrs | Response): value is ScopeAttrs {
  return Boolean(value && typeof value === 'object' && 'clinicId' in value);
}

function slotPetName(handlerInput: HandlerInput): string | null {
  const value = getSlotValue(handlerInput.requestEnvelope, 'pet');
  const trimmed = (value ?? '').trim();
  return trimmed || null;
}

function intentConfirmationStatus(handlerInput: HandlerInput): string {
  const req = handlerInput.requestEnvelope.request as IntentRequest;
  return req.intent?.confirmationStatus ?? 'NONE';
}

function logVoice(
  intent: string,
  result: VoiceCommandResult,
  startedAt: number,
): void {
  console.info(
    JSON.stringify({
      channel: 'alexa',
      intent,
      status: result.status,
      sessionId: result.sessionId ?? null,
      latencyMs: Date.now() - startedAt,
    }),
  );
}

async function runCommand(
  handlerInput: HandlerInput,
  intent: VoiceIntent,
  opts?: { petName?: string | null; confirmed?: boolean },
): Promise<Response> {
  const scopeOr = resolveScopeOrSpeak(handlerInput);
  if (!isScope(scopeOr)) return scopeOr;

  const startedAt = Date.now();
  const result = await executeVoiceCommand({
    intent,
    petName: opts?.petName,
    confirmed: opts?.confirmed,
    scope: {
      clinicId: scopeOr.clinicId,
      unitId: scopeOr.unitId,
      actorUserId: scopeOr.actorUserId,
    },
  });
  logVoice(intent, result, startedAt);

  if (result.status === 'needs_confirmation') {
    return handlerInput.responseBuilder
      .speak(result.message)
      .reprompt(result.message)
      .addConfirmIntentDirective()
      .getResponse();
  }

  return speak(handlerInput, result.message);
}

export const LaunchRequestHandler: RequestHandler = {
  canHandle(handlerInput) {
    return getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const scopeOr = resolveScopeOrSpeak(handlerInput);
    if (!isScope(scopeOr)) return scopeOr;
    return speak(
      handlerInput,
      'PetMi Voice. Você pode dizer: inicie o banho do Thor, a Mel está pronta, ou quem falta atender?',
      false,
    );
  },
};

export const StartServiceIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      getIntentName(handlerInput.requestEnvelope) === 'StartServiceIntent'
    );
  },
  async handle(handlerInput) {
    return runCommand(handlerInput, 'grooming.start_service', {
      petName: slotPetName(handlerInput),
    });
  },
};

export const MarkReadyIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      getIntentName(handlerInput.requestEnvelope) === 'MarkReadyIntent'
    );
  },
  async handle(handlerInput) {
    const confirmation = intentConfirmationStatus(handlerInput);
    if (confirmation === 'DENIED') {
      return speak(handlerInput, 'Ok, nada foi alterado.');
    }
    return runCommand(handlerInput, 'grooming.mark_ready', {
      petName: slotPetName(handlerInput),
      confirmed: confirmation === 'CONFIRMED',
    });
  },
};

export const ListPendingIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      getIntentName(handlerInput.requestEnvelope) === 'ListPendingIntent'
    );
  },
  async handle(handlerInput) {
    return runCommand(handlerInput, 'grooming.list_pending');
  },
};

export const FinishBathIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      getIntentName(handlerInput.requestEnvelope) === 'FinishBathIntent'
    );
  },
  async handle(handlerInput) {
    return runCommand(handlerInput, 'grooming.finish_bath', {
      petName: slotPetName(handlerInput),
    });
  },
};

export const HelpIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },
  handle(handlerInput) {
    return speak(
      handlerInput,
      'Exemplos: inicie o banho do Thor; a Mel está pronta; quem falta atender?',
      false,
    );
  },
};

export const CancelAndStopIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      (getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent' ||
        getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent')
    );
  },
  handle(handlerInput) {
    return speak(handlerInput, 'Até logo.');
  },
};

export const FallbackIntentHandler: RequestHandler = {
  canHandle(handlerInput) {
    return (
      getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent'
    );
  },
  handle(handlerInput) {
    return speak(
      handlerInput,
      'Não entendi. Diga, por exemplo: inicie o banho do Thor, ou quem falta atender?',
      false,
    );
  },
};

export const SessionEndedRequestHandler: RequestHandler = {
  canHandle(handlerInput) {
    return getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  },
};

export const AlexaErrorHandler: ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('[alexa] unhandled error', error);
    return speak(
      handlerInput,
      'Desculpe, ocorreu um erro. Tente de novo ou use o Hub.',
    );
  },
};
