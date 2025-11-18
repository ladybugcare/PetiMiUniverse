import type { Request, Response, NextFunction } from 'express';
import { sanitizeObject, sanitizeString } from '../utils/inputSanitization.js';

/**
 * Middleware para sanitizar inputs do usuário automaticamente
 * Aplica sanitização em body, query e params
 */
export const sanitizeInputs = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Sanitizar body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body, false);
  }

  // Sanitizar query params (strings)
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeString(req.query[key] as string, false);
      }
    }
  }

  // Sanitizar params (strings)
  if (req.params) {
    for (const key in req.params) {
      if (typeof req.params[key] === 'string') {
        req.params[key] = sanitizeString(req.params[key] as string, false);
      }
    }
  }

  next();
};

/**
 * Middleware para sanitizar apenas body (útil para rotas específicas)
 */
export const sanitizeBody = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body, false);
  }
  next();
};

