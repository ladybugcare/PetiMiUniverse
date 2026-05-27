"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_js_1 = require("../middleware/authMiddleware.js");
const privacyGuard_js_1 = require("../middleware/privacyGuard.js");
const applicationsController_1 = require("../controllers/applicationsController");
const router = express_1.default.Router();
router.post('/apply', authMiddleware_js_1.authenticateUser, applicationsController_1.applyToDemand);
// Aplicar privacyGuard em rotas GET para garantir privacidade
router.get('/demand/:demand_id', authMiddleware_js_1.authenticateUser, privacyGuard_js_1.filterApplicationsByRole, applicationsController_1.getApplicationsByDemand);
router.get('/clinic', authMiddleware_js_1.authenticateUser, privacyGuard_js_1.filterApplicationsByRole, applicationsController_1.getApplicationsByClinic);
router.get('/unit/:unitId', authMiddleware_js_1.authenticateUser, privacyGuard_js_1.filterApplicationsByRole, applicationsController_1.getApplicationsByUnit);
router.get('/pending-count', authMiddleware_js_1.authenticateUser, privacyGuard_js_1.filterApplicationsByRole, applicationsController_1.getPendingApplicationsCount);
// Generic route that works for both vets and freelancers
router.get('/user/:userId', authMiddleware_js_1.authenticateUser, privacyGuard_js_1.filterApplicationsByRole, applicationsController_1.getApplicationsByUser);
// Legacy route for backwards compatibility
router.get('/vet/:vetId', authMiddleware_js_1.authenticateUser, privacyGuard_js_1.filterApplicationsByRole, applicationsController_1.getApplicationsByUser);
// Update application status (approve/reject)
router.patch('/:id/status', authMiddleware_js_1.authenticateUser, applicationsController_1.updateApplicationStatus);
// Check conflicts for an application
router.get('/:id/conflicts', authMiddleware_js_1.authenticateUser, applicationsController_1.checkConflicts);
// Validate conflict before applying
router.post('/validate-conflict', authMiddleware_js_1.authenticateUser, applicationsController_1.validateConflict);
exports.default = router;
