"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createError = exports.asyncHandler = exports.errorHandler = void 0;
const logger_js_1 = require("../utils/logger.js");
const errors_js_1 = require("../utils/errors.js");
/**
 * Middleware de tratamento de erros global
 * Captura todos os erros não tratados e retorna respostas consistentes
 * Melhorado com correlation IDs e classes de erro customizadas
 */
const errorHandler = (err, req, res, next) => {
    // Se já foi enviada uma resposta, delegar para o handler padrão do Express
    if (res.headersSent) {
        return next(err);
    }
    // Obter correlation ID do request (se disponível)
    const correlationId = req.correlationId || 'unknown';
    // Determinar status code
    const statusCode = err instanceof errors_js_1.AppError ? err.statusCode : 500;
    // Determinar se é um erro operacional (esperado) ou um erro de sistema
    const isOperational = err instanceof errors_js_1.AppError ? err.isOperational : false;
    // Preparar metadata para logging
    const logMetadata = {
        correlationId,
        message: err.message,
        statusCode,
        path: req.path,
        method: req.method,
        errorName: err.name,
    };
    // Adicionar código de erro se for AppError
    if (err instanceof errors_js_1.AppError && err.code) {
        logMetadata.errorCode = err.code;
    }
    // Adicionar detalhes se disponíveis (apenas em desenvolvimento)
    if (err instanceof errors_js_1.AppError && err.details && process.env.NODE_ENV !== 'production') {
        logMetadata.details = err.details;
    }
    // Log do erro usando logger estruturado
    if (isOperational) {
        logger_js_1.logger.warn('Operational error', logMetadata);
    }
    else {
        logger_js_1.logger.error('System error', {
            ...logMetadata,
            stack: err.stack,
        });
    }
    // Resposta de erro
    const response = {
        error: err.message || 'Erro interno do servidor',
        statusCode,
        correlationId,
    };
    // Adicionar código de erro se for AppError
    if (err instanceof errors_js_1.AppError && err.code) {
        response.code = err.code;
    }
    // Adicionar detalhes apenas em desenvolvimento/staging
    if (process.env.NODE_ENV !== 'production') {
        if (err instanceof errors_js_1.AppError && err.details) {
            response.details = err.details;
        }
        else if (!isOperational && err.stack) {
            response.details = err.stack;
        }
    }
    res.status(statusCode).json(response);
};
exports.errorHandler = errorHandler;
/**
 * Wrapper para async route handlers
 * Captura erros de promises rejeitadas automaticamente
 * Melhorado para converter erros do Supabase em AppErrors
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((error) => {
            // Se já for um AppError, passa direto
            if (error instanceof errors_js_1.AppError) {
                return next(error);
            }
            // Converter erros do Supabase em DatabaseError
            if (error?.code && error?.message && typeof error.code === 'string') {
                // Erro do Supabase geralmente tem código como 'PGRST116', '23505', etc.
                const { DatabaseError } = require('../utils/errors.js');
                return next(new DatabaseError(`Erro no banco de dados: ${error.message}`, error));
            }
            // Outros erros não esperados
            return next(error);
        });
    };
};
exports.asyncHandler = asyncHandler;
/**
 * @deprecated Use as classes de erro de errors.ts diretamente
 * Mantido para compatibilidade com código existente
 */
const createError = (message, statusCode = 500, isOperational = true) => {
    const { AppError: AppErrorClass } = require('../utils/errors.js');
    return new AppErrorClass(message, statusCode, isOperational);
};
exports.createError = createError;
