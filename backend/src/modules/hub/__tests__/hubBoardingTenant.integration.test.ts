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
import {
  emptyBoardingTables,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';

const CLINIC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PET_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GUARDIAN_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UNIT_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const GUARDIAN_UNLINKED = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('Tenant isolation — boarding', () => {
  beforeEach(() => {
    const base = emptyBoardingTables();
    configureSupabaseMock({
      tables: {
        ...base,
        hub_pets: [
          ...base.hub_pets,
          { id: PET_B, clinic_id: CLINIC_B, name: 'Pet B', deleted_at: null },
        ],
        hub_guardians: [
          ...base.hub_guardians,
          { id: GUARDIAN_B, clinic_id: CLINIC_B, full_name: 'Tutor B', deleted_at: null },
          {
            id: GUARDIAN_UNLINKED,
            clinic_id: TEST_CLINIC_ID,
            full_name: 'Sem vínculo',
            deleted_at: null,
          },
        ],
        units: [
          ...base.units,
          { id: UNIT_B, clinic_id: CLINIC_B, is_main: true, name: 'Unidade B' },
        ],
      },
    });
  });

  it('rejeita pet de outra clínica', async () => {
    const res = await request(app).post('/api/hub/boarding/reservations').send({
      clinic_id: TEST_CLINIC_ID,
      pet_id: PET_B,
      unit_id: TEST_UNIT_ID,
      mode: 'hotel',
      daily_rate_cents: 10000,
      status: 'reserved',
      expected_check_in: '2026-06-01T14:00:00.000Z',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pet inválido/i);
  });

  it('rejeita unit de outra clínica', async () => {
    const res = await request(app).post('/api/hub/boarding/reservations').send({
      clinic_id: TEST_CLINIC_ID,
      pet_id: TEST_PET_ID,
      unit_id: UNIT_B,
      mode: 'hotel',
      daily_rate_cents: 10000,
      status: 'reserved',
      expected_check_in: '2026-06-01T14:00:00.000Z',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unidade inválida/i);
  });

  it('rejeita tutor sem vínculo com o pet na mesma clínica', async () => {
    const res = await request(app).post('/api/hub/boarding/reservations').send({
      clinic_id: TEST_CLINIC_ID,
      pet_id: TEST_PET_ID,
      guardian_id: GUARDIAN_UNLINKED,
      unit_id: TEST_UNIT_ID,
      mode: 'hotel',
      daily_rate_cents: 10000,
      status: 'reserved',
      expected_check_in: '2026-06-01T14:00:00.000Z',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Tutor inválido/i);
  });

  it('cria reserva válida', async () => {
    const res = await request(app).post('/api/hub/boarding/reservations').send({
      clinic_id: TEST_CLINIC_ID,
      pet_id: TEST_PET_ID,
      guardian_id: TEST_GUARDIAN_ID,
      unit_id: TEST_UNIT_ID,
      mode: 'hotel',
      daily_rate_cents: 15000,
      status: 'reserved',
      expected_check_in: '2026-06-01T14:00:00.000Z',
    });
    expect(res.status).toBe(201);
    expect(res.body.reservation?.pet_id).toBe(TEST_PET_ID);
  });
});
