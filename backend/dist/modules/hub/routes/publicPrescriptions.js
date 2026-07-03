"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rateLimiter_1 = require("../../../middleware/rateLimiter");
const publicPrescriptionsController_1 = require("../publicPrescriptionsController");
/**
 * Rotas públicas (sem autenticação) para validação read-only de receitas via token ou código.
 * Montado em app.ts como `/api/public`.
 */
const router = (0, express_1.Router)();
router.use(rateLimiter_1.publicPrescriptionLimiter);
router.get('/prescriptions/validate', publicPrescriptionsController_1.validatePublicPrescriptionByCode);
router.get('/prescriptions/:token/pdf', publicPrescriptionsController_1.getPublicPrescriptionPdf);
router.get('/prescriptions/:token', publicPrescriptionsController_1.getPublicPrescriptionByToken);
exports.default = router;
