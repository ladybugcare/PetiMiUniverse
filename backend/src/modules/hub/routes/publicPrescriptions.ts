import { Router } from 'express';
import { publicPrescriptionLimiter } from '../../../middleware/rateLimiter';
import {
  getPublicPrescriptionByToken,
  getPublicPrescriptionPdf,
  validatePublicPrescriptionByCode,
} from '../publicPrescriptionsController';

/**
 * Rotas públicas (sem autenticação) para validação read-only de receitas via token ou código.
 * Montado em app.ts como `/api/public`.
 */
const router = Router();

router.use(publicPrescriptionLimiter);

router.get('/prescriptions/validate', validatePublicPrescriptionByCode);
router.get('/prescriptions/:token/pdf', getPublicPrescriptionPdf);
router.get('/prescriptions/:token', getPublicPrescriptionByToken);

export default router;
