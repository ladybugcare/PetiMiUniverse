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
      is_beta: false,
      base_plan_slug: 'solo',
      enabled_modules: ['hub_core', 'clinic', 'grooming', 'boarding'],
      disabled_operational_areas: [],
      max_units: 5,
      max_users: 10,
      access_mode: 'full',
    }),
    countClinicUnits: jest.fn().mockResolvedValue(1),
    countClinicActiveUsers: jest.fn().mockResolvedValue(1),
  };
});

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import { configureAuthMock, resetAuthMock } from '../../../__tests__/helpers/authTestDouble';

const CLINIC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAFF_A = '11111111-1111-4111-8111-111111111111';
const CLINIC_USER_A = '33333333-3333-4333-8333-333333333333';
const UNIT_A = '44444444-4444-4444-8444-444444444444';

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
          has_hub_access: true,
          hub_access_email: 'ana@test.com',
          hub_access_role: 'CMANAGER',
          operational_areas: ['equipe'],
          deleted_at: null,
          clinic_user_id: CLINIC_USER_A,
          default_unit_id: UNIT_A,
        },
      ],
      units: [{ id: UNIT_A, clinic_id: CLINIC_A, nickname: 'Matriz' }],
      hub_staff_service_types: [],
      clinic_users: [
        {
          id: CLINIC_USER_A,
          user_id: 'user-ana',
          clinic_id: CLINIC_A,
          role: 'CMANAGER',
          status: 'active',
          email: 'ana@test.com',
          operational_areas: ['equipe'],
        },
      ],
    },
  });
}

describe('Staff privilege elevation', () => {
  afterEach(() => {
    resetAuthMock();
  });

  it('sem hub.staff.roles.assign → 403 ao promover role', async () => {
    seedStaff();
    configureAuthMock({
      checkPermission: async (_u, _c, permission) =>
        permission === 'hub.staff.write' || permission === 'hub.staff.read',
    });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_A}`)
      .send({ clinic_id: CLINIC_A, hub_access_role: 'CADMIN' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/administradores/i);
  });

  it('com hub.staff.roles.assign → 200 e grava hub_access_role', async () => {
    seedStaff();
    configureAuthMock({
      checkPermission: async () => true,
    });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_A}`)
      .send({ clinic_id: CLINIC_A, hub_access_role: 'CADMIN' });

    expect(res.status).toBe(200);
    expect(res.body.staff?.hub_access_role).toBe('CADMIN');

    const staffRow = getMockSupabaseClient()._state.tables.hub_staff_members?.find(
      (r) => String((r as { id?: string }).id) === STAFF_A,
    ) as { hub_access_role?: string } | undefined;
    expect(staffRow?.hub_access_role).toBe('CADMIN');
  });

  it('hub.staff.write sem roles.assign ainda edita full_name', async () => {
    seedStaff();
    configureAuthMock({
      checkPermission: async (_u, _c, permission) =>
        permission === 'hub.staff.write' || permission === 'hub.staff.read',
    });

    const res = await request(app)
      .patch(`/api/hub/staff/${STAFF_A}`)
      .send({ clinic_id: CLINIC_A, full_name: 'Ana Atualizada' });

    expect(res.status).toBe(200);
    expect(res.body.staff?.full_name).toBe('Ana Atualizada');
  });
});
