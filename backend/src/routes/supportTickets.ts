import express from 'express';
import { authenticateUser, verifyAdmin } from '../middleware/authMiddleware';
import {
  createTicket,
  createPublicTicket,
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
// ROTA PÚBLICA (SEM AUTENTICAÇÃO)
// ========================================

// Criar ticket público (para usuários não autenticados durante cadastro)
router.post('/tickets/public', createPublicTicket);

// ========================================
// ROTAS DE USUÁRIOS (SHIFT E HUB)
// ========================================

// Criar novo ticket de suporte
router.post('/tickets', authenticateUser, createTicket);

// Obter tickets do usuário logado
router.get('/tickets/my', authenticateUser, getUserTickets);

// Obter contagem de mensagens não lidas do usuário
router.get('/tickets/unread-count', authenticateUser, getUnreadCount);

// Obter contagem de tickets por status (admin)
router.get('/tickets/count', authenticateUser, verifyAdmin, getTicketsCount);

// Obter mensagens de um ticket específico
router.get('/tickets/:id/messages', authenticateUser, getTicketMessages);

// Adicionar mensagem a um ticket (user ou admin)
router.post('/tickets/:id/messages', authenticateUser, addMessage);

// Marcar mensagens de um ticket como lidas
router.patch('/tickets/:id/messages/read', authenticateUser, markMessagesAsRead);

// Criar avaliação do ticket (auto-resolve)
router.post('/tickets/:id/evaluate', authenticateUser, createEvaluation);

// Marcar ticket como lido pelo usuário (DEPRECATED - usar markMessagesAsRead)
router.patch('/tickets/:id/read', authenticateUser, markTicketAsRead);

// ========================================
// ROTAS DE ADMIN
// ========================================

// Obter todos os tickets (com filtro opcional de status/produto)
router.get('/tickets', authenticateUser, verifyAdmin, getAllTickets);

// Responder a um ticket (DEPRECATED - usar addMessage)
router.patch('/tickets/:id/reply', authenticateUser, verifyAdmin, replyToTicket);

// Atualizar status de um ticket
router.patch('/tickets/:id/status', authenticateUser, verifyAdmin, updateTicketStatus);

export default router;
