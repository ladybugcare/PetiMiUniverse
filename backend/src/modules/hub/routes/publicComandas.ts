import { Router } from 'express';
import { getPublicComanda } from '../hubComandasController';

/**
 * Rotas públicas (sem autenticação) para acesso read-only a comandas via token.
 * Montado em app.ts como `/api/public`.
 */
const router = Router();

router.get('/comandas/:token', getPublicComanda);

export default router;
