import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Estende o tipo Request do Express para incluir correlationId
 */
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

/**
 * Middleware para adicionar correlation ID em todas as requisições
 * Facilita rastreamento de logs e debug
 */
export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Tenta obter correlation ID do header, senão gera um novo
  const correlationId = 
    (req.headers['x-correlation-id'] as string) || 
    randomUUID();

  // Adiciona ao request para uso nos controllers
  req.correlationId = correlationId;

  // Adiciona ao header de resposta para o cliente rastrear
  res.setHeader('X-Correlation-ID', correlationId);

  next();
};

