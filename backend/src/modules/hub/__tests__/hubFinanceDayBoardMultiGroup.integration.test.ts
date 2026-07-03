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

const TEST_CLINIC_APPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEST_GROOMING_APPT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEST_CLINIC_SERVICE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TEST_GROOMING_SERVICE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function multiGroupFixture() {
  return {
    tables: {
      ...emptyBoardingTables(),
      hub_service_types: [
        {
          id: TEST_CLINIC_SERVICE_ID,
          clinic_id: TEST_CLINIC_ID,
          service_group: 'clinica',
          name: 'Consulta',
          deleted_at: null,
        },
        {
          id: TEST_GROOMING_SERVICE_ID,
          clinic_id: TEST_CLINIC_ID,
          service_group: 'banho_tosa',
          name: 'Banho completo',
          deleted_at: null,
        },
      ],
      hub_appointments: [
        {
          id: TEST_CLINIC_APPT_ID,
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          pet_id: TEST_PET_ID,
          guardian_id: TEST_GUARDIAN_ID,
          starts_at: '2026-06-15T14:00:00.000Z',
          ends_at: '2026-06-15T15:00:00.000Z',
          status: 'confirmed',
          title: 'Consulta de rotina',
          hub_service_type_id: TEST_CLINIC_SERVICE_ID,
          billing_waived_at: null,
          deleted_at: null,
        },
        {
          id: TEST_GROOMING_APPT_ID,
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          pet_id: TEST_PET_ID,
          guardian_id: TEST_GUARDIAN_ID,
          starts_at: '2026-06-15T10:00:00.000Z',
          ends_at: '2026-06-15T11:00:00.000Z',
          status: 'confirmed',
          title: 'Banho Rex',
          hub_service_type_id: TEST_GROOMING_SERVICE_ID,
          billing_waived_at: null,
          deleted_at: null,
        },
      ],
      hub_appointment_services: [
        {
          id: 'svc-clinic-1',
          appointment_id: TEST_CLINIC_APPT_ID,
          hub_service_type_id: TEST_CLINIC_SERVICE_ID,
          sale_amount_applied: 120,
          order_index: 0,
        },
        {
          id: 'svc-groom-1',
          appointment_id: TEST_GROOMING_APPT_ID,
          hub_service_type_id: TEST_GROOMING_SERVICE_ID,
          sale_amount_applied: 80,
          order_index: 0,
        },
      ],
    },
  };
}

describe('GET /api/hub/finance/day-board (multi-group appointments)', () => {
  beforeEach(() => {
    configureSupabaseMock(multiGroupFixture());
  });

  it('inclui agendamentos de clínica e banho & tosa com service_group e origin_label', async () => {
    const res = await request(app)
      .get('/api/hub/finance/day-board')
      .query({ clinic_id: TEST_CLINIC_ID, unit_id: TEST_UNIT_ID, date: '2026-06-15' });

    expect(res.status).toBe(200);
    const clinic = res.body.items.find(
      (it: { origin_type: string; origin_id: string }) =>
        it.origin_type === 'appointment' && it.origin_id === TEST_CLINIC_APPT_ID
    );
    const grooming = res.body.items.find(
      (it: { origin_type: string; origin_id: string }) =>
        it.origin_type === 'appointment' && it.origin_id === TEST_GROOMING_APPT_ID
    );

    expect(clinic).toBeDefined();
    expect(clinic.service_group).toBe('clinica');
    expect(clinic.origin_label).toMatch(/Clínica/);

    expect(grooming).toBeDefined();
    expect(grooming.service_group).toBe('banho_tosa');
    expect(grooming.origin_label).toMatch(/Banho/);
  });
});
