"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const messageReportsController_1 = require("../controllers/messageReportsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Todas as rotas requerem autenticação
router.use(authMiddleware_1.authenticateUser);
// TODO: Adicionar middleware para verificar se é admin
// Por enquanto, assumindo que o middleware authMiddleware já verifica isso
// ========================================
// ROTAS ADMIN - MENSAGENS REPORTADAS
// ========================================
// Listar mensagens reportadas
router.get('/reported', messageReportsController_1.getReportedMessages);
// Revisar e resolver reporte
router.patch('/reports/:id/review', messageReportsController_1.reviewReport);
// ========================================
// ROTAS ADMIN - ACESSO A CONVERSAS
// ========================================
// Obter conversa quando vinculada a ticket de suporte
router.get('/conversations/:id/support', messageReportsController_1.getConversationForSupport);
// Obter conversa para auditoria
router.get('/conversations/:id/audit', messageReportsController_1.getConversationForAudit);
// Deletar mensagem permanentemente (admin)
router.delete('/messages/:id', messageReportsController_1.adminDeleteMessage);
exports.default = router;
