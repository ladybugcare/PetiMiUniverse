// backend/routes/freelancers.ts
import express from 'express';
import { createFreelancerPublic } from '../controllers/freelancers/createFreelancerPublic';
import { checkFreelancerEmail } from '../controllers/freelancers/checkFreelancerEmail';
import { checkFreelancerDocument } from '../controllers/freelancers/checkFreelancerDocument';
import { getFreelancers } from '../controllers/freelancers/getFreelancers';
import { getFreelancerById } from '../controllers/freelancers/getFreelancerById';
import { checkFreelancerOnboarding } from '../controllers/freelancers/checkFreelancerOnboarding';
import { completeFreelancerOnboarding } from '../controllers/freelancers/completeFreelancerOnboarding';
import { getPendingFreelancers } from '../controllers/freelancers/getPendingFreelancers';
import { approveFreelancer } from '../controllers/freelancers/approveFreelancer';
import { rejectFreelancer } from '../controllers/freelancers/rejectFreelancer';
import { authenticateUser } from '../middleware/authMiddleware';

const router = express.Router();

/**
 * ===========================================================
 * 💼 FLUXO DE CADASTRO PÚBLICO DE FREELANCERS
 * ===========================================================
 */
router.post('/', createFreelancerPublic);

/**
 * ===========================================================
 * 🔍 CONSULTAS E VALIDAÇÕES
 * ===========================================================
 */
// IMPORTANTE: Rotas específicas devem vir ANTES das rotas com parâmetros dinâmicos
router.get('/check-email/:email', checkFreelancerEmail);
router.get('/check-document/:document_number', checkFreelancerDocument);
router.get('/', getFreelancers);

/**
 * ===========================================================
 * 📋 ONBOARDING DE FREELANCERS
 * ===========================================================
 */
router.get('/onboarding/check', authenticateUser, checkFreelancerOnboarding);
router.post('/onboarding/complete', authenticateUser, completeFreelancerOnboarding);

/**
 * ===========================================================
 * ✅ APROVAÇÃO DE FREELANCERS (ADMIN)
 * ===========================================================
 */
router.get('/pending', authenticateUser, getPendingFreelancers);

/**
 * ===========================================================
 * 🔍 ROTAS COM PARÂMETROS DINÂMICOS (devem vir por último)
 * ===========================================================
 */
router.get('/:id', getFreelancerById);
router.post('/:id/approve', authenticateUser, approveFreelancer);
router.post('/:id/reject', authenticateUser, rejectFreelancer);

export default router;

