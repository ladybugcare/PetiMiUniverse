"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/routes/vets.ts
const express_1 = __importDefault(require("express"));
const createVetPublic_1 = require("../controllers/vets/createVetPublic");
const checkVetEmail_1 = require("../controllers/vets/checkVetEmail");
const checkVetDocument_1 = require("../controllers/vets/checkVetDocument");
const getVets_1 = require("../controllers/vets/getVets");
const getVetById_1 = require("../controllers/vets/getVetById");
const checkVetOnboarding_1 = require("../controllers/vets/checkVetOnboarding");
const completeVetOnboarding_1 = require("../controllers/vets/completeVetOnboarding");
const uploadCrmvFile_1 = require("../controllers/vets/uploadCrmvFile");
const getPendingVets_1 = require("../controllers/vets/getPendingVets");
const approveVet_1 = require("../controllers/vets/approveVet");
const rejectVet_1 = require("../controllers/vets/rejectVet");
const getVetCompletedDemands_1 = require("../controllers/vets/getVetCompletedDemands");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
/**
 * ===========================================================
 * 🩺 FLUXO DE CADASTRO PÚBLICO DE VETERINÁRIOS
 * ===========================================================
 */
router.post('/', createVetPublic_1.createVetPublic);
/**
 * ===========================================================
 * 🔍 CONSULTAS E VALIDAÇÕES
 * ===========================================================
 */
// IMPORTANTE: Rotas específicas devem vir ANTES das rotas com parâmetros dinâmicos
router.get('/check-email/:email', checkVetEmail_1.checkVetEmail);
router.get('/check-document/:document_number', checkVetDocument_1.checkVetDocument);
router.get('/', getVets_1.getVets);
/**
 * ===========================================================
 * 📋 ONBOARDING DE VETERINÁRIOS
 * ===========================================================
 */
router.get('/onboarding/check', authMiddleware_1.authenticateUser, checkVetOnboarding_1.checkVetOnboarding);
router.post('/onboarding/complete', authMiddleware_1.authenticateUser, completeVetOnboarding_1.completeVetOnboarding);
router.post('/onboarding/upload-crmv', authMiddleware_1.authenticateUser, uploadCrmvFile_1.uploadCrmvFile);
/**
 * ===========================================================
 * ✅ APROVAÇÃO DE VETERINÁRIOS (ADMIN)
 * ===========================================================
 */
router.get('/pending', authMiddleware_1.authenticateUser, getPendingVets_1.getPendingVets);
/**
 * ===========================================================
 * 🔍 ROTAS COM PARÂMETROS DINÂMICOS (devem vir por último)
 * ===========================================================
 */
router.get('/:id', getVetById_1.getVetById);
router.get('/:id/completed-demands', getVetCompletedDemands_1.getVetCompletedDemands);
router.post('/:id/approve', authMiddleware_1.authenticateUser, approveVet_1.approveVet);
router.post('/:id/reject', authMiddleware_1.authenticateUser, rejectVet_1.rejectVet);
/**
 * (Opcional) rotas futuras com autenticação
 * router.put('/:id', authenticateUser, updateVet);
 */
exports.default = router;
