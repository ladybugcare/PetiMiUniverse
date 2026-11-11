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

const TEST_GROOMING_SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEST_ENCOUNTER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEST_APPOINTMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function closedGroomingSession(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_GROOMING_SESSION_ID,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    guardian_id: TEST_GUARDIAN_ID,
    hub_appointment_id: null,
    grooming_stage: 'closed',
    closed_at: '2026-06-05T15:00:00.000Z',
    billing_waived_at: null,
    deleted_at: null,
    pet: { id: TEST_PET_ID, name: 'Rex' },
    guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
    ...overrides,
  };
}

function completedEncounter(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_ENCOUNTER_ID,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    guardian_id: TEST_GUARDIAN_ID,
    hub_appointment_id: null,
    status: 'completed',
    completed_at: '2026-06-05T16:00:00.000Z',
    billing_waived_at: null,
    deleted_at: null,
    pet: { id: TEST_PET_ID, name: 'Rex' },
    guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
    ...overrides,
  };
}

function doneAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_APPOINTMENT_ID,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    guardian_id: TEST_GUARDIAN_ID,
    pet_id: TEST_PET_ID,
    hub_staff_member_id: null,
    starts_at: '2026-06-05T10:00:00.000Z',
    ends_at: '2026-06-05T11:00:00.000Z',
    status: 'done',
    title: 'Consulta',
    billing_waived_at: null,
    deleted_at: null,
    pet: { id: TEST_PET_ID, name: 'Rex' },
    guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
    ...overrides,
  };
}

describe('GET /api/hub/finance/unbilled-completed (dedup via comanda)', () => {
  it('exclui grooming faturado via recebível manual da comanda fechada', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_grooming_sessions: [closedGroomingSession()],
        hub_grooming_session_extras: [],
        hub_comandas: [
          {
            id: 'comanda-groom-1',
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'grooming_session',
            origin_id: TEST_GROOMING_SESSION_ID,
            status: 'fechada',
            deleted_at: null,
          },
        ],
        hub_receivables: [
          {
            id: 'rec-manual-groom',
            clinic_id: TEST_CLINIC_ID,
            source_type: 'manual',
            source_id: 'manual-src-groom',
            comanda_id: 'comanda-groom-1',
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
    expect(res.body.items.some((i: { source_id: string }) => i.source_id === TEST_GROOMING_SESSION_ID)).toBe(
      false,
    );
  });

  it('exclui encounter faturado via recebível manual da comanda fechada', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_encounters: [completedEncounter()],
        hub_comandas: [
          {
            id: 'comanda-enc-1',
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'encounter',
            origin_id: TEST_ENCOUNTER_ID,
            status: 'fechada',
            deleted_at: null,
          },
        ],
        hub_receivables: [
          {
            id: 'rec-manual-enc',
            clinic_id: TEST_CLINIC_ID,
            source_type: 'manual',
            source_id: 'manual-src-enc',
            comanda_id: 'comanda-enc-1',
            status: 'pending',
            deleted_at: null,
          },
        ],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/unbilled-completed')
      .query({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(200);
    expect(res.body.items.some((i: { source_id: string }) => i.source_id === TEST_ENCOUNTER_ID)).toBe(false);
  });

  it('exclui appointment faturado via recebível manual da comanda fechada', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_appointments: [doneAppointment()],
        hub_appointment_services: [],
        hub_comandas: [
          {
            id: 'comanda-appt-1',
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'appointment',
            origin_id: TEST_APPOINTMENT_ID,
            status: 'fechada',
            deleted_at: null,
          },
        ],
        hub_receivables: [
          {
            id: 'rec-manual-appt',
            clinic_id: TEST_CLINIC_ID,
            source_type: 'manual',
            source_id: 'manual-src-appt',
            comanda_id: 'comanda-appt-1',
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
    expect(res.body.items.some((i: { source_id: string }) => i.source_id === TEST_APPOINTMENT_ID)).toBe(false);
  });

  it('ainda lista grooming closed sem comanda/recebível', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_grooming_sessions: [closedGroomingSession()],
        hub_grooming_session_extras: [],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/unbilled-completed')
      .query({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(200);
    expect(res.body.items.some((i: { source_type: string; source_id: string }) =>
      i.source_type === 'grooming_session' && i.source_id === TEST_GROOMING_SESSION_ID,
    )).toBe(true);
  });
});
