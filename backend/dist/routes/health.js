"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const healthController_1 = require("../controllers/healthController");
const router = express_1.default.Router();
// Health check detalhado (requer autenticação de admin)
router.get('/system', authMiddleware_1.authenticateUser, healthController_1.getSystemHealth);
exports.default = router;
