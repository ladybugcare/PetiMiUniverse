"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const unitsController_1 = require("../controllers/unitsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const requireActiveClinic_1 = require("../middleware/requireActiveClinic");
const router = express_1.default.Router();
// Create first unit (for new clinics - NO requireActiveClinic middleware)
router.post('/create-first', authMiddleware_1.authenticateUser, unitsController_1.createFirstUnit);
// Create unit (requires authentication + active clinic)
router.post('/create', authMiddleware_1.authenticateUser, requireActiveClinic_1.requireActiveClinic, unitsController_1.createUnit);
// Get units by clinic ID
router.get('/clinic/:clinic_id', authMiddleware_1.authenticateUser, unitsController_1.getUnitsByClinic);
// Get unit statistics
router.get('/:unitId/stats', authMiddleware_1.authenticateUser, unitsController_1.getUnitStats);
// Get unit by ID
router.get('/:id', authMiddleware_1.authenticateUser, unitsController_1.getUnitById);
// Update unit
router.patch('/:id', authMiddleware_1.authenticateUser, unitsController_1.updateUnit);
// Delete unit (soft delete)
router.delete('/:id', authMiddleware_1.authenticateUser, unitsController_1.deleteUnit);
exports.default = router;
