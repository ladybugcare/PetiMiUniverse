import type { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { listPublicPlansAndModules } from './hubSubscriptionService.js';

/** GET /api/hub/subscription/plans — catálogo público (pré-MVP: só Beta). */
export const getHubSubscriptionPlans = asyncHandler(async (_req: Request, res: Response) => {
  const catalog = await listPublicPlansAndModules();
  res.json(catalog);
});
