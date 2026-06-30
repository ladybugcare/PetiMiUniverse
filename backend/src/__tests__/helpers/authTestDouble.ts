import type { Request, Response, NextFunction } from 'express';
import { TEST_USER_ID } from './mockAuth';

export function getAuthMiddlewareModule() {
  return {
    authenticateUser: (req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: TEST_USER_ID, email: 'test@test.com', role: 'CADMIN' };
      next();
    },
    requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    requireClinicAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
    checkPermission: async () => true,
    checkClinicAccess: async () => true,
  };
}
