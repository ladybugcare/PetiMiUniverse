import express from 'express';
import {
  createTicket,
  getUserTickets,
  getAllTickets,
  replyToTicket,
  updateTicketStatus,
  getTicketsCount,
  markTicketAsRead,
  getUnreadCount,
  addMessage,
  getTicketMessages,
  markMessagesAsRead,
  createEvaluation,
} from '../controllers/supportTicketsController';

const router = express.Router();

// ========================================
// ROTAS DE USUÁRIOS (CLINIC, VET)
// ========================================

// Criar novo ticket de suporte
router.post('/tickets', createTicket);

// Obter tickets do usuário logado
router.get('/tickets/my', getUserTickets);

// Obter mensagens de um ticket específico
router.get('/tickets/:id/messages', getTicketMessages);

// Adicionar mensagem a um ticket (user ou admin)
router.post('/tickets/:id/messages', addMessage);

// Marcar mensagens de um ticket como lidas
router.patch('/tickets/:id/messages/read', markMessagesAsRead);

// Criar avaliação do ticket (auto-resolve)
router.post('/tickets/:id/evaluate', createEvaluation);

// Marcar ticket como lido pelo usuário (DEPRECATED - usar markMessagesAsRead)
router.patch('/tickets/:id/read', markTicketAsRead);

// Obter contagem de mensagens não lidas do usuário
router.get('/tickets/unread-count', getUnreadCount);

// ========================================
// ROTAS DE ADMIN
// ========================================

// Obter todos os tickets (com filtro opcional de status)
router.get('/tickets', getAllTickets);

// Responder a um ticket (DEPRECATED - usar addMessage)
router.patch('/tickets/:id/reply', replyToTicket);

// Atualizar status de um ticket
router.patch('/tickets/:id/status', updateTicketStatus);

// Obter contagem de tickets por status
router.get('/tickets/count', getTicketsCount);

export default router;

