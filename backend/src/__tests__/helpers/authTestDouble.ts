import type { Request, Response, NextFunction } from 'express';
import { TEST_USER_ID } from './mockAuth';

export type AuthMockOptions = {
  authenticated?: boolean;
  user?: { id: string; email?: string; role?: string };
  checkPermission?: (userId: string, clinicId: string, permission: string) => Promise<boolean> | boolean;
  checkClinicAccess?: (userId: string, clinicId: string) => Promise<boolean> | boolean;
};

let currentOptions: AuthMockOptions = {};

export function configureAuthMock(options: AuthMockOptions = {}) {
  currentOptions = options;
}

export function resetAuthMock() {
  currentOptions = {};
}

function resolveOptions(override?: AuthMockOptions): Required<Pick<AuthMockOptions, 'authenticated' | 'user'>> &
  AuthMockOptions {
  const merged = { ...currentOptions, ...override };
  return {
    authenticated: merged.authenticated !== false,
    user: merged.user ?? { id: TEST_USER_ID, email: 'test@test.com', role: 'CADMIN' },
    checkPermission: merged.checkPermission,
    checkClinicAccess: merged.checkClinicAccess,
  };
}

export function getAuthMiddlewareModule(options?: AuthMockOptions) {
  const opts = resolveOptions(options);

  return {
    authenticateUser: (req: Request, res: Response, next: NextFunction) => {
      if (!opts.authenticated) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido' });
      }
      req.user = opts.user;
      next();
    },
    requirePermission: (permission: string) => async (req: Request, res: Response, next: NextFunction) => {
      if (!opts.authenticated || !req.user?.id) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }
      const clinic_id = req.body.clinic_id || req.params.clinic_id || req.query.clinic_id;
      if (!clinic_id) {
        return res.status(400).json({ error: 'clinic_id não fornecido' });
      }
      const allowed = opts.checkPermission
        ? await opts.checkPermission(req.user.id, String(clinic_id), permission)
        : true;
      if (!allowed) {
        return res.status(403).json({ error: 'Permissão negada' });
      }
      next();
    },
    requireClinicAccess: async (req: Request, res: Response, next: NextFunction) => {
      if (!opts.authenticated || !req.user?.id) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }
      const clinic_id = req.body.clinic_id || req.params.clinic_id || req.query.clinic_id;
      if (!clinic_id) {
        return res.status(400).json({ error: 'clinic_id não fornecido' });
      }
      const allowed = opts.checkClinicAccess
        ? await opts.checkClinicAccess(req.user.id, String(clinic_id))
        : true;
      if (!allowed) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
      next();
    },
    checkPermission: async (userId: string, clinicId: string, permission: string) => {
      if (opts.checkPermission) {
        return opts.checkPermission(userId, clinicId, permission);
      }
      return true;
    },
    checkClinicAccess: async (userId: string, clinicId: string) => {
      if (opts.checkClinicAccess) {
        return opts.checkClinicAccess(userId, clinicId);
      }
      return true;
    },
    verifyAdmin: (req: Request, res: Response, next: NextFunction) => {
      if (!opts.authenticated || !req.user) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }
      if (req.user.role?.toLowerCase() !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado. Somente administradores podem executar esta ação.' });
      }
      next();
    },
  };
}
