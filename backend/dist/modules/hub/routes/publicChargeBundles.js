"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hubChargeBundlesController_1 = require("../hubChargeBundlesController");
/**
 * Rotas públicas (sem autenticação) para cobrança agrupada via token.
 * Montado em app.ts como `/api/public`.
 */
const router = (0, express_1.Router)();
router.get('/charge-bundles/:token', hubChargeBundlesController_1.getPublicChargeBundle);
router.get('/charge-bundles/:token/pdf', hubChargeBundlesController_1.getPublicChargeBundlePdf);
exports.default = router;
