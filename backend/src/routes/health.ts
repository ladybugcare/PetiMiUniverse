import express from 'express';
import { authenticateUser } from '../middleware/authMiddleware';
import { getSystemHealth } from '../controllers/healthController';

const router = express.Router();

// Health check detalhado (requer autenticação de admin)
router.get('/system', authenticateUser, getSystemHealth);

export default router;

