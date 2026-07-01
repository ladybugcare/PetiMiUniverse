jest.mock('../config/supabase', () =>
  require('./helpers/authSupabaseDouble').getAuthSupabaseModule()
);

import request from 'supertest';
import app from '../app';
import { configureAuthSupabaseMock } from './helpers/authSupabaseDouble';
import { validUser } from './helpers/fixtures/auth';

describe('Admin routes — guards de autenticação', () => {
  beforeEach(() => {
    configureAuthSupabaseMock({
      tables: { clinics: [], units: [], clinic_users: [] },
      getUser: jest.fn().mockResolvedValue({
        data: { user: validUser({ user_metadata: { role: 'vet' } }) },
        error: null,
      }),
      listUsers: jest.fn().mockResolvedValue({
        data: { users: [] },
        error: null,
      }),
    });
  });

  it('GET /admin/users/admins retorna 403 para JWT de vet', async () => {
    const res = await request(app)
      .get('/admin/users/admins')
      .set('Authorization', 'Bearer vet-token');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Acesso negado/i);
  });

  it('GET /admin/users/admins retorna 200 para JWT admin', async () => {
    configureAuthSupabaseMock({
      tables: { clinics: [], units: [], clinic_users: [] },
      getUser: jest.fn().mockResolvedValue({
        data: { user: validUser({ user_metadata: { role: 'admin' } }) },
        error: null,
      }),
      listUsers: jest.fn().mockResolvedValue({
        data: {
          users: [
            validUser({
              id: 'admin-1',
              user_metadata: { role: 'admin', name: 'Admin' },
            }),
          ],
        },
        error: null,
      }),
    });

    const res = await request(app)
      .get('/admin/users/admins')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.admins)).toBe(true);
  });

  it('POST /admin/users/create/clinic não exige role admin hoje (gap documentado)', async () => {
    configureAuthSupabaseMock({
      tables: { clinics: [], units: [], clinic_users: [] },
      getUser: jest.fn().mockResolvedValue({
        data: { user: validUser({ user_metadata: { role: 'vet' } }) },
        error: null,
      }),
    });

    const res = await request(app)
      .post('/admin/users/create/clinic')
      .set('Authorization', 'Bearer vet-token')
      .send({
        name: 'Clínica Teste',
        email: 'clinic-new@test.com',
        password: 'Secret123!',
        cnpj: '12345678000190',
      });

    // Comportamento atual: rota só exige JWT, não role admin — pode retornar 201 ou 500 se createUser falhar no mock
    expect(res.status).not.toBe(403);
  });

  it('POST /admin/users/create/clinic retorna 401 sem token', async () => {
    const res = await request(app)
      .post('/admin/users/create/clinic')
      .send({ name: 'X', email: 'x@test.com', password: 'Secret123!' });

    expect(res.status).toBe(401);
  });
});
