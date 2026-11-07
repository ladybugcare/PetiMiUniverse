import { Router } from 'express';
import { getPublicBoardingCare, postPublicBoardingCare } from '../hubBoardingCareController';

/**
 * Rotas públicas (sem autenticação): tutor confirma os cuidados antes da hospedagem.
 * Montado em app.ts como `/api/public`.
 */
const router = Router();

router.get('/boarding-care/:token', getPublicBoardingCare);
router.post('/boarding-care/:token', postPublicBoardingCare);

export default router;
