import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler.js';

/**
 * Middleware de validação usando Zod
 * Valida o body, params ou query da requisição
 */
export const validate = <T extends z.ZodTypeAny>(
  schema: T,
  source: 'body' | 'params' | 'query' = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = source === 'body' ? req.body : source === 'params' ? req.params : req.query;
      
      // Validar dados
      const validated = schema.parse(data);
      
      // Substituir dados originais pelos validados
      if (source === 'body') {
        req.body = validated;
      } else if (source === 'params') {
        req.params = validated as any;
      } else {
        req.query = validated as any;
      }
      
      next();
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        const errors = error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        
        return next(
          createError(
            `Erro de validação: ${errors.map((e) => e.message).join(', ')}`,
            400,
            true
          )
        );
      }
      
      next(error);
    }
  };
};

/**
 * Schemas de validação comuns
 */
export const commonSchemas = {
  uuid: z.string().uuid('ID inválido'),
  email: z.string().email('Email inválido'),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos'),
  phone: z.string().regex(/^\+?[\d\s-()]+$/, 'Telefone inválido'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:MM'),
};

