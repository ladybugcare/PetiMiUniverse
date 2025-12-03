import type { Request, Response } from 'express';
import { InviteService } from '../services/inviteService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { UnauthorizedError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Controller para gerenciar convites de demandas
 */

/**
 * Convidar um veterinário para uma demanda
 * POST /demands/:id/invite-vet
 */
export const inviteVet = asyncHandler(async (req: Request, res: Response) => {
  const { id: demandId } = req.params;
  const { vet_id: vetId } = req.body;
  const user = (req as any).user;

  if (!user) {
    throw new UnauthorizedError('Usuário não autenticado');
  }

  if (!vetId) {
    throw new ValidationError('vet_id é obrigatório');
  }

  const application = await InviteService.inviteVetToDemand(
    demandId,
    vetId,
    user.id
  );

  logger.info('Vet convidado com sucesso', {
    demandId,
    vetId,
    invitedBy: user.id,
    applicationId: application.id,
    correlationId: (req as any).correlationId,
  });

  res.status(201).json({
    message: 'Veterinário convidado com sucesso',
    application,
  });
});

/**
 * Aceitar um convite
 * POST /demand-applications/:id/accept-invite
 */
export const acceptInvite = asyncHandler(async (req: Request, res: Response) => {
  const { id: applicationId } = req.params;
  const user = (req as any).user;

  if (!user) {
    throw new UnauthorizedError('Usuário não autenticado');
  }

  const application = await InviteService.acceptInvite(applicationId, user.id);

  logger.info('Convite aceito com sucesso', {
    applicationId,
    vetId: user.id,
    correlationId: (req as any).correlationId,
  });

  res.json({
    message: 'Convite aceito com sucesso',
    application,
  });
});

/**
 * Recusar um convite
 * POST /demand-applications/:id/reject-invite
 */
export const rejectInvite = asyncHandler(async (req: Request, res: Response) => {
  const { id: applicationId } = req.params;
  const user = (req as any).user;

  if (!user) {
    throw new UnauthorizedError('Usuário não autenticado');
  }

  const application = await InviteService.rejectInvite(applicationId, user.id);

  logger.info('Convite recusado com sucesso', {
    applicationId,
    vetId: user.id,
    correlationId: (req as any).correlationId,
  });

  res.json({
    message: 'Convite recusado',
    application,
  });
});

/**
 * Listar convites pendentes do veterinário logado
 * GET /demand-applications/invites/pending
 */
export const getPendingInvites = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;

  if (!user) {
    throw new UnauthorizedError('Usuário não autenticado');
  }

  const applications = await InviteService.getInvitesByVet(user.id);

  res.json({
    applications,
    count: applications.length,
  });
});

