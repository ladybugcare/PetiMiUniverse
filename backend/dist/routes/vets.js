"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/routes/vets.ts
const express_1 = __importDefault(require("express"));
const createVetPublic_1 = require("../controllers/vets/createVetPublic");
const checkVetEmail_1 = require("../controllers/vets/checkVetEmail");
const getVets_1 = require("../controllers/vets/getVets");
const getVetById_1 = require("../controllers/vets/getVetById");
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
router.get('/check-email/:email', checkVetEmail_1.checkVetEmail);
router.get('/', getVets_1.getVets);
router.get('/:id', getVetById_1.getVetById);
/**
 * (Opcional) rotas futuras com autenticação
 * router.put('/:id', authenticateUser, updateVet);
 */
exports.default = router;
