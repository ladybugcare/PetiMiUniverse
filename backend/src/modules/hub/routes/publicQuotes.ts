import { Router } from 'express';
import { publicBillingLinkLimiter } from '../../../middleware/rateLimiter';
import { getPublicQuote } from '../hubQuotesController';

/**
 * Rotas públicas (sem autenticação) para acesso read-only a orçamentos via token.
 * Montado em app.ts como `/api/public`.
 */
const router = Router();

router.use(publicBillingLinkLimiter);

router.get('/quotes/:token', getPublicQuote);

export default router;
