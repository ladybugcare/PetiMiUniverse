"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicPrescriptionLimiter = exports.uploadLimiter = exports.userRateLimiter = exports.statsLimiter = exports.createLimiter = exports.authLimiter = exports.hubApiLimiter = exports.generalLimiter = void 0;
exports.parseJwtSub = parseJwtSub;
exports.isRateLimitDisabled = isRateLimitDisabled;
exports.getRateLimitBypassUserIds = getRateLimitBypassUserIds;
exports.resetRateLimitBypassUserIdsCache = resetRateLimitBypassUserIdsCache;
exports.isRateLimitBypassUser = isRateLimitBypassUser;
exports.rateLimitBypassMonitor = rateLimitBypassMonitor;
const express_rate_limit_1 = __importStar(require("express-rate-limit"));
const logger_js_1 = require("../utils/logger.js");
require("../config/loadEnv.js");
function parseJwtSub(authHeader) {
    if (!authHeader?.startsWith('Bearer '))
        return null;
    const token = authHeader.slice(7);
    const parts = token.split('.');
    if (parts.length < 2 || !parts[1])
        return null;
    try {
        const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
        return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
    }
    catch {
        return null;
    }
}
/** Chave por utilizador autenticado (JWT); senão IP (atrás de trust proxy). */
function rateLimitKey(req) {
    const sub = parseJwtSub(req.headers.authorization);
    if (sub)
        return `user:${sub}`;
    return (0, express_rate_limit_1.ipKeyGenerator)(req.ip ?? 'unknown');
}
function parsePositiveInt(raw, fallback) {
    if (!raw)
        return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
/** Em .env.local: DISABLE_RATE_LIMIT=true (development ou testes) */
function isRateLimitDisabled() {
    return process.env.DISABLE_RATE_LIMIT === 'true';
}
function parseCsvEnvSet(name) {
    const raw = process.env[name]?.trim();
    if (!raw)
        return new Set();
    return new Set(raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean));
}
let bypassUserIdsCache = null;
/** IDs Supabase (`sub` do JWT) isentos de rate limit em produção (QA / demos). */
function getRateLimitBypassUserIds() {
    if (!bypassUserIdsCache) {
        bypassUserIdsCache = parseCsvEnvSet('RATE_LIMIT_BYPASS_USER_IDS');
    }
    return bypassUserIdsCache;
}
/** Repõe cache (testes). */
function resetRateLimitBypassUserIdsCache() {
    bypassUserIdsCache = null;
}
function isRateLimitBypassUser(req) {
    const sub = parseJwtSub(req.headers.authorization);
    if (!sub)
        return false;
    return getRateLimitBypassUserIds().has(sub);
}
const bypassMonitorCounts = new Map();
function isHealthProbePath(path) {
    return path === '/' || path === '/health' || path === '/health/live';
}
function shouldSkipRateLimit(req) {
    if (isRateLimitDisabled())
        return true;
    if (isHealthProbePath(req.path))
        return true;
    if (isRateLimitBypassUser(req))
        return true;
    return false;
}
/** Hub autenticado usa `hubApiLimiter` (limite maior); não conta também no global. */
function shouldSkipGeneralForAuthenticatedHub(req) {
    if (shouldSkipRateLimit(req))
        return true;
    const hubPath = req.path.startsWith('/api/hub');
    if (hubPath && parseJwtSub(req.headers.authorization))
        return true;
    return false;
}
/**
 * Rate limiter geral para todas as rotas
 * Limites diferentes por ambiente (override: GENERAL_RATE_LIMIT_MAX / GENERAL_RATE_LIMIT_WINDOW_MS):
 * - Development: 1000 req/15min
 * - Staging: 500 req/15min
 * - Production: 800 req/15min (Hub faz polling + vários GETs por ecrã; 100 era demasiado baixo)
 *
 * Com Bearer JWT, a chave é o `sub` do token (por utilizador), não só o IP partilhado atrás do proxy.
 */
const isDevelopment = process.env.NODE_ENV === 'development';
const isStaging = process.env.NODE_ENV === 'staging' || process.env.RENDER_SERVICE_NAME?.includes('staging');
const defaultMaxRequests = isDevelopment ? 1000 : isStaging ? 500 : 800;
const maxRequests = parsePositiveInt(process.env.GENERAL_RATE_LIMIT_MAX, defaultMaxRequests);
const generalWindowMs = parsePositiveInt(process.env.GENERAL_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const defaultHubMaxRequests = isDevelopment ? 3000 : isStaging ? 2000 : 2000;
const hubMaxRequests = parsePositiveInt(process.env.HUB_RATE_LIMIT_MAX, defaultHubMaxRequests);
const authMaxRequests = parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 5);
/**
 * Conta tráfego de utilizadores com bypass (não bloqueia) para detectar chamadas excessivas.
 * Limiar: RATE_LIMIT_BYPASS_MONITOR_MAX (default 5000 / janela geral).
 */
function rateLimitBypassMonitor(req, _res, next) {
    if (!isRateLimitBypassUser(req)) {
        next();
        return;
    }
    const sub = parseJwtSub(req.headers.authorization);
    if (!sub) {
        next();
        return;
    }
    const monitorMax = parsePositiveInt(process.env.RATE_LIMIT_BYPASS_MONITOR_MAX, 5000);
    const now = Date.now();
    let data = bypassMonitorCounts.get(sub);
    if (!data || now > data.resetTime) {
        data = { count: 0, resetTime: now + generalWindowMs, warned: false };
        bypassMonitorCounts.set(sub, data);
    }
    data.count += 1;
    if (!data.warned && data.count >= monitorMax) {
        data.warned = true;
        logger_js_1.logger.warn('Utilizador com bypass de rate limit excedeu limiar de monitorização', {
            userId: sub,
            count: data.count,
            threshold: monitorMax,
            path: req.path,
            method: req.method,
        });
    }
    next();
}
exports.generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: generalWindowMs,
    max: maxRequests,
    keyGenerator: rateLimitKey,
    message: {
        error: 'Muitas requisições. Tente novamente em alguns minutos.',
    },
    standardHeaders: true, // Retorna rate limit info nos headers `RateLimit-*`
    legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
    skip: (req) => shouldSkipGeneralForAuthenticatedHub(req),
});
/** SPA Hub (polling + vários GETs por ecrã) — só com Bearer JWT. */
exports.hubApiLimiter = (0, express_rate_limit_1.default)({
    windowMs: generalWindowMs,
    max: hubMaxRequests,
    keyGenerator: rateLimitKey,
    message: {
        error: 'Muitas requisições. Tente novamente em alguns minutos.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        if (isRateLimitDisabled())
            return true;
        if (isHealthProbePath(req.path))
            return true;
        if (req.path === '/signup')
            return true;
        if (isRateLimitBypassUser(req))
            return true;
        return !parseJwtSub(req.headers.authorization);
    },
});
/**
 * Rate limiter mais restritivo para autenticação
 * Limita a 5 tentativas por 15 minutos por IP
 */
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: authMaxRequests,
    message: {
        error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
    },
    skipSuccessfulRequests: true, // Não conta requisições bem-sucedidas
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isRateLimitDisabled() || isRateLimitBypassUser(req),
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
    skip: (req) => isRateLimitDisabled() || isRateLimitBypassUser(req),
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
    windowMs: generalWindowMs,
    max: statsMaxRequests, // máximo de requisições por IP (ajustado por ambiente)
    keyGenerator: rateLimitKey,
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
        if (isRateLimitDisabled() || isRateLimitBypassUser(req)) {
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
/**
 * Rate limiter para rotas públicas de validação de receita (token/código/PDF).
 * 60 requisições por IP a cada 15 minutos.
 */
exports.publicPrescriptionLimiter = (0, express_rate_limit_1.default)({
    windowMs: parsePositiveInt(process.env.PUBLIC_PRESCRIPTION_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: parsePositiveInt(process.env.PUBLIC_PRESCRIPTION_RATE_LIMIT_MAX, 60),
    keyGenerator: rateLimitKey,
    message: {
        error: 'Muitas tentativas de validação. Tente novamente em alguns minutos.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isRateLimitDisabled() || isRateLimitBypassUser(req),
});
