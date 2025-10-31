"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const adminController_1 = require("../controllers/adminController");
const router = express_1.default.Router();
// Get pending units (admin only)
router.get('/pending-units', authMiddleware_1.authenticateUser, adminController_1.getPendingUnits);
// Review unit (approve or reject) - admin only
router.patch('/units/:id/review', authMiddleware_1.authenticateUser, adminController_1.reviewUnit);
// Create new user (admin only)
router.post('/users', authMiddleware_1.authenticateUser, adminController_1.createUser);
// Get all admins (admin only)
router.get('/admins', authMiddleware_1.authenticateUser, adminController_1.getAdmins);
exports.default = router;
