"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/routes/freelancers.ts
const express_1 = __importDefault(require("express"));
const createFreelancerPublic_1 = require("../controllers/freelancers/createFreelancerPublic");
const checkFreelancerEmail_1 = require("../controllers/freelancers/checkFreelancerEmail");
const checkFreelancerDocument_1 = require("../controllers/freelancers/checkFreelancerDocument");
const getFreelancers_1 = require("../controllers/freelancers/getFreelancers");
const getFreelancerById_1 = require("../controllers/freelancers/getFreelancerById");
const checkFreelancerOnboarding_1 = require("../controllers/freelancers/checkFreelancerOnboarding");
const completeFreelancerOnboarding_1 = require("../controllers/freelancers/completeFreelancerOnboarding");
const uploadCertification_1 = require("../controllers/freelancers/uploadCertification");
const getPendingFreelancers_1 = require("../controllers/freelancers/getPendingFreelancers");
const approveFreelancer_1 = require("../controllers/freelancers/approveFreelancer");
const rejectFreelancer_1 = require("../controllers/freelancers/rejectFreelancer");
const authMiddleware_1 = require("../middleware/authMiddleware");
const rateLimiter_js_1 = require("../middleware/rateLimiter.js");
const router = express_1.default.Router();
/**
 * ===========================================================
 * 💼 FLUXO DE CADASTRO PÚBLICO DE FREELANCERS
 * ===========================================================
 */
router.post('/', createFreelancerPublic_1.createFreelancerPublic);
/**
 * ===========================================================
 * 🔍 CONSULTAS E VALIDAÇÕES
 * ===========================================================
 */
// IMPORTANTE: Rotas específicas devem vir ANTES das rotas com parâmetros dinâmicos
router.get('/check-email/:email', checkFreelancerEmail_1.checkFreelancerEmail);
router.get('/check-document/:document_number', checkFreelancerDocument_1.checkFreelancerDocument);
router.get('/', getFreelancers_1.getFreelancers);
/**
 * ===========================================================
 * 📋 ONBOARDING DE FREELANCERS
 * ===========================================================
 */
router.get('/onboarding/check', authMiddleware_1.authenticateUser, checkFreelancerOnboarding_1.checkFreelancerOnboarding);
router.post('/onboarding/complete', authMiddleware_1.authenticateUser, completeFreelancerOnboarding_1.completeFreelancerOnboarding);
router.post('/onboarding/upload-certification', authMiddleware_1.authenticateUser, uploadCertification_1.uploadCertification);
/**
 * ===========================================================
 * ✅ APROVAÇÃO DE FREELANCERS (ADMIN)
 * ===========================================================
 */
// Aplicar rate limiter mais permissivo para rota de dashboard
router.get('/pending', rateLimiter_js_1.statsLimiter, authMiddleware_1.authenticateUser, getPendingFreelancers_1.getPendingFreelancers);
/**
 * ===========================================================
 * 🔍 ROTAS COM PARÂMETROS DINÂMICOS (devem vir por último)
 * ===========================================================
 */
router.get('/:id', getFreelancerById_1.getFreelancerById);
router.post('/:id/approve', authMiddleware_1.authenticateUser, approveFreelancer_1.approveFreelancer);
router.post('/:id/reject', authMiddleware_1.authenticateUser, rejectFreelancer_1.rejectFreelancer);
exports.default = router;
