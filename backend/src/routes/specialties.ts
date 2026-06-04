import express from 'express';
import { getSpecialties, createSpecialty, updateSpecialty, deleteSpecialty } from '../controllers/specialtiesController';
import { authenticateUser } from '../middleware/authMiddleware';

const router = express.Router();

// Rota pública para listar especialidades
router.get('/', getSpecialties);

// Rotas protegidas (apenas admin)
router.post('/', authenticateUser, createSpecialty);
router.put('/:id', authenticateUser, updateSpecialty);
router.delete('/:id', authenticateUser, deleteSpecialty);

export default router;

