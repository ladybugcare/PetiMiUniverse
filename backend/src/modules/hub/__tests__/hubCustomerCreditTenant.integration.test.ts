jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule(),
);
jest.mock('../hubSubscriptionService', () => {
  const actual = jest.requireActual('../hubSubscriptionService');
  return {
    ...actual,
    getClinicEntitlementSnapshot: jest.fn().mockResolvedValue({
      status: 'active',
      is_beta: true,
      base_plan_slug: 'beta',
      enabled_modules: ['hub_core', 'clinic', 'grooming', 'boarding'],
      disabled_operational_areas: [],
      max_units: null,
      max_users: null,
      access_mode: 'full',
    }),
  };
});

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';

const CLINIC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLINIC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GUARDIAN_A = '11111111-1111-4111-8111-111111111111';
const GUARDIAN_B = '22222222-2222-4222-8222-222222222222';
const COMANDA_B = '33333333-3333-4333-8333-333333333333';

function seed() {
  configureSupabaseMock({
    tables: {
      hub_guardians: [
        { id: GUARDIAN_A, clinic_id: CLINIC_A, full_name: 'Tutor A', deleted_at: null },
        { id: GUARDIAN_B, clinic_id: CLINIC_B, full_name: 'Tutor B', deleted_at: null },
      ],
      hub_comandas: [{ id: COMANDA_B, clinic_id: CLINIC_B }],
      hub_receivables: [],
      hub_customer_credit_movements: [],
      hub_cash_sessions: [],
    },
  });
}

describe('Tenant isolation — crédito do tutor', () => {
  beforeEach(seed);

  it('POST movimento com guardian de outra clínica → 400', async () => {
    const res = await request(app).post('/api/hub/finance/credit-movements').send({
      clinic_id: CLINIC_A,
      guardian_id: GUARDIAN_B,
      direction: 'in',
      amount: 10,
      reason: 'Crédito inválido',
      payment_method: 'pix',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Tutor inválido/i);
  });

  it('POST movimento com comanda de outra clínica → 400', async () => {
    const res = await request(app).post('/api/hub/finance/credit-movements').send({
      clinic_id: CLINIC_A,
      guardian_id: GUARDIAN_A,
      direction: 'in',
      amount: 10,
      reason: 'Crédito com comanda alheia',
      payment_method: 'pix',
      comanda_id: COMANDA_B,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Referência inválida/i);
  });

  it('POST movimento válido → 201', async () => {
    const res = await request(app).post('/api/hub/finance/credit-movements').send({
      clinic_id: CLINIC_A,
      guardian_id: GUARDIAN_A,
      direction: 'in',
      amount: 25.5,
      reason: 'Crédito válido',
      payment_method: 'pix',
    });
    expect(res.status).toBe(201);
    expect(res.body.movement?.guardian_id).toBe(GUARDIAN_A);
  });

  it('GET saldo com guardian de outra clínica → 400', async () => {
    const res = await request(app).get(
      `/api/hub/finance/credit-balance?clinic_id=${CLINIC_A}&guardian_id=${GUARDIAN_B}`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Tutor inválido/i);
  });
});
