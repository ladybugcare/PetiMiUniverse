jest.mock('../../config/supabase', () =>
  require('../../__tests__/helpers/authSupabaseDouble').getAuthSupabaseModule()
);

import express from 'express';
import request from 'supertest';
import { requireActiveClinic } from '../requireActiveClinic';
import { configureAuthSupabaseMock } from '../../__tests__/helpers/authSupabaseDouble';
import {
  clinicRow,
  TEST_AUTH_CLINIC_ID,
  unitRow,
} from '../../__tests__/helpers/fixtures/auth';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/active-check', requireActiveClinic, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('requireActiveClinic (integração)', () => {
  beforeEach(() => {
    configureAuthSupabaseMock({
      tables: {
        clinics: [clinicRow({ status: 'active' })],
        units: [unitRow()],
      },
    });
  });

  it('retorna 400 sem clinic_id', async () => {
    const res = await request(buildApp()).post('/active-check').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/clinic_id é obrigatório/i);
  });

  it('permite clínica active', async () => {
    const res = await request(buildApp())
      .post('/active-check')
      .send({ clinic_id: TEST_AUTH_CLINIC_ID });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('bloqueia pending_unit', async () => {
    configureAuthSupabaseMock({
      tables: {
        clinics: [clinicRow({ status: 'pending_unit' })],
        units: [],
      },
    });

    const res = await request(buildApp())
      .post('/active-check')
      .send({ clinic_id: TEST_AUTH_CLINIC_ID });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('pending_unit');
    expect(res.body.action_required).toBe('create_first_unit');
  });

  it('bloqueia pending_approval sem unidade aprovada', async () => {
    configureAuthSupabaseMock({
      tables: {
        clinics: [clinicRow({ status: 'pending_approval' })],
        units: [unitRow({ status: 'pending' })],
      },
    });

    const res = await request(buildApp())
      .post('/active-check')
      .send({ clinic_id: TEST_AUTH_CLINIC_ID });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('pending_approval');
    expect(res.body.action_required).toBe('wait_approval');
  });

  it('permite pending_approval com unidade approved', async () => {
    configureAuthSupabaseMock({
      tables: {
        clinics: [clinicRow({ status: 'pending_approval' })],
        units: [unitRow({ status: 'approved' })],
      },
    });

    const res = await request(buildApp())
      .post('/active-check')
      .send({ clinic_id: TEST_AUTH_CLINIC_ID });

    expect(res.status).toBe(200);
  });

  it('bloqueia suspended', async () => {
    configureAuthSupabaseMock({
      tables: {
        clinics: [clinicRow({ status: 'suspended' })],
        units: [unitRow()],
      },
    });

    const res = await request(buildApp())
      .post('/active-check')
      .send({ clinic_id: TEST_AUTH_CLINIC_ID });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('suspended');
  });
});
