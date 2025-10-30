"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const demandPositionsController_1 = require("../controllers/demandPositionsController");
const router = express_1.default.Router();
// Criar demanda composta com posições
router.post('/composite', demandPositionsController_1.createCompositeDemand);
// Listar posições disponíveis
router.get('/available', demandPositionsController_1.getAvailablePositions);
// Candidatar-se a uma posição
router.post('/apply', demandPositionsController_1.applyToPosition);
// Gerenciar candidaturas (Admin/Clínica)
router.patch('/applications/:application_id/accept', demandPositionsController_1.acceptApplication);
router.patch('/applications/:application_id/reject', demandPositionsController_1.rejectApplication);
// Obter candidaturas de uma posição
router.get('/positions/:position_id/applications', demandPositionsController_1.getPositionApplications);
// Obter demanda com suas posições
router.get('/demands/:demand_id/positions', demandPositionsController_1.getDemandWithPositions);
// Obter candidaturas do veterinário
router.get('/vets/:vet_id/applications', demandPositionsController_1.getVetApplications);
// Cancelar candidatura (pelo vet)
router.patch('/applications/:application_id/cancel', demandPositionsController_1.cancelApplication);
exports.default = router;
