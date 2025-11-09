"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/routes/adminRoutes.ts
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
// Controllers de usuários
const createAdmin_1 = require("../controllers/admin/createAdmin");
const createClinic_1 = require("../controllers/admin/createClinic");
const createVet_1 = require("../controllers/admin/createVet");
const createFreelancer_1 = require("../controllers/admin/createFreelancer");
const getAdmins_1 = require("../controllers/admin/getAdmins");
// Controllers de unidades
const getPendingUnits_1 = require("../controllers/units/getPendingUnits");
const reviewUnit_1 = require("../controllers/units/reviewUnit");
// Controllers de documentos
const getVetDocument_1 = require("../controllers/admin/getVetDocument");
const router = express_1.default.Router();
/**
 * ==============================================
 * 🔹 ADMIN USER MANAGEMENT
 * ==============================================
 */
// Criar nova clínica
router.post('/users/create/clinic', authMiddleware_1.authenticateUser, createClinic_1.createClinic);
// Criar novo veterinário
router.post('/users/create/vet', authMiddleware_1.authenticateUser, createVet_1.createVet);
// Criar novo freelancer
router.post('/users/create/freelancer', authMiddleware_1.authenticateUser, createFreelancer_1.createFreelancer);
// Criar novo administrador
router.post('/users/create/admin', authMiddleware_1.authenticateUser, createAdmin_1.createAdmin);
// Listar administradores
router.get('/users/admins', authMiddleware_1.authenticateUser, getAdmins_1.getAdmins);
/**
 * ==============================================
 * 🔹 CLINIC UNITS MANAGEMENT
 * ==============================================
 */
// Listar unidades pendentes de aprovação
router.get('/pending-units', authMiddleware_1.authenticateUser, getPendingUnits_1.getPendingUnits);
// Aprovar ou rejeitar unidade
router.patch('/units/:id/review', authMiddleware_1.authenticateUser, reviewUnit_1.reviewUnit);
/**
 * ==============================================
 * 🔹 VET DOCUMENTS
 * ==============================================
 */
// Servir documento CRMV de veterinário (apenas para admins)
router.get('/vets/:vetId/document', authMiddleware_1.authenticateUser, getVetDocument_1.getVetDocument);
exports.default = router;
