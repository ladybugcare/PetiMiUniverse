import { Router } from 'express';
import { publicBillingLinkLimiter } from '../../../middleware/rateLimiter';
import { getPublicChargeBundle, getPublicChargeBundlePdf } from '../hubChargeBundlesController';

/**
 * Rotas públicas (sem autenticação) para cobrança agrupada via token.
 * Montado em app.ts como `/api/public`.
 */
const router = Router();

router.use(publicBillingLinkLimiter);

router.get('/charge-bundles/:token', getPublicChargeBundle);
router.get('/charge-bundles/:token/pdf', getPublicChargeBundlePdf);

export default router;
