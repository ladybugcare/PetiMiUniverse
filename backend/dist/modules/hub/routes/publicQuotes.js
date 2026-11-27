"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rateLimiter_1 = require("../../../middleware/rateLimiter");
const hubQuotesController_1 = require("../hubQuotesController");
/**
 * Rotas públicas (sem autenticação) para acesso read-only a orçamentos via token.
 * Montado em app.ts como `/api/public`.
 */
const router = (0, express_1.Router)();
router.use(rateLimiter_1.publicBillingLinkLimiter);
router.get('/quotes/:token', hubQuotesController_1.getPublicQuote);
exports.default = router;
