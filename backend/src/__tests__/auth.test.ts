jest.mock('../config/supabase', () =>
  require('./helpers/authSupabaseDouble').getAuthSupabaseModule()
);

import request from 'supertest';
import app from '../app';
import {
  configureAuthSupabaseMock,
  getAuthMockSupabaseClient,
} from './helpers/authSupabaseDouble';
import {
  baseAuthTables,
  clinicRow,
  clinicUserRow,
  emptyAuthTables,
  TEST_AUTH_CLINIC_ID,
  TEST_AUTH_USER_ID,
  validSession,
  validUser,
} from './helpers/fixtures/auth';

describe('POST /auth/login', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    configureAuthSupabaseMock({ tables: baseAuthTables() });
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('retorna 400 quando email ou senha ausentes', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'a@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Email e senha são obrigatórios/i);
  });

  it('retorna 401 para credenciais inválidas', async () => {
    configureAuthSupabaseMock({
      tables: baseAuthTables(),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      }),
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid login credentials/i);
  });

  it('retorna 401 quando email não confirmado (FRONTEND_URL produção)', async () => {
    process.env.FRONTEND_URL = 'https://app.petimi.com.br';

    configureAuthSupabaseMock({
      tables: baseAuthTables(),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: validUser({ email_confirmed_at: null }),
          session: validSession(),
        },
        error: null,
      }),
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'secret' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Email não confirmado/i);
  });

  it('permite login sem confirmação de email em localhost', async () => {
    process.env.FRONTEND_URL = 'http://localhost:5173';

    configureAuthSupabaseMock({
      tables: baseAuthTables(),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: validUser({ email_confirmed_at: null }),
          session: validSession(),
        },
        error: null,
      }),
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'secret' });

    expect(res.status).toBe(200);
    expect(res.body.session).toBeTruthy();
  });

  it('permite login sem confirmação de email em staging', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.FRONTEND_URL = 'https://staging.petimi.com.br';

    configureAuthSupabaseMock({
      tables: baseAuthTables(),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: validUser({ email_confirmed_at: null }),
          session: validSession(),
        },
        error: null,
      }),
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'secret' });

    expect(res.status).toBe(200);
  });

  it('retorna 401 quando clínica está inactive (role clinic)', async () => {
    configureAuthSupabaseMock({
      tables: {
        ...baseAuthTables(),
        clinics: [clinicRow({ status: 'inactive' })],
      },
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: validUser({ user_metadata: { role: 'clinic', name: 'Dono' } }),
          session: validSession(),
        },
        error: null,
      }),
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'secret' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/clínica inativada/i);
  });

  it('retorna 401 quando clinic_user está inactive', async () => {
    configureAuthSupabaseMock({
      tables: {
        ...baseAuthTables(),
        clinic_users: [clinicUserRow({ status: 'inactive' })],
      },
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'secret' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/membro da clínica foi inativado/i);
  });

  it('retorna 200 com session, user e clinicUser em login válido', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'secret' });

    expect(res.status).toBe(200);
    expect(res.body.session.access_token).toBeTruthy();
    expect(res.body.user.id).toBe(TEST_AUTH_USER_ID);
    expect(res.body.clinicUser.clinic_id).toBe(TEST_AUTH_CLINIC_ID);
    expect(res.body.clinicUser.role).toBe('CADMIN');
  });

  it('retorna needsOnboarding true quando não há unidades', async () => {
    configureAuthSupabaseMock({
      tables: {
        ...baseAuthTables(),
        units: [],
      },
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'secret' });

    expect(res.status).toBe(200);
    expect(res.body.onboarding.needsOnboarding).toBe(true);
    expect(res.body.onboarding.hasUnits).toBe(false);
  });

  it('completa login mesmo sem clinic_users (sem payload de clínica)', async () => {
    configureAuthSupabaseMock({
      tables: emptyAuthTables(),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: validUser({ user_metadata: { role: 'vet' } }),
          session: validSession(),
        },
        error: null,
      }),
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'secret' });

    expect(res.status).toBe(200);
    expect(res.body.clinicUser).toBeNull();
  });
});

describe('POST /auth/signup', () => {
  beforeEach(() => {
    configureAuthSupabaseMock({ tables: baseAuthTables() });
  });

  it('retorna 400 quando email ou senha ausentes', async () => {
    const res = await request(app).post('/auth/signup').send({ email: 'a@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Email e senha são obrigatórios/i);
  });

  it('retorna 400 quando Supabase retorna erro', async () => {
    configureAuthSupabaseMock({
      tables: baseAuthTables(),
      signUp: jest.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      }),
    });

    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'dup@test.com', password: 'secret123', name: 'Dup', role: 'vet' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('retorna 200 com user e session em signup válido', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'new@test.com', password: 'secret123', name: 'Novo', role: 'vet' });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(TEST_AUTH_USER_ID);
    expect(res.body.session.access_token).toBeTruthy();

    const client = getAuthMockSupabaseClient();
    expect(client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@test.com',
        password: 'secret123',
      })
    );
  });
});

describe('POST /auth/resend-confirmation', () => {
  beforeEach(() => {
    configureAuthSupabaseMock({ tables: baseAuthTables() });
  });

  it('retorna 400 quando email ausente', async () => {
    const res = await request(app).post('/auth/resend-confirmation').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Email é obrigatório/i);
  });

  it('retorna 400 quando usuário não encontrado', async () => {
    configureAuthSupabaseMock({
      tables: baseAuthTables(),
      listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
    });

    const res = await request(app)
      .post('/auth/resend-confirmation')
      .send({ email: 'missing@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Usuário não encontrado/i);
  });

  it('retorna 400 quando email já confirmado', async () => {
    configureAuthSupabaseMock({
      tables: baseAuthTables(),
      listUsers: jest.fn().mockResolvedValue({
        data: { users: [validUser({ email_confirmed_at: '2026-01-01T00:00:00.000Z' })] },
        error: null,
      }),
    });

    const res = await request(app)
      .post('/auth/resend-confirmation')
      .send({ email: 'user@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/já está confirmado/i);
  });

  it('retorna 200 via inviteUserByEmail', async () => {
    const res = await request(app)
      .post('/auth/resend-confirmation')
      .send({ email: 'user@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/reenviado com sucesso/i);
  });

  it('retorna 200 com passwordChanged no fallback generateLink', async () => {
    configureAuthSupabaseMock({
      tables: baseAuthTables(),
      inviteUserByEmail: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'User already exists' },
      }),
    });

    const res = await request(app)
      .post('/auth/resend-confirmation')
      .send({ email: 'user@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.passwordChanged).toBe(true);
    expect(res.body.message).toMatch(/redefinir sua senha/i);
  });
});
