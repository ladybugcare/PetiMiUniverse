"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createError = exports.asyncHandler = exports.errorHandler = void 0;
const logger_js_1 = require("../utils/logger.js");
/**
 * Middleware de tratamento de erros global
 * Captura todos os erros não tratados e retorna respostas consistentes
 */
const errorHandler = (err, req, res, next) => {
    // Se já foi enviada uma resposta, delegar para o handler padrão do Express
    if (res.headersSent) {
        return next(err);
    }
    // Determinar status code
    const statusCode = err.statusCode || 500;
    // Determinar se é um erro operacional (esperado) ou um erro de sistema
    const isOperational = err.isOperational !== false;
    // Log do erro usando logger estruturado
    if (isOperational) {
        logger_js_1.logger.warn('Operational error', {
            message: err.message,
            statusCode,
            path: req.path,
            method: req.method,
        });
    }
    else {
        logger_js_1.logger.error('System error', {
            message: err.message,
            statusCode,
            stack: err.stack,
            path: req.path,
            method: req.method,
        });
    }
    // Resposta de erro
    const response = {
        error: err.message || 'Erro interno do servidor',
        statusCode,
    };
    // Adicionar detalhes apenas em desenvolvimento/staging
    if (process.env.NODE_ENV !== 'production' && !isOperational) {
        response.details = err.stack;
    }
    res.status(statusCode).json(response);
};
exports.errorHandler = errorHandler;
/**
 * Wrapper para async route handlers
 * Captura erros de promises rejeitadas automaticamente
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
/**
 * Cria um erro customizado
 */
const createError = (message, statusCode = 500, isOperational = true) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.isOperational = isOperational;
    return error;
};
exports.createError = createError;
