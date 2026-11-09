"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const supportTicketsController_1 = require("../controllers/supportTicketsController");
const router = express_1.default.Router();
// ========================================
// ROTA PÚBLICA (SEM AUTENTICAÇÃO)
// ========================================
// Criar ticket público (para usuários não autenticados durante cadastro)
router.post('/tickets/public', supportTicketsController_1.createPublicTicket);
// ========================================
// ROTAS DE USUÁRIOS (SHIFT E HUB)
// ========================================
// Criar novo ticket de suporte
router.post('/tickets', authMiddleware_1.authenticateUser, supportTicketsController_1.createTicket);
// Obter tickets do usuário logado
router.get('/tickets/my', authMiddleware_1.authenticateUser, supportTicketsController_1.getUserTickets);
// Obter contagem de mensagens não lidas do usuário
router.get('/tickets/unread-count', authMiddleware_1.authenticateUser, supportTicketsController_1.getUnreadCount);
// Obter contagem de tickets por status (admin)
router.get('/tickets/count', authMiddleware_1.authenticateUser, authMiddleware_1.verifyAdmin, supportTicketsController_1.getTicketsCount);
// Obter mensagens de um ticket específico
router.get('/tickets/:id/messages', authMiddleware_1.authenticateUser, supportTicketsController_1.getTicketMessages);
// Adicionar mensagem a um ticket (user ou admin)
router.post('/tickets/:id/messages', authMiddleware_1.authenticateUser, supportTicketsController_1.addMessage);
// Marcar mensagens de um ticket como lidas
router.patch('/tickets/:id/messages/read', authMiddleware_1.authenticateUser, supportTicketsController_1.markMessagesAsRead);
// Criar avaliação do ticket (auto-resolve)
router.post('/tickets/:id/evaluate', authMiddleware_1.authenticateUser, supportTicketsController_1.createEvaluation);
// Marcar ticket como lido pelo usuário (DEPRECATED - usar markMessagesAsRead)
router.patch('/tickets/:id/read', authMiddleware_1.authenticateUser, supportTicketsController_1.markTicketAsRead);
// ========================================
// ROTAS DE ADMIN
// ========================================
// Obter todos os tickets (com filtro opcional de status/produto)
router.get('/tickets', authMiddleware_1.authenticateUser, authMiddleware_1.verifyAdmin, supportTicketsController_1.getAllTickets);
// Responder a um ticket (DEPRECATED - usar addMessage)
router.patch('/tickets/:id/reply', authMiddleware_1.authenticateUser, authMiddleware_1.verifyAdmin, supportTicketsController_1.replyToTicket);
// Atualizar status de um ticket
router.patch('/tickets/:id/status', authMiddleware_1.authenticateUser, authMiddleware_1.verifyAdmin, supportTicketsController_1.updateTicketStatus);
exports.default = router;
