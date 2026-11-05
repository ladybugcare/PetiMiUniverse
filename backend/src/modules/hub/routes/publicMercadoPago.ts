import { Router } from 'express';
import { postMercadoPagoWebhook } from '../hubSubscriptionController';

/** Aviso do Mercado Pago (sem sessão). Montado em `/api/public`. */
const router = Router();

router.post('/mercadopago/webhook', postMercadoPagoWebhook);

export default router;
