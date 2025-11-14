"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.correlationIdMiddleware = void 0;
const crypto_1 = require("crypto");
/**
 * Middleware para adicionar correlation ID em todas as requisições
 * Facilita rastreamento de logs e debug
 */
const correlationIdMiddleware = (req, res, next) => {
    // Tenta obter correlation ID do header, senão gera um novo
    const correlationId = req.headers['x-correlation-id'] ||
        (0, crypto_1.randomUUID)();
    // Adiciona ao request para uso nos controllers
    req.correlationId = correlationId;
    // Adiciona ao header de resposta para o cliente rastrear
    res.setHeader('X-Correlation-ID', correlationId);
    next();
};
exports.correlationIdMiddleware = correlationIdMiddleware;
