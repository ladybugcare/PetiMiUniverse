"use strict";
/**
 * Classes de erro customizadas para tratamento consistente de erros
 * Baseado no plano de implementação do projeto
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitError = exports.ExternalServiceError = exports.DatabaseError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.ValidationError = exports.AppError = void 0;
/**
 * Classe base para todos os erros da aplicação
 */
class AppError extends Error {
    statusCode;
    isOperational;
    code;
    details;
    constructor(message, statusCode = 500, isOperational = true, code, details) {
        super(message);
        // Mantém o stack trace correto
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.code = code;
        this.details = details;
    }
}
exports.AppError = AppError;
/**
 * Erro de validação (400)
 * Usado quando dados de entrada são inválidos
 */
class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 400, true, 'VALIDATION_ERROR', details);
    }
}
exports.ValidationError = ValidationError;
/**
 * Erro de autenticação (401)
 * Usado quando o usuário não está autenticado
 */
class UnauthorizedError extends AppError {
    constructor(message = 'Não autorizado', details) {
        super(message, 401, true, 'UNAUTHORIZED', details);
    }
}
exports.UnauthorizedError = UnauthorizedError;
/**
 * Erro de permissão (403)
 * Usado quando o usuário não tem permissão para a ação
 */
class ForbiddenError extends AppError {
    constructor(message = 'Acesso negado', details) {
        super(message, 403, true, 'FORBIDDEN', details);
    }
}
exports.ForbiddenError = ForbiddenError;
/**
 * Erro de recurso não encontrado (404)
 */
class NotFoundError extends AppError {
    constructor(message = 'Recurso não encontrado', details) {
        super(message, 404, true, 'NOT_FOUND', details);
    }
}
exports.NotFoundError = NotFoundError;
/**
 * Erro de conflito (409)
 * Usado quando há conflito de estado (ex: email já cadastrado)
 */
class ConflictError extends AppError {
    constructor(message, details) {
        super(message, 409, true, 'CONFLICT', details);
    }
}
exports.ConflictError = ConflictError;
/**
 * Erro de banco de dados (500)
 * Usado para erros relacionados ao Supabase/banco de dados
 */
class DatabaseError extends AppError {
    constructor(message, originalError) {
        super(message, 500, false, // Erro de sistema, não operacional
        'DATABASE_ERROR', process.env.NODE_ENV !== 'production' ? originalError : undefined);
    }
}
exports.DatabaseError = DatabaseError;
/**
 * Erro de serviço externo (502)
 * Usado quando serviços externos falham
 */
class ExternalServiceError extends AppError {
    constructor(message, serviceName, originalError) {
        super(message, 502, false, 'EXTERNAL_SERVICE_ERROR', process.env.NODE_ENV !== 'production'
            ? { service: serviceName, error: originalError }
            : undefined);
    }
}
exports.ExternalServiceError = ExternalServiceError;
/**
 * Erro de rate limit (429)
 */
class RateLimitError extends AppError {
    constructor(message = 'Muitas requisições. Tente novamente mais tarde.', retryAfter) {
        super(message, 429, true, 'RATE_LIMIT', { retryAfter });
    }
}
exports.RateLimitError = RateLimitError;
