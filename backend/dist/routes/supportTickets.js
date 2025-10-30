"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supportTicketsController_1 = require("../controllers/supportTicketsController");
const router = express_1.default.Router();
// ========================================
// ROTAS DE USUÁRIOS (CLINIC, VET)
// ========================================
// Criar novo ticket de suporte
router.post('/tickets', supportTicketsController_1.createTicket);
// Obter tickets do usuário logado
router.get('/tickets/my', supportTicketsController_1.getUserTickets);
// Obter mensagens de um ticket específico
router.get('/tickets/:id/messages', supportTicketsController_1.getTicketMessages);
// Adicionar mensagem a um ticket (user ou admin)
router.post('/tickets/:id/messages', supportTicketsController_1.addMessage);
// Marcar mensagens de um ticket como lidas
router.patch('/tickets/:id/messages/read', supportTicketsController_1.markMessagesAsRead);
// Criar avaliação do ticket (auto-resolve)
router.post('/tickets/:id/evaluate', supportTicketsController_1.createEvaluation);
// Marcar ticket como lido pelo usuário (DEPRECATED - usar markMessagesAsRead)
router.patch('/tickets/:id/read', supportTicketsController_1.markTicketAsRead);
// Obter contagem de mensagens não lidas do usuário
router.get('/tickets/unread-count', supportTicketsController_1.getUnreadCount);
// ========================================
// ROTAS DE ADMIN
// ========================================
// Obter todos os tickets (com filtro opcional de status)
router.get('/tickets', supportTicketsController_1.getAllTickets);
// Responder a um ticket (DEPRECATED - usar addMessage)
router.patch('/tickets/:id/reply', supportTicketsController_1.replyToTicket);
// Atualizar status de um ticket
router.patch('/tickets/:id/status', supportTicketsController_1.updateTicketStatus);
// Obter contagem de tickets por status
router.get('/tickets/count', supportTicketsController_1.getTicketsCount);
exports.default = router;
