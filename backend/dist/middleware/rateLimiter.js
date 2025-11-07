"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLimiter = exports.authLimiter = exports.generalLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
/**
 * Rate limiter geral para todas as rotas
 * Limita a 100 requisições por 15 minutos por IP
 */
exports.generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo de 100 requisições por IP
    message: {
        error: 'Muitas requisições deste IP, tente novamente em alguns minutos.',
    },
    standardHeaders: true, // Retorna rate limit info nos headers `RateLimit-*`
    legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
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
});
