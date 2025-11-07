"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/routes/clinics.ts
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
// 🏥 Controladores novos (organizados)
const createClinicPublic_1 = require("../controllers/clinics/createClinicPublic");
const checkClinicCnpj_1 = require("../controllers/clinics/checkClinicCnpj");
const getClinics_1 = require("../controllers/clinics/getClinics");
const getClinicById_1 = require("../controllers/clinics/getClinicById");
// 🧩 Controladores antigos ainda úteis
const clinicsController_1 = require("../controllers/clinicsController");
const router = express_1.default.Router();
/**
 * ===========================================================
 * 🏥 FLUXO DE CADASTRO PÚBLICO
 * ===========================================================
 */
router.post('/', createClinicPublic_1.createClinicPublic);
/**
 * ===========================================================
 * 🔍 CONSULTAS E VALIDAÇÕES
 * ===========================================================
 */
router.get('/check-cnpj/:cnpj', checkClinicCnpj_1.checkClinicCnpj);
router.get('/check-email/:email', clinicsController_1.checkEmail);
router.get('/', getClinics_1.getClinics);
router.get('/:id', getClinicById_1.getClinicById);
/**
 * ===========================================================
 * 🏢 FLUXO INTERNO (clínicas autenticadas)
 * ===========================================================
 */
router.post('/register-with-unit', authMiddleware_1.authenticateUser, clinicsController_1.registerClinicWithUnit);
/**
 * ===========================================================
 * ✏️ ATUALIZAÇÃO DE DADOS
 * ===========================================================
 */
router.put('/:id', authMiddleware_1.authenticateUser, clinicsController_1.updateClinic);
/**
 * ===========================================================
 * 🖼️ FOTO E EXCLUSÃO
 * ===========================================================
 */
router.patch('/:id/photo', authMiddleware_1.authenticateUser, clinicsController_1.updateClinicPhoto);
router.delete('/:id', authMiddleware_1.authenticateUser, clinicsController_1.deleteClinic);
exports.default = router;
