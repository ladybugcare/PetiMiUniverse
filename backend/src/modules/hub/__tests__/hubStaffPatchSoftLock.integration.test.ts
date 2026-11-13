/**
 * PATCH /staff/:id — soft-lock por campos + RBAC + isolamento de clínica.
 */
jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);
jest.mock('../hubSubscriptionService', () => {
  const actual = jest.requireActual('../hubSubscriptionService');
  return {
    ...actual,
    getClinicEntitlementSnapshot: jest.fn(),
    countClinicUnits: jest.fn().mockResolvedValue(1),
    countClinicActiveUsers: jest.fn().mockResolvedValue(1),
  };
});

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import { configureAuthMock, resetAuthMock } from '../../../__tests__/helpers/authTestDouble';
import { getClinicEntitlementSnapshot } from '../hubSubscriptionService';
import type { HubEntitlementSnapshot } from '../hubSubscriptionService';

const getSnap = getClinicEntitlementSnapshot as jest.MockedFunction<
  typeof getClinicEntitlementSnapshot
>;

const CLINIC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLINIC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF_A = '11111111-1111-4111-8111-111111111111';
const STAFF_B = '22222222-2222-4222-8222-222222222222';
const UNIT_A = '33333333-3333-4333-8333-333333333333';

function snap(partial: Partial<HubEntitlementSnapshot>): HubEntitlementSnapshot {
  return {
    status: 'active',
    is_beta: false,
    base_plan_slug: 'solo',
    enabled_modules: ['hub_core', 'clinic', 'grooming', 'boarding'],
    disabled_operational_areas: [],
    max_units: 5,
    max_users: 10,
    access_mode: 'full',
    ...partial,
  };
}

function seedStaff() {
  configureSupabaseMock({
    tables: {
      hub_staff_members: [
        {
          id: STAFF_A,
          clinic_id: CLINIC_A,
          full_name: 'Ana Ops',
          display_name: 'Ana',
          job_title: 'Tosadora',
          professional_kind: 'groomer',
          specialties: [],
          active: true,
          affiliation: 'internal',
          has_hub_access: false,
          hub_access_email: null,
          hub_access_role: null,
          operational_areas: [],
          deleted_at: null,
          clinic_user_id: null,
          default_unit_id: null,
        },
        {
          id: STAFF_B,
          clinic_id: CLINIC_B,
          full_name: 'Bruno Outra',
          display_name: 'Bruno',
          job_title: 'Vet',
          professional_kind: 'vet',
          specialties: [],
          active: true,
          affiliation: 'internal',
          has_hub_access: false,
          deleted_at: null,
          clinic_user_id: null,
        },
      ],
      units: [{ id: UNIT_A, clinic_id: CLINIC_A, nickname: 'Matriz' }],
      hub_staff_service_types: [],
      clinic_users: [],
    },
  });
}

describe('PATCH /api/hub/staff/:id — soft-lock por campos', () => {
  afterEach(() => {
    resetAuthMock();
    getSnap.mockReset();
  });

  it('ops em soft_lock → 200', async () => {
    seedStaff();
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'past_due' }));
    configureAuthMock({ checkPermission: async () => true });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_A}`)
      .send({ clinic_id: CLINIC_A, phone: '11999990000', full_name: 'Ana Atualizada' });

    expect(res.status).toBe(200);
    expect(res.body.staff?.full_name).toBe('Ana Atualizada');
  });

  it('ops em read_history → 403 PLAN_READ_HISTORY', async () => {
    seedStaff();
    getSnap.mockResolvedValue(snap({ access_mode: 'read_history', status: 'canceled' }));
    configureAuthMock({ checkPermission: async () => true });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_A}`)
      .send({ clinic_id: CLINIC_A, phone: '11999990000' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_READ_HISTORY');
  });

  it('catálogo em soft_lock → 403 PLAN_SOFT_LOCK', async () => {
    seedStaff();
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'pending_payment' }));
    configureAuthMock({ checkPermission: async () => true });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_A}`)
      .send({ clinic_id: CLINIC_A, has_hub_access: true, hub_access_role: 'CVET_INTERNAL' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_SOFT_LOCK');
  });

  it('catálogo em full → 200', async () => {
    seedStaff();
    getSnap.mockResolvedValue(snap({ access_mode: 'full' }));
    configureAuthMock({ checkPermission: async () => true });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_A}`)
      .send({ clinic_id: CLINIC_A, affiliation: 'guest' });

    expect(res.status).toBe(200);
    expect(res.body.staff?.affiliation).toBe('guest');
  });

  it('misto ops+catálogo em soft_lock → 403', async () => {
    seedStaff();
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'past_due' }));
    configureAuthMock({ checkPermission: async () => true });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_A}`)
      .send({ clinic_id: CLINIC_A, full_name: 'X', active: false });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_SOFT_LOCK');
  });

  it('default_unit_id (capacidade) em soft_lock → 403', async () => {
    seedStaff();
    getSnap.mockResolvedValue(snap({ access_mode: 'soft_lock', status: 'past_due' }));
    configureAuthMock({ checkPermission: async () => true });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_A}`)
      .send({ clinic_id: CLINIC_A, default_unit_id: UNIT_A });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_SOFT_LOCK');
  });

  it('campo desconhecido → 400 (zod strict)', async () => {
    seedStaff();
    getSnap.mockResolvedValue(snap({ access_mode: 'full' }));
    configureAuthMock({ checkPermission: async () => true });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_A}`)
      .send({ clinic_id: CLINIC_A, not_a_field: true });

    expect(res.status).toBe(400);
  });

  it('sem hub.staff.write → 403', async () => {
    seedStaff();
    getSnap.mockResolvedValue(snap({ access_mode: 'full' }));
    configureAuthMock({ checkPermission: async () => false });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_A}`)
      .send({ clinic_id: CLINIC_A, phone: '11' });

    expect(res.status).toBe(403);
  });

  it('staff de outra clínica → 404', async () => {
    seedStaff();
    getSnap.mockResolvedValue(snap({ access_mode: 'full' }));
    configureAuthMock({ checkPermission: async () => true });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_B}`)
      .send({ clinic_id: CLINIC_A, phone: '11' });

    expect(res.status).toBe(404);
  });
});
