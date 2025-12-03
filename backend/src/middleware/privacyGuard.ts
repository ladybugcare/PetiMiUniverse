import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Middleware para garantir privacidade entre candidatos
 * Vets/freelancers só veem suas próprias aplicações
 * Clínicas/admins veem todas as aplicações
 */
export const filterApplicationsByRole = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return next();
    }

    const userRole = user.role || (user as any).user_metadata?.role;

    // Se for vet ou freelancer, adicionar filtro para ver apenas próprias aplicações
    if (userRole === 'vet' || userRole === 'freelancer') {
      // Adicionar filtro ao query string ou body
      if (req.query) {
        req.query.vet_id = user.id;
      }
      // Armazenar no request para uso nos controllers
      (req as any).privacyFilter = {
        vet_id: user.id,
        freelancer_id: user.id,
      };
    } else if (userRole === 'clinic' || userRole === 'admin') {
      // Clínicas e admins veem tudo - não adicionar filtro
      (req as any).privacyFilter = null;
    }

    next();
  } catch (error: any) {
    logger.error('Erro no privacyGuard', {
      error: error.message,
      path: req.path,
      correlationId: (req as any).correlationId,
    });
    next();
  }
};

/**
 * Helper para aplicar filtro de privacidade em queries Supabase
 */
export const applyPrivacyFilter = (query: any, req: Request) => {
  const privacyFilter = (req as any).privacyFilter;
  if (!privacyFilter) {
    return query; // Clínica ou admin - sem filtro
  }

  // Vet ou freelancer - filtrar por próprio ID
  if (privacyFilter.vet_id) {
    return query.eq('vet_id', privacyFilter.vet_id);
  }
  if (privacyFilter.freelancer_id) {
    return query.eq('freelancer_id', privacyFilter.freelancer_id);
  }

  return query;
};

/**
 * Middleware específico para garantir que vet só vê próprias aplicações
 */
export const ensureVetSeesOnlyOwnApplications = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  const userRole = user.role || (user as any).user_metadata?.role;

  if (userRole === 'vet' || userRole === 'freelancer') {
    // Adicionar filtro obrigatório
    (req as any).privacyFilter = {
      vet_id: user.id,
      freelancer_id: user.id,
    };
  }

  next();
};

/**
 * Middleware específico para garantir que clínica vê todas as aplicações
 */
export const ensureClinicSeesAllApplications = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  const userRole = user.role || (user as any).user_metadata?.role;

  if (userRole !== 'clinic' && userRole !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  // Não adicionar filtro - clínica vê tudo
  (req as any).privacyFilter = null;

  next();
};

