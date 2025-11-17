import express from 'express';
import {
  getReportedMessages,
  reviewReport,
  getConversationForSupport,
  getConversationForAudit,
  adminDeleteMessage,
} from '../controllers/messageReportsController';
import { authenticateUser } from '../middleware/authMiddleware';

const router = express.Router();

// Todas as rotas requerem autenticação
router.use(authenticateUser);

// TODO: Adicionar middleware para verificar se é admin
// Por enquanto, assumindo que o middleware authMiddleware já verifica isso

// ========================================
// ROTAS ADMIN - MENSAGENS REPORTADAS
// ========================================

// Listar mensagens reportadas
router.get('/reported', getReportedMessages);

// Revisar e resolver reporte
router.patch('/reports/:id/review', reviewReport);

// ========================================
// ROTAS ADMIN - ACESSO A CONVERSAS
// ========================================

// Obter conversa quando vinculada a ticket de suporte
router.get('/conversations/:id/support', getConversationForSupport);

// Obter conversa para auditoria
router.get('/conversations/:id/audit', getConversationForAudit);

// Deletar mensagem permanentemente (admin)
router.delete('/messages/:id', adminDeleteMessage);

export default router;




