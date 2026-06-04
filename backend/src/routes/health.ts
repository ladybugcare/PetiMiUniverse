import express, { type Request, type Response } from 'express';
import { authenticateUser } from '../middleware/authMiddleware';
import { getSystemHealth } from '../controllers/healthController';

/**
 * Liveness — sem Supabase (probes Railway / balanceadores).
 * Montado em `app.ts` **antes** do CORS: probes e `curl` não enviam `Origin`;
 * o CORS global em produção rejeitava essas requisições com 500.
 */
export function liveHealthHandler(_req: Request, res: Response): void {
  // Público, sem credenciais — permite leitura a partir de qualquer origem (ex.: fetch de diagnóstico)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ status: 'ok', service: 'petivet-api' });
}

const router = express.Router();

// Health check detalhado (requer autenticação de admin)
router.get('/system', authenticateUser, getSystemHealth);

export default router;

