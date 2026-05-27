"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_js_1 = require("../middleware/authMiddleware.js");
const requireActiveClinic_js_1 = require("../middleware/requireActiveClinic.js");
const demandInvitesController_js_1 = require("../controllers/demandInvitesController.js");
const router = express_1.default.Router();
// Convidar vet para demanda (apenas clínica)
router.post('/demands/:id/invite-vet', authMiddleware_js_1.authenticateUser, requireActiveClinic_js_1.requireActiveClinic, demandInvitesController_js_1.inviteVet);
// Aceitar convite (vet)
router.post('/demand-applications/:id/accept-invite', authMiddleware_js_1.authenticateUser, demandInvitesController_js_1.acceptInvite);
// Recusar convite (vet)
router.post('/demand-applications/:id/reject-invite', authMiddleware_js_1.authenticateUser, demandInvitesController_js_1.rejectInvite);
// Listar convites pendentes (vet)
router.get('/demand-applications/invites/pending', authMiddleware_js_1.authenticateUser, demandInvitesController_js_1.getPendingInvites);
exports.default = router;
