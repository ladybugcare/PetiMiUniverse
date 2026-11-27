"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hubClinicPublicProfileController_1 = require("../hubClinicPublicProfileController");
/**
 * Rotas públicas (sem autenticação) para landing da clínica via slug.
 * Montado em app.ts como `/api/public`.
 */
const router = (0, express_1.Router)();
router.get('/clinics/:slug', hubClinicPublicProfileController_1.getPublicClinicProfileBySlug);
exports.default = router;
