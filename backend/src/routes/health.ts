import express from 'express';
import { authenticateUser } from '../middleware/authMiddleware';
import { getSystemHealth } from '../controllers/healthController';

const router = express.Router();

/** Liveness — sem Supabase (probes Railway / balanceadores) */
router.get('/live', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'petivet-api' });
});

// Health check detalhado (requer autenticação de admin)
router.get('/system', authenticateUser, getSystemHealth);

export default router;

