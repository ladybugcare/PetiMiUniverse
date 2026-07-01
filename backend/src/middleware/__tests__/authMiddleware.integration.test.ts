jest.mock('../../config/supabase', () =>
  require('../../__tests__/helpers/authSupabaseDouble').getAuthSupabaseModule()
);

import express from 'express';
import request from 'supertest';
import {
  authenticateUser,
  checkClinicAccess,
  checkPermission,
  requireClinicAccess,
  requirePermission,
} from '../authMiddleware';
import { errorHandler } from '../errorHandler';
import {
  configureAuthSupabaseMock,
} from '../../__tests__/helpers/authSupabaseDouble';
import {
  baseAuthTables,
  clinicUserRow,
  TEST_AUTH_CLINIC_ID,
  TEST_AUTH_USER_ID,
  validUser,
} from '../../__tests__/helpers/fixtures/auth';

function buildApp() {
  const app = express();
  app.use(express.json());

  app.get('/protected', authenticateUser, (_req, res) => {
    res.json({ ok: true });
  });

  app.get(
    '/perm',
    authenticateUser,
    requirePermission('hub.financial.write'),
    (_req, res) => {
      res.json({ ok: true });
    }
  );

  app.get('/clinic-access', authenticateUser, requireClinicAccess, (_req, res) => {
    res.json({ ok: true });
  });

  app.use(errorHandler);
  return app;
}

describe('authMiddleware (integração)', () => {
  beforeEach(() => {
    configureAuthSupabaseMock({ tables: baseAuthTables() });
  });

  describe('authenticateUser', () => {
    it('retorna 401 sem header Authorization', async () => {
      const res = await request(buildApp()).get('/protected');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Token de autenticação não fornecido/i);
    });

    it('retorna 401 com token inválido', async () => {
      configureAuthSupabaseMock({
        tables: baseAuthTables(),
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid JWT' },
        }),
      });

      const res = await request(buildApp())
        .get('/protected')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Token inválido/i);
    });

    it('permite acesso com token válido', async () => {
      configureAuthSupabaseMock({
        tables: baseAuthTables(),
        getUser: jest.fn().mockResolvedValue({
          data: { user: validUser({ user_metadata: { role: 'CADMIN' } }) },
          error: null,
        }),
      });

      const res = await request(buildApp())
        .get('/protected')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('requirePermission', () => {
    const authHeader = { Authorization: 'Bearer valid-token' };

    beforeEach(() => {
      configureAuthSupabaseMock({
        tables: baseAuthTables(),
        getUser: jest.fn().mockResolvedValue({
          data: { user: validUser({ id: TEST_AUTH_USER_ID, user_metadata: { role: 'CASSISTANT' } }) },
          error: null,
        }),
      });
    });

    it('retorna 400 sem clinic_id', async () => {
      const res = await request(buildApp()).get('/perm').set(authHeader);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/clinic_id não fornecido/i);
    });

    it('retorna 403 quando role não tem permissão', async () => {
      configureAuthSupabaseMock({
        tables: {
          ...baseAuthTables(),
          clinic_users: [clinicUserRow({ role: 'CASSISTANT' })],
        },
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: validUser({ id: TEST_AUTH_USER_ID, user_metadata: { role: 'CASSISTANT' } }),
          },
          error: null,
        }),
      });

      const res = await request(buildApp())
        .get('/perm')
        .query({ clinic_id: TEST_AUTH_CLINIC_ID })
        .set(authHeader);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Permissão negada/i);
    });

    it('permite acesso quando role tem permissão', async () => {
      configureAuthSupabaseMock({
        tables: {
          ...baseAuthTables(),
          clinic_users: [clinicUserRow({ role: 'CADMIN' })],
        },
        getUser: jest.fn().mockResolvedValue({
          data: { user: validUser({ id: TEST_AUTH_USER_ID, user_metadata: { role: 'CADMIN' } }) },
          error: null,
        }),
      });

      const res = await request(buildApp())
        .get('/perm')
        .query({ clinic_id: TEST_AUTH_CLINIC_ID })
        .set(authHeader);

      expect(res.status).toBe(200);
    });
  });

  describe('requireClinicAccess', () => {
    const authHeader = { Authorization: 'Bearer valid-token' };

    beforeEach(() => {
      configureAuthSupabaseMock({
        tables: baseAuthTables(),
        getUser: jest.fn().mockResolvedValue({
          data: { user: validUser({ id: TEST_AUTH_USER_ID }) },
          error: null,
        }),
      });
    });

    it('retorna 400 sem clinic_id', async () => {
      const res = await request(buildApp()).get('/clinic-access').set(authHeader);
      expect(res.status).toBe(400);
    });

    it('retorna 403 sem membership ativa', async () => {
      configureAuthSupabaseMock({
        tables: { ...baseAuthTables(), clinic_users: [] },
        getUser: jest.fn().mockResolvedValue({
          data: { user: validUser({ id: TEST_AUTH_USER_ID }) },
          error: null,
        }),
      });

      const res = await request(buildApp())
        .get('/clinic-access')
        .query({ clinic_id: TEST_AUTH_CLINIC_ID })
        .set(authHeader);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Acesso negado/i);
    });

    it('permite acesso com membership ativa', async () => {
      const res = await request(buildApp())
        .get('/clinic-access')
        .query({ clinic_id: TEST_AUTH_CLINIC_ID })
        .set(authHeader);

      expect(res.status).toBe(200);
    });
  });

  describe('checkPermission / checkClinicAccess (unitários via módulo)', () => {
    it('checkPermission retorna true para CADMIN', async () => {
      configureAuthSupabaseMock({
        tables: {
          ...baseAuthTables(),
          clinic_users: [clinicUserRow({ role: 'CADMIN' })],
        },
      });
      const allowed = await checkPermission(TEST_AUTH_USER_ID, TEST_AUTH_CLINIC_ID, 'hub.pets.read');
      expect(allowed).toBe(true);
    });

    it('checkClinicAccess retorna true para dono da clínica', async () => {
      configureAuthSupabaseMock({
        tables: {
          clinic_users: [],
          clinics: [{ id: TEST_AUTH_USER_ID, status: 'active' }],
          units: [],
        },
      });
      const allowed = await checkClinicAccess(TEST_AUTH_USER_ID, TEST_AUTH_USER_ID);
      expect(allowed).toBe(true);
    });
  });
});
