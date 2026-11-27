jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule(),
);

import request from 'supertest';
import app from '../../../app';
import { configureAuthMock, resetAuthMock } from '../../../__tests__/helpers/authTestDouble';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import { hasPermission, type Role } from '../../../utils/permissions';
import { betaClinicSubscription } from '../../../__tests__/helpers/fixtures/hubSubscription';

const CLINIC = '11111111-1111-4111-8111-111111111101';
const APPT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const SVC_LINE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
const SVC_TYPE = 'cccccccc-cccc-4ccc-8ccc-cccccccc0001';
const STAFF = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001';
const RULE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001';
const USER = '11111111-1111-4111-8111-111111111111';

function authAs(role: Role) {
  configureAuthMock({
    user: { id: USER, email: `${role.toLowerCase()}@test.com`, role },
    checkPermission: (_userId, _clinicId, permission) => hasPermission(role, permission),
  });
}

describe('Finance service execution lines', () => {
  afterEach(() => {
    resetAuthMock();
  });

  it('GET lista linhas e marca commission_requires_executor conforme regra', async () => {
    configureSupabaseMock({
      tables: {
        clinic_hub_subscriptions: [betaClinicSubscription(CLINIC)],
        hub_appointments: [{ id: APPT, clinic_id: CLINIC, appointment_kind: 'standard' }],
        hub_appointment_services: [
          {
            id: SVC_LINE,
            appointment_id: APPT,
            hub_service_type_id: SVC_TYPE,
            executed_at: null,
            executed_by_staff_id: null,
            sale_amount_applied: 50,
          },
        ],
        hub_service_types: [
          { id: SVC_TYPE, clinic_id: CLINIC, name: 'Consulta', service_group: 'clinica', deleted_at: null },
        ],
        hub_commission_rules: [
          {
            id: RULE,
            clinic_id: CLINIC,
            hub_service_type_id: SVC_TYPE,
            hub_inventory_item_id: null,
            basis: 'percent_of_sale',
            rate: 10,
            active: true,
            deleted_at: null,
          },
        ],
      },
    });
    authAs('CFINANCE');

    const res = await request(app)
      .get('/api/hub/finance/service-execution-lines')
      .query({ clinic_id: CLINIC, source_type: 'appointment', source_id: APPT });
    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].id).toBe(SVC_LINE);
    expect(res.body.lines[0].commission_requires_executor).toBe(true);
  });

  it('PATCH marca execução com hub.financial.write', async () => {
    configureSupabaseMock({
      tables: {
        clinic_hub_subscriptions: [betaClinicSubscription(CLINIC)],
        hub_appointments: [{ id: APPT, clinic_id: CLINIC, appointment_kind: 'standard' }],
        hub_appointment_services: [
          {
            id: SVC_LINE,
            appointment_id: APPT,
            hub_service_type_id: SVC_TYPE,
            executed_at: null,
            executed_by_staff_id: null,
          },
        ],
      },
    });
    authAs('CFINANCE');

    const res = await request(app)
      .patch(`/api/hub/finance/appointment-service-lines/${SVC_LINE}`)
      .send({ clinic_id: CLINIC, executed: true, executed_by_staff_id: STAFF });
    expect(res.status).toBe(200);
    expect(res.body.line?.executed_by_staff_id).toBe(STAFF);
    expect(res.body.line?.executed_at).toBeTruthy();

    const rows = getMockSupabaseClient()._state.tables.hub_appointment_services ?? [];
    const row = rows.find((r) => String(r.id) === SVC_LINE);
    expect(row?.executed_by_staff_id).toBe(STAFF);
  });
});
