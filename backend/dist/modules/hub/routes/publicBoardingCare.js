"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hubBoardingCareController_1 = require("../hubBoardingCareController");
/**
 * Rotas públicas (sem autenticação): tutor confirma os cuidados antes da hospedagem.
 * Montado em app.ts como `/api/public`.
 */
const router = (0, express_1.Router)();
router.get('/boarding-care/:token', hubBoardingCareController_1.getPublicBoardingCare);
router.post('/boarding-care/:token', hubBoardingCareController_1.postPublicBoardingCare);
exports.default = router;
