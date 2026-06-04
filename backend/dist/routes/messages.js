"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const messagesController_1 = require("../controllers/messagesController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Todas as rotas requerem autenticação
router.use(authMiddleware_1.authenticateUser);
// ========================================
// ROTAS DE CONVERSAS
// ========================================
// Criar nova conversa
router.post('/conversations', messagesController_1.createConversation);
// Listar minhas conversas
router.get('/conversations', messagesController_1.getMyConversations);
// Obter conversa específica com mensagens
router.get('/conversations/:id', messagesController_1.getConversation);
// Obter apenas metadados da conversa (sem conteúdo)
router.get('/conversations/:id/metadata', messagesController_1.getConversationMetadata);
// Marcar mensagens como lidas
router.patch('/conversations/:id/read', messagesController_1.markAsRead);
// Arquivar/desarquivar conversa
router.patch('/conversations/:id/archive', messagesController_1.archiveConversation);
// ========================================
// ROTAS DE MENSAGENS
// ========================================
// Enviar mensagem em uma conversa
router.post('/conversations/:id/messages', messagesController_1.sendMessage);
// Deletar mensagem (soft delete)
router.delete('/messages/:id', messagesController_1.deleteMessage);
// Reportar mensagem
router.post('/messages/:id/report', messagesController_1.reportMessage);
exports.default = router;
