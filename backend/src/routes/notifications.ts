import express from 'express';
import { authenticateUser } from '../middleware/authMiddleware';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications
} from '../controllers/notificationsController';

const router = express.Router();

router.use(authenticateUser);

// GET /api/notifications - Buscar notificações do usuário (paginadas)
// Query params: user_id (required), page (default: 1), limit (default: 20), unread_only (optional: true/false)
router.get('/', getNotifications);

// GET /api/notifications/unread-count - Contar notificações não lidas
// Query params: user_id (required)
router.get('/unread-count', getUnreadCount);

// PUT /api/notifications/:id/read - Marcar notificação como lida
router.put('/:id/read', markAsRead);

// PUT /api/notifications/read-all - Marcar todas como lidas
// Body: { user_id: string }
router.put('/read-all', markAllAsRead);

// DELETE /api/notifications/clear-read - Limpar todas as notificações lidas
// Body: { user_id: string }
router.delete('/clear-read', clearReadNotifications);

// DELETE /api/notifications/:id - Deletar notificação específica
router.delete('/:id', deleteNotification);

export default router;

