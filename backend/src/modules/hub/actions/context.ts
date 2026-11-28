import type { ActionContext, ActionProvider } from './types';
import type { GroomingTransitionSource } from '../groomingSessionService';

export function groomingSourceFromProvider(provider: ActionProvider): GroomingTransitionSource {
  switch (provider) {
    case 'alexa':
    case 'petmi_voice':
      return 'voice_alexa';
    case 'chatgpt':
      return 'chatgpt';
    case 'hub_web':
      return 'hub_ui';
    case 'system':
      return 'system';
    default:
      return 'action_engine';
  }
}

export function toVoiceScope(ctx: ActionContext): {
  clinicId: string;
  unitId: string;
  actorUserId: string;
  provider: ActionProvider;
} {
  return {
    clinicId: ctx.clinicId,
    unitId: ctx.unitId,
    actorUserId: ctx.userId,
    provider: ctx.provider,
  };
}
