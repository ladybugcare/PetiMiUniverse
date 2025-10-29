import express from 'express';
import {
  sendMessage,
  getConversation,
  getMyConversations,
  markAsRead,
  getUnreadCount,
} from '../controllers/marketplaceMessagesController';

const router = express.Router();

// Send a message
router.post('/', sendMessage);

// Get conversation for a specific item
router.get('/conversation', getConversation);

// Get all conversations for logged-in user
router.get('/conversations', getMyConversations);

// Mark messages as read
router.patch('/mark-read', markAsRead);

// Get unread message count
router.get('/unread-count', getUnreadCount);

export default router;

