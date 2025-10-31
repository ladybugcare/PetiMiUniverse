"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notificationsController_1 = require("../controllers/notificationsController");
const router = express_1.default.Router();
// GET /api/notifications - Buscar notificações do usuário (paginadas)
// Query params: user_id (required), page (default: 1), limit (default: 20), unread_only (optional: true/false)
router.get('/', notificationsController_1.getNotifications);
// GET /api/notifications/unread-count - Contar notificações não lidas
// Query params: user_id (required)
router.get('/unread-count', notificationsController_1.getUnreadCount);
// PUT /api/notifications/:id/read - Marcar notificação como lida
router.put('/:id/read', notificationsController_1.markAsRead);
// PUT /api/notifications/read-all - Marcar todas como lidas
// Body: { user_id: string }
router.put('/read-all', notificationsController_1.markAllAsRead);
// DELETE /api/notifications/:id - Deletar notificação específica
router.delete('/:id', notificationsController_1.deleteNotification);
// DELETE /api/notifications/clear-read - Limpar todas as notificações lidas
// Body: { user_id: string }
router.delete('/clear-read', notificationsController_1.clearReadNotifications);
exports.default = router;
