import { Router } from 'express';
import { publicPrescriptionLimiter } from '../../../middleware/rateLimiter';
import {
  getPublicExamOrderByToken,
  getPublicExamOrderPdf,
  validatePublicExamOrderByCode,
} from '../publicExamOrdersController';
import {
  getPublicSpecialistReferralByToken,
  getPublicSpecialistReferralPdf,
  validatePublicSpecialistReferralByCode,
} from '../publicSpecialistReferralsController';

const router = Router();

router.use(publicPrescriptionLimiter);

router.get('/exam-orders/validate', validatePublicExamOrderByCode);
router.get('/exam-orders/:token/pdf', getPublicExamOrderPdf);
router.get('/exam-orders/:token', getPublicExamOrderByToken);

router.get('/encaminhamentos/validate', validatePublicSpecialistReferralByCode);
router.get('/encaminhamentos/:token/pdf', getPublicSpecialistReferralPdf);
router.get('/encaminhamentos/:token', getPublicSpecialistReferralByToken);

export default router;
