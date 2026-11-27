"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rateLimiter_1 = require("../../../middleware/rateLimiter");
const hubComandasController_1 = require("../hubComandasController");
/**
 * Rotas públicas (sem autenticação) para acesso read-only a comandas via token.
 * Montado em app.ts como `/api/public`.
 */
const router = (0, express_1.Router)();
router.use(rateLimiter_1.publicBillingLinkLimiter);
router.get('/comandas/:token', hubComandasController_1.getPublicComanda);
exports.default = router;
