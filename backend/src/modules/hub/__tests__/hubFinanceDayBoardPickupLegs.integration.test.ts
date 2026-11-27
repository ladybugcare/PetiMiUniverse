jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  TEST_APPOINTMENT_ID,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
  emptyBoardingTables,
} from '../../../__tests__/helpers/fixtures/boarding';

const BATH_SERVICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0101';
const LT_SERVICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0101';
const LEG_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0101';
const STANDALONE_LT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd0101';

describe('GET /api/hub/finance/day-board — L&T anexado vs standalone', () => {
  it('omite perna anexada e sobe o valor no ancestral; standalone permanece', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_service_types: [
          {
            id: BATH_SERVICE_ID,
            clinic_id: TEST_CLINIC_ID,
            service_group: 'banho_tosa',
            name: 'Banho',
            sale_amount: 50,
            deleted_at: null,
          },
          {
            id: LT_SERVICE_ID,
            clinic_id: TEST_CLINIC_ID,
            service_group: 'leva_traz',
            name: 'Leva e Traz',
            sale_amount: 40,
            deleted_at: null,
          },
        ],
        hub_appointments: [
          {
            id: TEST_APPOINTMENT_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            pet_id: TEST_PET_ID,
            guardian_id: TEST_GUARDIAN_ID,
            starts_at: '2026-06-15T14:00:00.000Z',
            ends_at: '2026-06-15T15:00:00.000Z',
            status: 'confirmed',
            title: 'Banho',
            hub_service_type_id: BATH_SERVICE_ID,
            appointment_kind: 'standard',
            parent_appointment_id: null,
            visit_group_id: null,
            billing_waived_at: null,
            deleted_at: null,
            pet: { id: TEST_PET_ID, name: 'Rex' },
            guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
            appointment_services: [
              {
                id: 'svc-bath',
                hub_service_type_id: BATH_SERVICE_ID,
                sale_amount_applied: 50,
                service_type: { name: 'Banho', service_group: 'banho_tosa', sale_amount: 50 },
              },
            ],
          },
          {
            id: LEG_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            pet_id: TEST_PET_ID,
            guardian_id: TEST_GUARDIAN_ID,
            starts_at: '2026-06-15T13:30:00.000Z',
            ends_at: '2026-06-15T13:45:00.000Z',
            status: 'confirmed',
            title: 'Busca',
            hub_service_type_id: LT_SERVICE_ID,
            appointment_kind: 'pickup_route',
            parent_appointment_id: TEST_APPOINTMENT_ID,
            visit_group_id: null,
            billing_waived_at: null,
            deleted_at: null,
            pet: { id: TEST_PET_ID, name: 'Rex' },
            guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
            appointment_services: [
              {
                id: 'svc-leg',
                hub_service_type_id: LT_SERVICE_ID,
                sale_amount_applied: 20,
                service_type: { name: 'Leva e Traz', service_group: 'leva_traz', sale_amount: 40 },
              },
            ],
          },
          {
            id: STANDALONE_LT_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            pet_id: TEST_PET_ID,
            guardian_id: TEST_GUARDIAN_ID,
            starts_at: '2026-06-15T16:00:00.000Z',
            ends_at: '2026-06-15T16:30:00.000Z',
            status: 'confirmed',
            title: 'L&T avulso',
            hub_service_type_id: LT_SERVICE_ID,
            appointment_kind: 'pickup_route',
            parent_appointment_id: null,
            visit_group_id: null,
            billing_waived_at: null,
            deleted_at: null,
            pet: { id: TEST_PET_ID, name: 'Rex' },
            guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
            appointment_services: [
              {
                id: 'svc-standalone',
                hub_service_type_id: LT_SERVICE_ID,
                sale_amount_applied: 40,
                service_type: { name: 'Leva e Traz', service_group: 'leva_traz', sale_amount: 40 },
              },
            ],
          },
        ],
        hub_appointment_services: [
          {
            id: 'svc-bath',
            appointment_id: TEST_APPOINTMENT_ID,
            hub_service_type_id: BATH_SERVICE_ID,
            sale_amount_applied: 50,
            order_index: 0,
          },
          {
            id: 'svc-leg',
            appointment_id: LEG_ID,
            hub_service_type_id: LT_SERVICE_ID,
            sale_amount_applied: 20,
            order_index: 0,
          },
          {
            id: 'svc-standalone',
            appointment_id: STANDALONE_LT_ID,
            hub_service_type_id: LT_SERVICE_ID,
            sale_amount_applied: 40,
            order_index: 0,
          },
        ],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/day-board')
      .query({ clinic_id: TEST_CLINIC_ID, unit_id: TEST_UNIT_ID, date: '2026-06-15' });

    expect(res.status).toBe(200);
    const items = res.body.items as Array<{
      origin_type: string;
      origin_id: string;
      estimated_amount: number;
      services?: Array<{ name: string; amount: number }>;
    }>;

    expect(items.find((it) => it.origin_id === LEG_ID)).toBeUndefined();

    const parent = items.find(
      (it) => it.origin_type === 'appointment' && it.origin_id === TEST_APPOINTMENT_ID,
    );
    expect(parent).toBeDefined();
    expect(parent!.estimated_amount).toBeCloseTo(70, 2);
    expect(parent!.services?.some((s) => /leva e traz/i.test(s.name) && s.amount === 20)).toBe(true);

    const standalone = items.find(
      (it) => it.origin_type === 'appointment' && it.origin_id === STANDALONE_LT_ID,
    );
    expect(standalone).toBeDefined();
    expect(standalone!.estimated_amount).toBeCloseTo(40, 2);
  });
});
