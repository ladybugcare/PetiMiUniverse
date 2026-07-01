jest.mock('../config/supabase', () =>
  require('./helpers/authSupabaseDouble').getAuthSupabaseModule()
);

import request from 'supertest';
import app from '../app';
import { configureAuthSupabaseMock } from './helpers/authSupabaseDouble';
import { baseAuthTables } from './helpers/fixtures/auth';

describe('POST /auth/login rate limit', () => {
  beforeAll(() => {
    delete process.env.DISABLE_RATE_LIMIT;
  });

  afterAll(() => {
    process.env.DISABLE_RATE_LIMIT = 'true';
  });

  beforeEach(() => {
    configureAuthSupabaseMock({
      tables: baseAuthTables(),
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      }),
    });
  });

  it('retorna 429 após 5 tentativas falhas', async () => {
    const payload = { email: 'brute-force@test.com', password: 'wrong' };

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/auth/login').send(payload);
      expect(res.status).toBe(401);
    }

    const blocked = await request(app).post('/auth/login').send(payload);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Muitas tentativas de login/i);
  });
});
