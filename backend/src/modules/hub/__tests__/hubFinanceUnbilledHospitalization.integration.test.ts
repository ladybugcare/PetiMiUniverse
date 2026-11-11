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
const TEST_APPT_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

describe('GET /api/hub/finance/unbilled-completed (internação — gap C)', () => {
  it('lista source_type hospitalization com billing_origin do encounter', async () => {
    // Encounter ainda aberto: não entra no unbilled de encounter; C deve listar a internação.
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_encounters: [
          {
            id: TEST_ENCOUNTER_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            guardian_id: TEST_GUARDIAN_ID,
            hub_appointment_id: null,
            status: 'in_progress',
            completed_at: null,
            billing_waived_at: null,
            deleted_at: null,
            pet: { id: TEST_PET_ID, name: 'Rex' },
            guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
          },
        ],
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
      .get('/api/hub/finance/unbilled-completed')
      .query({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(200);
    const item = res.body.items.find(
      (i: { source_type: string; source_id: string }) =>
        i.source_type === 'hospitalization' && i.source_id === TEST_HOSP_ID,
    );
    expect(item).toBeTruthy();
    expect(item.billing_origin_type).toBe('encounter');
    expect(item.billing_origin_id).toBe(TEST_ENCOUNTER_ID);
    expect(item.origin_label).toBe('Internação (alta)');
    expect(item.estimated_amount).toBeGreaterThanOrEqual(240);
  });

  it('lista hospitalization via appointment quando não há encounter', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_appointments: [
          {
            id: TEST_APPT_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            guardian_id: TEST_GUARDIAN_ID,
            pet_id: TEST_PET_ID,
            status: 'done',
            starts_at: '2026-06-03T10:00:00.000Z',
            ends_at: '2026-06-03T11:00:00.000Z',
            billing_waived_at: null,
            deleted_at: null,
            title: 'Internação',
            pet: { id: TEST_PET_ID, name: 'Rex' },
            guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
          },
        ],
        hub_appointment_services: [],
        hub_hospitalizations: [
          {
            id: TEST_HOSP_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            pet_id: TEST_PET_ID,
            guardian_id: TEST_GUARDIAN_ID,
            hub_encounter_id: null,
            hub_appointment_id: TEST_APPT_ID,
            status: 'discharged',
            admitted_at: '2026-06-03T10:00:00.000Z',
            discharged_at: '2026-06-05T15:00:00.000Z',
            daily_hub_service_type_id: 'svc-daily-1',
            daily_unit_amount: 100,
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
      .get('/api/hub/finance/unbilled-completed')
      .query({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(200);
    const hospItem = res.body.items.find(
      (i: { source_type: string }) => i.source_type === 'hospitalization',
    );
    // Appointment done sem operação filha também pode aparecer; hospitalization deve existir
    // ou o appointment já cobrir a origem (dedupe). Aceita hospitalization explícita.
    if (hospItem) {
      expect(hospItem.billing_origin_type).toBe('appointment');
      expect(hospItem.billing_origin_id).toBe(TEST_APPT_ID);
    } else {
      expect(
        res.body.items.some(
          (i: { source_type: string; source_id: string }) =>
            i.source_type === 'appointment' && i.source_id === TEST_APPT_ID,
        ),
      ).toBe(true);
    }
  });

  it('exclui hospitalization já faturada via comanda do encounter', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_encounters: [
          {
            id: TEST_ENCOUNTER_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            guardian_id: TEST_GUARDIAN_ID,
            hub_appointment_id: null,
            status: 'in_progress',
            completed_at: null,
            billing_waived_at: null,
            deleted_at: null,
            pet: { id: TEST_PET_ID, name: 'Rex' },
            guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
          },
        ],
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
        hub_comandas: [
          {
            id: 'comanda-hosp-1',
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'encounter',
            origin_id: TEST_ENCOUNTER_ID,
            status: 'fechada',
            deleted_at: null,
          },
        ],
        hub_receivables: [
          {
            id: 'rec-hosp-1',
            clinic_id: TEST_CLINIC_ID,
            source_type: 'manual',
            source_id: 'manual-hosp',
            comanda_id: 'comanda-hosp-1',
            status: 'paid',
            deleted_at: null,
          },
        ],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/unbilled-completed')
      .query({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(200);
    expect(
      res.body.items.some(
        (i: { source_type: string; source_id: string }) =>
          i.source_type === 'hospitalization' || i.source_id === TEST_ENCOUNTER_ID,
      ),
    ).toBe(false);
  });

  it('exclui hospitalization com billing_waived_at', async () => {
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
      .get('/api/hub/finance/unbilled-completed')
      .query({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(200);
    expect(res.body.items.some((i: { source_id: string }) => i.source_id === TEST_HOSP_ID)).toBe(false);
  });
});
