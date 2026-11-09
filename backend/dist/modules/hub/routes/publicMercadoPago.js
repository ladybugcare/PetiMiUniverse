"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hubSubscriptionController_1 = require("../hubSubscriptionController");
/** Aviso do Mercado Pago (sem sessão). Montado em `/api/public`. */
const router = (0, express_1.Router)();
router.post('/mercadopago/webhook', hubSubscriptionController_1.postMercadoPagoWebhook);
exports.default = router;
