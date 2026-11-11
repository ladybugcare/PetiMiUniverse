jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

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

const TEST_ENCOUNTER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TEST_HOSP_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

describe('GET /api/hub/finance/day-board (internação — gap C)', () => {
  it('lista origin_type hospitalization com billing_origin do encounter', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_encounters: [],
        hub_appointments: [],
        hub_hospitalizations: [
          {
            id: TEST_HOSP_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            pet_id: TEST_PET_ID,
            guardian_id: TEST_GUARDIAN_ID,
            hub_encounter_id: TEST_ENCOUNTER_ID,
            hub_appointment_id: null,
            status: 'discharged',
            admitted_at: '2026-06-03T10:00:00.000Z',
            discharged_at: '2026-06-05T15:00:00.000Z',
            daily_hub_service_type_id: 'svc-daily-1',
            daily_unit_amount: 120,
            billing_waived_at: null,
            deleted_at: null,
            pet: { id: TEST_PET_ID, name: 'Rex' },
            guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
          },
        ],
        hub_service_types: [{ id: 'svc-daily-1', name: 'Diária internação', deleted_at: null }],
        hub_hospitalization_charges: [],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/day-board')
      .query({ clinic_id: TEST_CLINIC_ID, unit_id: TEST_UNIT_ID, date: '2026-06-05' });

    expect(res.status).toBe(200);
    const item = res.body.items.find(
      (it: { origin_type: string; origin_id: string }) =>
        it.origin_type === 'hospitalization' && it.origin_id === TEST_HOSP_ID,
    );
    expect(item).toBeTruthy();
    expect(item.billing_origin_type).toBe('encounter');
    expect(item.billing_origin_id).toBe(TEST_ENCOUNTER_ID);
    expect(item.origin_label).toBe('Internação (alta)');
    expect(item.estimated_amount).toBeGreaterThanOrEqual(240);
  });

  it('omite internação com billing_waived_at', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_hospitalizations: [
          {
            id: TEST_HOSP_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            pet_id: TEST_PET_ID,
            guardian_id: TEST_GUARDIAN_ID,
            hub_encounter_id: TEST_ENCOUNTER_ID,
            hub_appointment_id: null,
            status: 'discharged',
            admitted_at: '2026-06-03T10:00:00.000Z',
            discharged_at: '2026-06-05T15:00:00.000Z',
            daily_hub_service_type_id: 'svc-daily-1',
            daily_unit_amount: 120,
            billing_waived_at: '2026-06-05T16:00:00.000Z',
            deleted_at: null,
            pet: { id: TEST_PET_ID, name: 'Rex' },
            guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
          },
        ],
        hub_service_types: [{ id: 'svc-daily-1', name: 'Diária internação', deleted_at: null }],
        hub_hospitalization_charges: [],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/day-board')
      .query({ clinic_id: TEST_CLINIC_ID, unit_id: TEST_UNIT_ID, date: '2026-06-05' });

    expect(res.status).toBe(200);
    expect(
      res.body.items.some(
        (it: { origin_type: string; origin_id: string }) =>
          it.origin_type === 'hospitalization' || it.origin_id === TEST_HOSP_ID,
      ),
    ).toBe(false);
  });
});
