import { Router } from 'express';
import { getPublicClinicProfileBySlug } from '../hubClinicPublicProfileController';

/**
 * Rotas públicas (sem autenticação) para landing da clínica via slug.
 * Montado em app.ts como `/api/public`.
 */
const router = Router();

router.get('/clinics/:slug', getPublicClinicProfileBySlug);

export default router;
