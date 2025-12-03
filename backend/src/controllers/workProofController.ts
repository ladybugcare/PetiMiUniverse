import type { Request, Response } from 'express';
import { WorkProofService } from '../services/workProofService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { UnauthorizedError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Controller para gerenciar prova de trabalho (check-in, check-out, relatórios)
 */

/**
 * Fazer check-in
 * POST /demand-applications/:id/checkin
 */
export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const { id: applicationId } = req.params;
  const { location } = req.body;
  const user = (req as any).user;

  if (!user) {
    throw new UnauthorizedError('Usuário não autenticado');
  }

  const workProof = await WorkProofService.checkIn(applicationId, location);

  logger.info('Check-in realizado com sucesso', {
    applicationId,
    userId: user.id,
    hasLocation: !!location,
    correlationId: (req as any).correlationId,
  });

  res.json({
    message: 'Check-in realizado com sucesso',
    workProof,
  });
});

/**
 * Fazer check-out
 * POST /demand-applications/:id/checkout
 */
export const checkOut = asyncHandler(async (req: Request, res: Response) => {
  const { id: applicationId } = req.params;
  const { location } = req.body;
  const user = (req as any).user;

  if (!user) {
    throw new UnauthorizedError('Usuário não autenticado');
  }

  const workProof = await WorkProofService.checkOut(applicationId, location);

  logger.info('Check-out realizado com sucesso', {
    applicationId,
    userId: user.id,
    hasLocation: !!location,
    correlationId: (req as any).correlationId,
  });

  res.json({
    message: 'Check-out realizado com sucesso',
    workProof,
  });
});

/**
 * Enviar relatório
 * POST /demand-applications/:id/report
 */
export const submitReport = asyncHandler(async (req: Request, res: Response) => {
  const { id: applicationId } = req.params;
  const { report_text: reportText, attachments } = req.body;
  const user = (req as any).user;

  if (!user) {
    throw new UnauthorizedError('Usuário não autenticado');
  }

  if (!reportText || reportText.trim().length === 0) {
    throw new ValidationError('report_text é obrigatório');
  }

  const workProof = await WorkProofService.submitReport(
    applicationId,
    reportText,
    attachments
  );

  logger.info('Relatório enviado com sucesso', {
    applicationId,
    userId: user.id,
    hasAttachments: attachments && attachments.length > 0,
    correlationId: (req as any).correlationId,
  });

  res.json({
    message: 'Relatório enviado com sucesso',
    workProof,
  });
});

/**
 * Aprovar relatório
 * POST /demand-applications/:id/approve-report
 */
export const approveReport = asyncHandler(async (req: Request, res: Response) => {
  const { id: applicationId } = req.params;
  const user = (req as any).user;

  if (!user) {
    throw new UnauthorizedError('Usuário não autenticado');
  }

  const application = await WorkProofService.approveReport(applicationId, user.id);

  logger.info('Relatório aprovado com sucesso', {
    applicationId,
    approvedBy: user.id,
    correlationId: (req as any).correlationId,
  });

  res.json({
    message: 'Relatório aprovado com sucesso',
    application,
  });
});

/**
 * Obter prova de trabalho
 * GET /demand-applications/:id/work-proof
 */
export const getWorkProof = asyncHandler(async (req: Request, res: Response) => {
  const { id: applicationId } = req.params;
  const user = (req as any).user;

  if (!user) {
    throw new UnauthorizedError('Usuário não autenticado');
  }

  const workProof = await WorkProofService.getWorkProof(applicationId);

  if (!workProof) {
    return res.status(404).json({
      error: 'Prova de trabalho não encontrada',
    });
  }

  res.json({
    workProof,
  });
});

