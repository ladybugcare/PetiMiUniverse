import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Middleware de tratamento de erros global
 * Captura todos os erros não tratados e retorna respostas consistentes
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

  // Determinar status code
  const statusCode = (err as AppError).statusCode || 500;
  
  // Determinar se é um erro operacional (esperado) ou um erro de sistema
  const isOperational = (err as AppError).isOperational !== false;

  // Log do erro usando logger estruturado
  if (isOperational) {
    logger.warn('Operational error', {
      message: err.message,
      statusCode,
      path: req.path,
      method: req.method,
    });
  } else {
    logger.error('System error', {
      message: err.message,
      statusCode,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  // Resposta de erro
  const response: {
    error: string;
    statusCode: number;
    details?: string;
  } = {
    error: err.message || 'Erro interno do servidor',
    statusCode,
  };

  // Adicionar detalhes apenas em desenvolvimento/staging
  if (process.env.NODE_ENV !== 'production' && !isOperational) {
    response.details = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * Wrapper para async route handlers
 * Captura erros de promises rejeitadas automaticamente
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Cria um erro customizado
 */
export const createError = (
  message: string,
  statusCode: number = 500,
  isOperational: boolean = true
): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = isOperational;
  return error;
};

