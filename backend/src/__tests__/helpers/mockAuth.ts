import type { Request, Response, NextFunction } from 'express';

export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_CLINIC_ID = '22222222-2222-4222-8222-222222222222';
export const TEST_UNIT_ID = '33333333-3333-4333-8333-333333333333';
export const TEST_GUARDIAN_ID = '44444444-4444-4444-8444-444444444444';
export const TEST_PET_ID = '55555555-5555-4555-8555-555555555555';
export const TEST_RESERVATION_ID = '66666666-6666-4666-8666-666666666666';

export function installAuthMocks(): void {
  jest.mock('../../middleware/authMiddleware', () => ({
    authenticateUser: (req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: TEST_USER_ID, email: 'test@test.com', role: 'CADMIN' };
      next();
    },
    requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
    requireClinicAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
    checkPermission: async () => true,
    checkClinicAccess: async () => true,
  }));
}
