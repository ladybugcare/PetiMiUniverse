import { Router } from 'express';
import { publicBillingLinkLimiter } from '../../../middleware/rateLimiter';
import { getPublicComanda } from '../hubComandasController';

/**
 * Rotas públicas (sem autenticação) para acesso read-only a comandas via token.
 * Montado em app.ts como `/api/public`.
 */
const router = Router();

router.use(publicBillingLinkLimiter);

router.get('/comandas/:token', getPublicComanda);

export default router;
