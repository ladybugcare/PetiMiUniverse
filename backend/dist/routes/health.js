"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.liveHealthHandler = liveHealthHandler;
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const healthController_1 = require("../controllers/healthController");
/**
 * Liveness — sem Supabase (probes Railway / balanceadores).
 * Montado em `app.ts` **antes** do CORS: probes e `curl` não enviam `Origin`;
 * o CORS global em produção rejeitava essas requisições com 500.
 */
function liveHealthHandler(_req, res) {
    // Público, sem credenciais — permite leitura a partir de qualquer origem (ex.: fetch de diagnóstico)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ status: 'ok', service: 'petivet-api' });
}
const router = express_1.default.Router();
// Health check detalhado (requer autenticação de admin)
router.get('/system', authMiddleware_1.authenticateUser, healthController_1.getSystemHealth);
exports.default = router;
