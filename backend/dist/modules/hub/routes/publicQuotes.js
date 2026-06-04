"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hubQuotesController_1 = require("../hubQuotesController");
/**
 * Rotas públicas (sem autenticação) para acesso read-only a orçamentos via token.
 * Montado em app.ts como `/api/public`.
 */
const router = (0, express_1.Router)();
router.get('/quotes/:token', hubQuotesController_1.getPublicQuote);
exports.default = router;
