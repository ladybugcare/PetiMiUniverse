"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadLimiter = exports.userRateLimiter = exports.statsLimiter = exports.createLimiter = exports.authLimiter = exports.generalLimiter = void 0;
exports.isRateLimitDisabled = isRateLimitDisabled;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const logger_js_1 = require("../utils/logger.js");
require("../config/loadEnv.js");
/** Em .env.local: DISABLE_RATE_LIMIT=true (apenas NODE_ENV=development) */
function isRateLimitDisabled() {
    return (process.env.NODE_ENV === 'development' && process.env.DISABLE_RATE_LIMIT === 'true');
}
function shouldSkipRateLimit(req) {
    if (isRateLimitDisabled())
        return true;
    return req.path === '/' || req.path === '/health';
}
/**
 * Rate limiter geral para todas as rotas
 * Limites diferentes por ambiente:
 * - Development: 1000 req/15min (para suportar StrictMode e desenvolvimento ativo)
 * - Staging: 500 req/15min (para suportar polling de dashboard e múltiplos componentes)
 * - Production: 100 req/15min (limite mais restritivo)
 */
const isDevelopment = process.env.NODE_ENV === 'development';
const isStaging = process.env.NODE_ENV === 'staging' || process.env.RENDER_SERVICE_NAME?.includes('staging');
const maxRequests = isDevelopment ? 1000 : isStaging ? 500 : 100;
exports.generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: maxRequests, // máximo de requisições por IP (ajustado por ambiente)
    message: {
        error: 'Muitas requisições deste IP, tente novamente em alguns minutos.',
    },
    standardHeaders: true, // Retorna rate limit info nos headers `RateLimit-*`
    legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
    skip: (req) => shouldSkipRateLimit(req),
});
/**
 * Rate limiter mais restritivo para autenticação
 * Limita a 5 tentativas por 15 minutos por IP
 */
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo de 5 tentativas por IP
    message: {
        error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    },
    skipSuccessfulRequests: true, // Não conta requisições bem-sucedidas
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isRateLimitDisabled(),
});
/**
 * Rate limiter para criação de recursos
 * Limita a 10 criações por hora por IP
 */
exports.createLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 10, // máximo de 10 criações por IP
    message: {
        error: 'Muitas tentativas de criação. Tente novamente em uma hora.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isRateLimitDisabled(),
});
/**
 * Rate limiter mais permissivo para rotas de estatísticas/dashboard
 * Essas rotas são chamadas frequentemente pelo dashboard e podem ser agrupadas
 * Limites por ambiente:
 * - Development: 500 req/15min
 * - Staging: 300 req/15min
 * - Production: 200 req/15min
 */
const statsMaxRequests = isDevelopment ? 500 : isStaging ? 300 : 200;
exports.statsLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: statsMaxRequests, // máximo de requisições por IP (ajustado por ambiente)
    message: {
        error: 'Muitas requisições de estatísticas. Tente novamente em alguns minutos.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => shouldSkipRateLimit(req),
});
/**
 * Rate limiter por usuário autenticado
 * Usa o user ID do request para limitar por usuário, não apenas por IP
 * Útil para prevenir abuso de usuários autenticados
 */
const userRateLimiter = (maxRequests = 200, windowMs = 15 * 60 * 1000) => {
    // Store simples em memória (em produção, usar Redis)
    const userRequestCounts = new Map();
    // Limpar entradas expiradas periodicamente
    setInterval(() => {
        const now = Date.now();
        for (const [userId, data] of userRequestCounts.entries()) {
            if (now > data.resetTime) {
                userRequestCounts.delete(userId);
            }
        }
    }, 60000); // Limpar a cada minuto
    return (req, res, next) => {
        if (isRateLimitDisabled()) {
            return next();
        }
        const userId = req.user?.id;
        // Se não houver usuário autenticado, usar limiter geral
        if (!userId) {
            return (0, exports.generalLimiter)(req, res, next);
        }
        const now = Date.now();
        const userData = userRequestCounts.get(userId);
        // Se não existe ou expirou, criar nova entrada
        if (!userData || now > userData.resetTime) {
            userRequestCounts.set(userId, {
                count: 1,
                resetTime: now + windowMs,
            });
            return next();
        }
        // Incrementar contador
        userData.count++;
        // Verificar se excedeu o limite
        if (userData.count > maxRequests) {
            logger_js_1.logger.warn('Rate limit excedido para usuário', {
                userId,
                count: userData.count,
                maxRequests,
            });
            res.status(429).json({
                error: 'Muitas requisições. Tente novamente em alguns minutos.',
                retryAfter: Math.ceil((userData.resetTime - now) / 1000),
            });
            return;
        }
        // Adicionar headers de rate limit
        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - userData.count).toString());
        res.setHeader('X-RateLimit-Reset', new Date(userData.resetTime).toISOString());
        next();
    };
};
exports.userRateLimiter = userRateLimiter;
/**
 * Rate limiter específico para uploads
 * Limita uploads por usuário para prevenir abuso
 */
exports.uploadLimiter = (0, exports.userRateLimiter)(20, 60 * 60 * 1000); // 20 uploads por hora por usuário
