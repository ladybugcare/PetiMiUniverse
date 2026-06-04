"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const marketplaceMessagesController_1 = require("../controllers/marketplaceMessagesController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Todas as rotas exigem usuário autenticado
router.use(authMiddleware_1.authenticateUser);
// Send a message
router.post('/', marketplaceMessagesController_1.sendMessage);
// Get conversation for a specific item
router.get('/conversation', marketplaceMessagesController_1.getConversation);
// Get all conversations for logged-in user
router.get('/conversations', marketplaceMessagesController_1.getMyConversations);
// Mark messages as read
router.patch('/mark-read', marketplaceMessagesController_1.markAsRead);
// Get unread message count
router.get('/unread-count', marketplaceMessagesController_1.getUnreadCount);
exports.default = router;
