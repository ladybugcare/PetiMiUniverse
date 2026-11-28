import { SkillBuilders } from 'ask-sdk-core';
import {
  AlexaErrorHandler,
  CancelAndStopIntentHandler,
  FallbackIntentHandler,
  FinishBathIntentHandler,
  HelpIntentHandler,
  LaunchRequestHandler,
  ListPendingIntentHandler,
  MarkReadyIntentHandler,
  SessionEndedRequestHandler,
  StartServiceIntentHandler,
} from './alexaHandlers';

export function createPetmiAlexaSkill() {
  return SkillBuilders.custom()
    .addRequestHandlers(
      LaunchRequestHandler,
      StartServiceIntentHandler,
      MarkReadyIntentHandler,
      ListPendingIntentHandler,
      FinishBathIntentHandler,
      HelpIntentHandler,
      CancelAndStopIntentHandler,
      FallbackIntentHandler,
      SessionEndedRequestHandler,
    )
    .addErrorHandlers(AlexaErrorHandler)
    .create();
}
