import { Router } from 'express';
import { ExpressAdapter } from 'ask-sdk-express-adapter';
import { createPetmiAlexaSkill } from './alexaSkill';

/**
 * Webhook Alexa Custom Skill.
 * Deve ser montado ANTES de express.json global — o verificador de assinatura
 * precisa do corpo bruto (text/plain) fornecido pelo ExpressAdapter.
 */
const skill = createPetmiAlexaSkill();

const skipVerify =
  process.env.NODE_ENV === 'test' ||
  String(process.env.ALEXA_SKIP_SIGNATURE_VERIFICATION ?? '').toLowerCase() === 'true';

const adapter = new ExpressAdapter(skill, !skipVerify, !skipVerify);

const alexaRouter = Router();
alexaRouter.post('/', ...adapter.getRequestHandlers());

export default alexaRouter;
