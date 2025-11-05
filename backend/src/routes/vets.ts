// backend/routes/vets.ts
import express from 'express';
import { createVetPublic } from '../controllers/vets/createVetPublic';
import { checkVetEmail } from '../controllers/vets/checkVetEmail';
import { getVets } from '../controllers/vets/getVets';
import { getVetById } from '../controllers/vets/getVetById';
import { authenticateUser } from '../middleware/authMiddleware';

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
router.get('/check-email/:email', checkVetEmail);
router.get('/', getVets);
router.get('/:id', getVetById);

/**
 * (Opcional) rotas futuras com autenticação
 * router.put('/:id', authenticateUser, updateVet);
 */

export default router;
