/**
 * Classes de erro customizadas para tratamento consistente de erros
 * Baseado no plano de implementação do projeto
 */

/**
 * Classe base para todos os erros da aplicação
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    code?: string,
    details?: any
  ) {
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

/**
 * Erro de validação (400)
 * Usado quando dados de entrada são inválidos
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, true, 'VALIDATION_ERROR', details);
  }
}

/**
 * Erro de autenticação (401)
 * Usado quando o usuário não está autenticado
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Não autorizado', details?: any) {
    super(message, 401, true, 'UNAUTHORIZED', details);
  }
}

/**
 * Erro de permissão (403)
 * Usado quando o usuário não tem permissão para a ação
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Acesso negado', details?: any) {
    super(message, 403, true, 'FORBIDDEN', details);
  }
}

/**
 * Erro de recurso não encontrado (404)
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Recurso não encontrado', details?: any) {
    super(message, 404, true, 'NOT_FOUND', details);
  }
}

/**
 * Erro de conflito (409)
 * Usado quando há conflito de estado (ex: email já cadastrado)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, true, 'CONFLICT', details);
  }
}

/**
 * Erro de banco de dados (500)
 * Usado para erros relacionados ao Supabase/banco de dados
 */
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: any) {
    super(
      message,
      500,
      false, // Erro de sistema, não operacional
      'DATABASE_ERROR',
      process.env.NODE_ENV !== 'production' ? originalError : undefined
    );
  }
}

/**
 * Erro de serviço externo (502)
 * Usado quando serviços externos falham
 */
export class ExternalServiceError extends AppError {
  constructor(message: string, serviceName?: string, originalError?: any) {
    super(
      message,
      502,
      false,
      'EXTERNAL_SERVICE_ERROR',
      process.env.NODE_ENV !== 'production' 
        ? { service: serviceName, error: originalError }
        : undefined
    );
  }
}

/**
 * Erro de rate limit (429)
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Muitas requisições. Tente novamente mais tarde.', retryAfter?: number) {
    super(message, 429, true, 'RATE_LIMIT', { retryAfter });
  }
}

