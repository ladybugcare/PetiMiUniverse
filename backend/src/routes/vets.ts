// backend/routes/vets.ts
import express from 'express';
import { createVetPublic } from '../controllers/vets/createVetPublic';
import { checkVetEmail } from '../controllers/vets/checkVetEmail';
import { checkVetDocument } from '../controllers/vets/checkVetDocument';
import { getVets } from '../controllers/vets/getVets';
import { getVetById } from '../controllers/vets/getVetById';
import { checkVetOnboarding } from '../controllers/vets/checkVetOnboarding';
import { completeVetOnboarding } from '../controllers/vets/completeVetOnboarding';
import { uploadCrmvFile } from '../controllers/vets/uploadCrmvFile';
import { getPendingVets } from '../controllers/vets/getPendingVets';
import { approveVet } from '../controllers/vets/approveVet';
import { rejectVet } from '../controllers/vets/rejectVet';
import { getVetCompletedDemands } from '../controllers/vets/getVetCompletedDemands';
import { updateVet, updateVetPhoto } from '../controllers/vetsController';
import { authenticateUser } from '../middleware/authMiddleware';
import { statsLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * ===========================================================
 * 🩺 FLUXO DE CADASTRO PÚBLICO DE VETERINÁRIOS
 * ===========================================================
 */
router.post('/', createVetPublic);

/**
 * ===========================================================
 * 🔍 CONSULTAS E VALIDAÇÕES
 * ===========================================================
 */
// IMPORTANTE: Rotas específicas devem vir ANTES das rotas com parâmetros dinâmicos
router.get('/check-email/:email', checkVetEmail);
router.get('/check-document/:document_number', checkVetDocument);
router.get('/', getVets);

/**
 * ===========================================================
 * 📋 ONBOARDING DE VETERINÁRIOS
 * ===========================================================
 */
router.get('/onboarding/check', authenticateUser, checkVetOnboarding);
router.post('/onboarding/complete', authenticateUser, completeVetOnboarding);
router.post('/onboarding/upload-crmv', authenticateUser, uploadCrmvFile);

/**
 * ===========================================================
 * ✅ APROVAÇÃO DE VETERINÁRIOS (ADMIN)
 * ===========================================================
 */
// Aplicar rate limiter mais permissivo para rota de dashboard
router.get('/pending', statsLimiter, authenticateUser, getPendingVets);

/**
 * ===========================================================
 * 🔍 ROTAS COM PARÂMETROS DINÂMICOS (devem vir por último)
 * ===========================================================
 */
// PATCH mais específico antes de PATCH /:id
router.patch('/:id/photo', authenticateUser, updateVetPhoto);
router.patch('/:id', authenticateUser, updateVet);
router.get('/:id', getVetById);
router.get('/:id/completed-demands', getVetCompletedDemands);
router.post('/:id/approve', authenticateUser, approveVet);
router.post('/:id/reject', authenticateUser, rejectVet);

export default router;
