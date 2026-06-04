"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_js_1 = require("../middleware/authMiddleware.js");
const requireActiveClinic_js_1 = require("../middleware/requireActiveClinic.js");
const workProofController_js_1 = require("../controllers/workProofController.js");
const router = express_1.default.Router();
// Check-in (vet)
router.post('/demand-applications/:id/checkin', authMiddleware_js_1.authenticateUser, workProofController_js_1.checkIn);
// Check-out (vet)
router.post('/demand-applications/:id/checkout', authMiddleware_js_1.authenticateUser, workProofController_js_1.checkOut);
// Enviar relatório (vet)
router.post('/demand-applications/:id/report', authMiddleware_js_1.authenticateUser, workProofController_js_1.submitReport);
// Aprovar relatório (clínica)
router.post('/demand-applications/:id/approve-report', authMiddleware_js_1.authenticateUser, requireActiveClinic_js_1.requireActiveClinic, workProofController_js_1.approveReport);
// Obter prova de trabalho
router.get('/demand-applications/:id/work-proof', authMiddleware_js_1.authenticateUser, workProofController_js_1.getWorkProof);
exports.default = router;
