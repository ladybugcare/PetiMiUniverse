// backend/src/routes/adminRoutes.ts
import express from 'express';
import { authenticateUser } from '../middleware/authMiddleware';
import { statsLimiter } from '../middleware/rateLimiter.js';

// Controllers de usuários
import { createAdmin } from '../controllers/admin/createAdmin';
import { createClinic } from '../controllers/admin/createClinic';
import { createVet } from '../controllers/admin/createVet';
import { createFreelancer } from '../controllers/admin/createFreelancer';
import { getAdmins } from '../controllers/admin/getAdmins';

// Controllers de unidades
import { getPendingUnits } from '../controllers/units/getPendingUnits';
import { reviewUnit } from '../controllers/units/reviewUnit';
import { getAllActiveUnits } from '../controllers/adminController';

// Controllers de documentos
import { getVetDocument } from '../controllers/admin/getVetDocument';

// Controllers de relatórios admin
import { getAdminOverview, getAdminSpecialties, getAdminUsage } from '../controllers/adminReportsController';

const router = express.Router();

// Aplicar rate limiter mais permissivo para rotas GET de dashboard (não para POST/PATCH)
router.get('*', statsLimiter);

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

// Listar todas as unidades ativas (aprovadas ou ativas)
router.get('/units', authenticateUser, getAllActiveUnits);

// Aprovar ou rejeitar unidade
router.patch('/units/:id/review', authenticateUser, reviewUnit);

/**
 * ==============================================
 * 🔹 VET DOCUMENTS
 * ==============================================
 */

// Servir documento CRMV de veterinário (apenas para admins)
router.get('/vets/:vetId/document', authenticateUser, getVetDocument);

/**
 * ==============================================
 * 🔹 ADMIN REPORTS
 * ==============================================
 */

// Get admin overview reports
router.get('/reports/overview', authenticateUser, getAdminOverview);

// Get admin specialties reports
router.get('/reports/specialties', authenticateUser, getAdminSpecialties);

// Get admin usage reports
router.get('/reports/usage', authenticateUser, getAdminUsage);

export default router;
