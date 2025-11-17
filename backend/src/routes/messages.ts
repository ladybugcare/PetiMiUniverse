import express from 'express';
import {
  createConversation,
  getMyConversations,
  getConversation,
  sendMessage,
  markAsRead,
  archiveConversation,
  deleteMessage,
  reportMessage,
  getConversationMetadata,
} from '../controllers/messagesController';
import { authenticateUser } from '../middleware/authMiddleware';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateUser);

// ========================================
// ROTAS DE CONVERSAS
// ========================================

// Criar nova conversa
router.post('/conversations', createConversation);

// Listar minhas conversas
router.get('/conversations', getMyConversations);

// Obter conversa específica com mensagens
router.get('/conversations/:id', getConversation);

// Obter apenas metadados da conversa (sem conteúdo)
router.get('/conversations/:id/metadata', getConversationMetadata);

// Marcar mensagens como lidas
router.patch('/conversations/:id/read', markAsRead);

// Arquivar/desarquivar conversa
router.patch('/conversations/:id/archive', archiveConversation);

// ========================================
// ROTAS DE MENSAGENS
// ========================================

// Enviar mensagem em uma conversa
router.post('/conversations/:id/messages', sendMessage);

// Deletar mensagem (soft delete)
router.delete('/messages/:id', deleteMessage);

// Reportar mensagem
router.post('/messages/:id/report', reportMessage);

export default router;




