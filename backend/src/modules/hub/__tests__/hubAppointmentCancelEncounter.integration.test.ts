jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  boardingAppointment,
  emptyBoardingTables,
  TEST_APPOINTMENT_ID,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';
import { syncOpenComandasAfterEncounterCompleted } from '../hubComandasController';

const TEST_ENCOUNTER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa00c2';
const TEST_CLINIC_SERVICE_TYPE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee00c2';
const TEST_ENC_SVC_ID = '11111111-1111-4111-8111-1111111110c2';

function clinicServiceType() {
  return {
    id: TEST_CLINIC_SERVICE_TYPE_ID,
    clinic_id: TEST_CLINIC_ID,
    service_group: 'clinica',
    name: 'Consulta clínica',
    sale_amount: 180,
    cost_amount: 0,
    deleted_at: null,
  };
}

function openEncounter(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_ENCOUNTER_ID,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    guardian_id: TEST_GUARDIAN_ID,
    pet_id: TEST_PET_ID,
    hub_appointment_id: TEST_APPOINTMENT_ID,
    hub_case_id: null,
    status: 'in_progress',
    chief_complaint: 'Tosse',
    summary_notes: null,
    anamnesis: null,
    physical_exam: null,
    diagnosis: null,
    billing_waived_at: null,
    completed_at: null,
    deleted_at: null,
    ...overrides,
  };
}

function baseTables(extra: Record<string, unknown[]> = {}) {
  return {
    ...emptyBoardingTables(),
    units: [{ id: TEST_UNIT_ID, clinic_id: TEST_CLINIC_ID, name: 'Matriz', is_main: true }],
    hub_pets: [{ id: TEST_PET_ID, clinic_id: TEST_CLINIC_ID, size_tier: 'medio', deleted_at: null }],
    hub_guardians: [{ id: TEST_GUARDIAN_ID, clinic_id: TEST_CLINIC_ID, deleted_at: null }],
    hub_service_types: [clinicServiceType()],
    hub_appointments: [
      boardingAppointment({
        status: 'in_progress',
        appointment_kind: 'clinic',
        title: 'Consulta',
        hub_service_type_id: TEST_CLINIC_SERVICE_TYPE_ID,
        starts_at: '2026-11-27T14:00:00.000Z',
        ends_at: '2026-11-27T14:30:00.000Z',
      }),
    ],
    hub_appointment_services: [],
    hub_encounters: [openEncounter()],
    hub_encounter_services: [],
    hub_comandas: [],
    hub_comanda_items: [],
    hub_receivables: [],
    hub_receivable_lines: [],
    hub_clinical_exams: [],
    hub_vaccination_records: [],
    hub_prescriptions: [],
    hub_encounter_medication_administrations: [],
    hub_comanda_events: [],
    hub_encounter_events: [],
    hub_clinical_document_versions: [],
    hub_financial_adjustments: [],
    notifications: [],
    ...extra,
  };
}

describe('PATCH /api/hub/appointments/:id cancel → encounter clínico', () => {
  it('cancela encounter in_progress ligado ao cancelar o agendamento', async () => {
    configureSupabaseMock({ tables: baseTables() });

    const res = await request(app)
      .patch(`/api/hub/appointments/${TEST_APPOINTMENT_ID}`)
      .send({ clinic_id: TEST_CLINIC_ID, status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(res.body.appointment?.status).toBe('cancelled');

    const enc = getMockSupabaseClient()._state.tables.hub_encounters?.find(
      (e) => e.id === TEST_ENCOUNTER_ID,
    );
    expect(enc?.status).toBe('cancelled');
  });

  it('cancela encounter waiting ao marcar falta', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_encounters: [openEncounter({ status: 'waiting' })],
      }),
    });

    const res = await request(app)
      .patch(`/api/hub/appointments/${TEST_APPOINTMENT_ID}`)
      .send({ clinic_id: TEST_CLINIC_ID, status: 'no_show' });

    expect(res.status).toBe(200);
    expect(res.body.appointment?.status).toBe('no_show');

    const enc = getMockSupabaseClient()._state.tables.hub_encounters?.find(
      (e) => e.id === TEST_ENCOUNTER_ID,
    );
    expect(enc?.status).toBe('cancelled');
  });
});

describe('syncOpenComandasAfterEncounterCompleted — agenda cancelada', () => {
  it('não cria comanda encounter quando a agenda ligada está cancelled', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_appointments: [
          boardingAppointment({
            status: 'cancelled',
            appointment_kind: 'clinic',
            title: 'Consulta',
            hub_service_type_id: TEST_CLINIC_SERVICE_TYPE_ID,
            starts_at: '2026-11-27T14:00:00.000Z',
            ends_at: '2026-11-27T14:30:00.000Z',
          }),
        ],
        hub_encounters: [openEncounter({ status: 'completed', completed_at: '2026-11-27T14:20:00.000Z' })],
        hub_encounter_services: [
          {
            id: TEST_ENC_SVC_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_encounter_id: TEST_ENCOUNTER_ID,
            hub_service_type_id: TEST_CLINIC_SERVICE_TYPE_ID,
            hub_appointment_service_id: null,
            service_name: 'Consulta clínica',
            quantity: 1,
            unit_amount: 180,
            billing_mode: 'charge',
            price_status: 'confirmed',
            deleted_at: null,
            sort_order: 0,
          },
        ],
      }),
    });

    await syncOpenComandasAfterEncounterCompleted(TEST_CLINIC_ID, TEST_ENCOUNTER_ID);

    const comandas = getMockSupabaseClient()._state.tables.hub_comandas ?? [];
    expect(comandas.filter((c) => c.origin_type === 'encounter')).toHaveLength(0);
    expect(comandas).toHaveLength(0);
  });
});

describe('POST /api/hub/encounters/:id/complete — agenda cancelada', () => {
  it('retorna 409 quando o agendamento ligado está cancelled', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_appointments: [
          boardingAppointment({
            status: 'cancelled',
            appointment_kind: 'clinic',
            title: 'Consulta',
            hub_service_type_id: TEST_CLINIC_SERVICE_TYPE_ID,
            starts_at: '2026-11-27T14:00:00.000Z',
            ends_at: '2026-11-27T14:30:00.000Z',
          }),
        ],
        hub_encounters: [openEncounter({ status: 'in_progress', chief_complaint: 'Tosse' })],
      }),
    });

    const res = await request(app)
      .post(`/api/hub/encounters/${TEST_ENCOUNTER_ID}/complete`)
      .send({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(409);
    expect(String(res.body.error ?? '')).toMatch(/cancelado ou marcado como falta/i);

    const enc = getMockSupabaseClient()._state.tables.hub_encounters?.find(
      (e) => e.id === TEST_ENCOUNTER_ID,
    );
    expect(enc?.status).toBe('in_progress');
  });

  it('retorna 409 quando o próprio encounter já está cancelled', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_encounters: [openEncounter({ status: 'cancelled', chief_complaint: 'Tosse' })],
      }),
    });

    const res = await request(app)
      .post(`/api/hub/encounters/${TEST_ENCOUNTER_ID}/complete`)
      .send({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(409);
    expect(String(res.body.error ?? '')).toMatch(/atendimento cancelado/i);
  });
});
