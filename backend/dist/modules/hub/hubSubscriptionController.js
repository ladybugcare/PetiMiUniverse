"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHubSubscriptionPlans = void 0;
const errorHandler_js_1 = require("../../middleware/errorHandler.js");
const hubSubscriptionService_js_1 = require("./hubSubscriptionService.js");
/** GET /api/hub/subscription/plans — catálogo público (pré-MVP: só Beta). */
exports.getHubSubscriptionPlans = (0, errorHandler_js_1.asyncHandler)(async (_req, res) => {
    const catalog = await (0, hubSubscriptionService_js_1.listPublicPlansAndModules)();
    res.json(catalog);
});
