jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/mockAuth';
import { TEST_HOTEL_SERVICE_TYPE_ID, hotelServiceType } from '../../../__tests__/helpers/fixtures/boarding';

const TEST_PET_ID_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function batchSharedPayload(overrides: Record<string, unknown> = {}) {
  return {
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    hub_service_type_id: TEST_HOTEL_SERVICE_TYPE_ID,
    guardian_id: TEST_GUARDIAN_ID,
    starts_at: '2026-07-10T14:00:00.000Z',
    ends_at: '2026-07-10T15:00:00.000Z',
    services: [
      {
        hub_service_type_id: TEST_HOTEL_SERVICE_TYPE_ID,
        duration_minutes: 60,
      },
    ],
    ...overrides,
  };
}

describe('POST /api/hub/appointments/batch', () => {
  beforeEach(() => {
    configureSupabaseMock({
      tables: {
        hub_service_types: [hotelServiceType()],
        hub_pets: [
          { id: TEST_PET_ID, clinic_id: TEST_CLINIC_ID, deleted_at: null },
          { id: TEST_PET_ID_2, clinic_id: TEST_CLINIC_ID, deleted_at: null },
        ],
        hub_pet_guardians: [{ id: 'link-1', pet_id: TEST_PET_ID, guardian_id: TEST_GUARDIAN_ID }],
        hub_guardians: [{ id: TEST_GUARDIAN_ID, clinic_id: TEST_CLINIC_ID, deleted_at: null }],
      },
    });
  });

  it('rejeita batch com menos de 2 pets (validação de schema)', async () => {
    const res = await request(app)
      .post('/api/hub/appointments/batch')
      .send({
        clinic_id: TEST_CLINIC_ID,
        shared: batchSharedPayload(),
        pets: [{ pet_id: TEST_PET_ID }],
      });

    expect(res.status).toBe(400);
  });

  it('rejeita pet que não pertence ao tutor informado', async () => {
    const res = await request(app)
      .post('/api/hub/appointments/batch')
      .send({
        clinic_id: TEST_CLINIC_ID,
        shared: batchSharedPayload(),
        pets: [{ pet_id: TEST_PET_ID }, { pet_id: TEST_PET_ID_2 }],
      });

    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/não pertence ao tutor/i);
  });

  it('aceita recorrência em agendamento multi-pet (não rejeita na validação do batch)', async () => {
    configureSupabaseMock({
      tables: {
        hub_service_types: [hotelServiceType()],
        hub_pets: [
          { id: TEST_PET_ID, clinic_id: TEST_CLINIC_ID, deleted_at: null },
          { id: TEST_PET_ID_2, clinic_id: TEST_CLINIC_ID, deleted_at: null },
        ],
        hub_pet_guardians: [
          { id: 'link-1', pet_id: TEST_PET_ID, guardian_id: TEST_GUARDIAN_ID },
          { id: 'link-2', pet_id: TEST_PET_ID_2, guardian_id: TEST_GUARDIAN_ID },
        ],
        hub_guardians: [{ id: TEST_GUARDIAN_ID, clinic_id: TEST_CLINIC_ID, deleted_at: null }],
      },
    });

    const res = await request(app)
      .post('/api/hub/appointments/batch')
      .send({
        clinic_id: TEST_CLINIC_ID,
        shared: batchSharedPayload({
          recurrence: { kind: 'weekly', interval_value: 1, until_date: '2026-08-01' },
        }),
        pets: [{ pet_id: TEST_PET_ID }, { pet_id: TEST_PET_ID_2 }],
      });

    const errStr =
      typeof res.body.error === 'string' ? res.body.error : JSON.stringify(res.body.error ?? '');

    expect(errStr).not.toMatch(/recorrência não suportada em agendamento multi-pet/i);
  });
});
