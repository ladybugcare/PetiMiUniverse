// backend/src/routes/adminRoutes.ts
import express from 'express';
import { authenticateUser } from '../middleware/authMiddleware';

// Controllers de usuários
import { createAdmin } from '../controllers/admin/createAdmin';
import { createClinic } from '../controllers/admin/createClinic';
import { createVet } from '../controllers/admin/createVet';
import { createFreelancer } from '../controllers/admin/createFreelancer';
import { getAdmins } from '../controllers/admin/getAdmins';

// Controllers de unidades
import { getPendingUnits } from '../controllers/units/getPendingUnits';
import { reviewUnit } from '../controllers/units/reviewUnit';

// Controllers de documentos
import { getVetDocument } from '../controllers/admin/getVetDocument';

const router = express.Router();

/**
 * ==============================================
 * 🔹 ADMIN USER MANAGEMENT
 * ==============================================
 */

// Criar nova clínica
router.post('/users/create/clinic', authenticateUser, createClinic);

// Criar novo veterinário
router.post('/users/create/vet', authenticateUser, createVet);

// Criar novo freelancer
router.post('/users/create/freelancer', authenticateUser, createFreelancer);

// Criar novo administrador
router.post('/users/create/admin', authenticateUser, createAdmin);

// Listar administradores
router.get('/users/admins', authenticateUser, getAdmins);

/**
 * ==============================================
 * 🔹 CLINIC UNITS MANAGEMENT
 * ==============================================
 */

// Listar unidades pendentes de aprovação
router.get('/pending-units', authenticateUser, getPendingUnits);

// Aprovar ou rejeitar unidade
router.patch('/units/:id/review', authenticateUser, reviewUnit);

/**
 * ==============================================
 * 🔹 VET DOCUMENTS
 * ==============================================
 */

// Servir documento CRMV de veterinário (apenas para admins)
router.get('/vets/:vetId/document', authenticateUser, getVetDocument);

export default router;
