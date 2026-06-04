import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

/**
 * Middleware de tratamento de erros global
 * Captura todos os erros não tratados e retorna respostas consistentes
 * Melhorado com correlation IDs e classes de erro customizadas
 */
export const errorHandler = (
  err: AppError | Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Se já foi enviada uma resposta, delegar para o handler padrão do Express
  if (res.headersSent) {
    return next(err);
  }

  // Obter correlation ID do request (se disponível)
  const correlationId = req.correlationId || 'unknown';

  // Determinar status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  
  // Determinar se é um erro operacional (esperado) ou um erro de sistema
  const isOperational = err instanceof AppError ? err.isOperational : false;

  // Preparar metadata para logging
  const logMetadata: any = {
    correlationId,
    message: err.message,
    statusCode,
    path: req.path,
    method: req.method,
    errorName: err.name,
  };

  // Adicionar código de erro se for AppError
  if (err instanceof AppError && err.code) {
    logMetadata.errorCode = err.code;
  }

  // Adicionar detalhes se disponíveis (apenas em desenvolvimento)
  if (err instanceof AppError && err.details && process.env.NODE_ENV !== 'production') {
    logMetadata.details = err.details;
  }

  // Log do erro usando logger estruturado
  if (isOperational) {
    logger.warn('Operational error', logMetadata);
  } else {
    logger.error('System error', {
      ...logMetadata,
      stack: err.stack,
    });
  }

  // Resposta de erro
  const response: {
    error: string;
    statusCode: number;
    code?: string;
    correlationId?: string;
    details?: any;
  } = {
    error: err.message || 'Erro interno do servidor',
    statusCode,
    correlationId,
  };

  // Adicionar código de erro se for AppError
  if (err instanceof AppError && err.code) {
    response.code = err.code;
  }

  // Adicionar detalhes apenas em desenvolvimento/staging
  if (process.env.NODE_ENV !== 'production') {
    if (err instanceof AppError && err.details) {
      response.details = err.details;
    } else if (!isOperational && err.stack) {
      response.details = err.stack;
    }
  }

  res.status(statusCode).json(response);
};

/**
 * Wrapper para async route handlers
 * Captura erros de promises rejeitadas automaticamente
 * Melhorado para converter erros do Supabase em AppErrors
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      // Se já for um AppError, passa direto
      if (error instanceof AppError) {
        return next(error);
      }

      // Converter erros do Supabase em DatabaseError
      if (error?.code && error?.message && typeof error.code === 'string') {
        // Erro do Supabase geralmente tem código como 'PGRST116', '23505', etc.
        const { DatabaseError } = require('../utils/errors.js');
        return next(new DatabaseError(
          `Erro no banco de dados: ${error.message}`,
          error
        ));
      }

      // Outros erros não esperados
      return next(error);
    });
  };
};

/**
 * @deprecated Use as classes de erro de errors.ts diretamente
 * Mantido para compatibilidade com código existente
 */
export const createError = (
  message: string,
  statusCode: number = 500,
  isOperational: boolean = true
): AppError => {
  const { AppError: AppErrorClass } = require('../utils/errors.js');
  return new AppErrorClass(message, statusCode, isOperational);
};

