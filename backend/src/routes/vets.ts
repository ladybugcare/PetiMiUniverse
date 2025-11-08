// backend/routes/vets.ts
import express from 'express';
import { createVetPublic } from '../controllers/vets/createVetPublic';
import { checkVetEmail } from '../controllers/vets/checkVetEmail';
import { checkVetDocument } from '../controllers/vets/checkVetDocument';
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
// IMPORTANTE: Rotas específicas devem vir ANTES das rotas com parâmetros dinâmicos
router.get('/check-email/:email', checkVetEmail);
router.get('/check-document/:document_number', checkVetDocument);
router.get('/', getVets);
router.get('/:id', getVetById);

/**
 * (Opcional) rotas futuras com autenticação
 * router.put('/:id', authenticateUser, updateVet);
 */

export default router;
