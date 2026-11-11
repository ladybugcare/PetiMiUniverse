jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());

import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';
import {
  markHubAppointmentPaidFromReceivable,
  syncHubAppointmentPaidFromReceivable,
} from '../appointmentPaidFromBilling';

const APPT_GROOM = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APPT_ENC = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const APPT_BOARD = '33333333-cccc-4ccc-8ccc-cccccccccccc';
const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENC_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RES_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function appointmentRow(id: string, status = 'done') {
  return {
    id,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    guardian_id: TEST_GUARDIAN_ID,
    pet_id: TEST_PET_ID,
    status,
    deleted_at: null,
  };
}

describe('markHubAppointmentPaidFromReceivable', () => {
  it('marca paid via grooming_session (source direto)', async () => {
    configureSupabaseMock({
      tables: {
        hub_receivables: [
          {
            id: 'rec-1',
            clinic_id: TEST_CLINIC_ID,
            status: 'paid',
            source_type: 'grooming_session',
            source_id: SESSION_ID,
            comanda_id: null,
          },
        ],
        hub_grooming_sessions: [
          {
            id: SESSION_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: APPT_GROOM,
          },
        ],
        hub_appointments: [appointmentRow(APPT_GROOM)],
        hub_comandas: [],
        hub_encounters: [],
        hub_boarding_reservations: [],
      },
    });

    await markHubAppointmentPaidFromReceivable({ clinicId: TEST_CLINIC_ID, receivableId: 'rec-1' });
    const appt = getMockSupabaseClient()._state.tables.hub_appointments?.find((a) => a.id === APPT_GROOM);
    expect(appt?.status).toBe('paid');
  });

  it('marca paid via encounter (source direto)', async () => {
    configureSupabaseMock({
      tables: {
        hub_receivables: [
          {
            id: 'rec-2',
            clinic_id: TEST_CLINIC_ID,
            status: 'paid',
            source_type: 'encounter',
            source_id: ENC_ID,
            comanda_id: null,
          },
        ],
        hub_encounters: [
          {
            id: ENC_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: APPT_ENC,
          },
        ],
        hub_appointments: [appointmentRow(APPT_ENC)],
        hub_grooming_sessions: [],
        hub_comandas: [],
        hub_boarding_reservations: [],
      },
    });

    await markHubAppointmentPaidFromReceivable({ clinicId: TEST_CLINIC_ID, receivableId: 'rec-2' });
    const appt = getMockSupabaseClient()._state.tables.hub_appointments?.find((a) => a.id === APPT_ENC);
    expect(appt?.status).toBe('paid');
  });

  it('marca paid via boarding_reservation (source direto)', async () => {
    configureSupabaseMock({
      tables: {
        hub_receivables: [
          {
            id: 'rec-3',
            clinic_id: TEST_CLINIC_ID,
            status: 'paid',
            source_type: 'boarding_reservation',
            source_id: RES_ID,
            comanda_id: null,
          },
        ],
        hub_boarding_reservations: [
          {
            id: RES_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: APPT_BOARD,
          },
        ],
        hub_appointments: [appointmentRow(APPT_BOARD)],
        hub_grooming_sessions: [],
        hub_encounters: [],
        hub_comandas: [],
      },
    });

    await markHubAppointmentPaidFromReceivable({ clinicId: TEST_CLINIC_ID, receivableId: 'rec-3' });
    const appt = getMockSupabaseClient()._state.tables.hub_appointments?.find((a) => a.id === APPT_BOARD);
    expect(appt?.status).toBe('paid');
  });

  it('marca paid via comanda origin encounter (recebível manual)', async () => {
    configureSupabaseMock({
      tables: {
        hub_receivables: [
          {
            id: 'rec-4',
            clinic_id: TEST_CLINIC_ID,
            status: 'paid',
            source_type: 'manual',
            source_id: 'manual-uuid',
            comanda_id: 'comanda-enc',
          },
        ],
        hub_comandas: [
          {
            id: 'comanda-enc',
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'encounter',
            origin_id: ENC_ID,
          },
        ],
        hub_encounters: [
          {
            id: ENC_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: APPT_ENC,
          },
        ],
        hub_appointments: [appointmentRow(APPT_ENC, 'done')],
        hub_grooming_sessions: [],
        hub_boarding_reservations: [],
      },
    });

    await markHubAppointmentPaidFromReceivable({ clinicId: TEST_CLINIC_ID, receivableId: 'rec-4' });
    const appt = getMockSupabaseClient()._state.tables.hub_appointments?.find((a) => a.id === APPT_ENC);
    expect(appt?.status).toBe('paid');
  });

  it('marca paid via comanda origin boarding_reservation (recebível manual)', async () => {
    configureSupabaseMock({
      tables: {
        hub_receivables: [
          {
            id: 'rec-5',
            clinic_id: TEST_CLINIC_ID,
            status: 'paid',
            source_type: 'manual',
            source_id: 'manual-uuid-2',
            comanda_id: 'comanda-board',
          },
        ],
        hub_comandas: [
          {
            id: 'comanda-board',
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'boarding_reservation',
            origin_id: RES_ID,
          },
        ],
        hub_boarding_reservations: [
          {
            id: RES_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: APPT_BOARD,
          },
        ],
        hub_appointments: [appointmentRow(APPT_BOARD)],
        hub_grooming_sessions: [],
        hub_encounters: [],
      },
    });

    await markHubAppointmentPaidFromReceivable({ clinicId: TEST_CLINIC_ID, receivableId: 'rec-5' });
    const appt = getMockSupabaseClient()._state.tables.hub_appointments?.find((a) => a.id === APPT_BOARD);
    expect(appt?.status).toBe('paid');
  });

  it('não altera agenda quando boarding é walk-in (sem appointment)', async () => {
    configureSupabaseMock({
      tables: {
        hub_receivables: [
          {
            id: 'rec-6',
            clinic_id: TEST_CLINIC_ID,
            status: 'paid',
            source_type: 'boarding_reservation',
            source_id: RES_ID,
            comanda_id: null,
          },
        ],
        hub_boarding_reservations: [
          {
            id: RES_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: null,
          },
        ],
        hub_appointments: [appointmentRow(APPT_BOARD)],
        hub_grooming_sessions: [],
        hub_encounters: [],
        hub_comandas: [],
      },
    });

    await markHubAppointmentPaidFromReceivable({ clinicId: TEST_CLINIC_ID, receivableId: 'rec-6' });
    const appt = getMockSupabaseClient()._state.tables.hub_appointments?.find((a) => a.id === APPT_BOARD);
    expect(appt?.status).toBe('done');
  });
});

describe('syncHubAppointmentPaidFromReceivable (estorno)', () => {
  it('desmarca paid → done quando recebível deixa de estar pago', async () => {
    configureSupabaseMock({
      tables: {
        hub_receivables: [
          {
            id: 'rec-rev-1',
            clinic_id: TEST_CLINIC_ID,
            status: 'pending',
            source_type: 'grooming_session',
            source_id: SESSION_ID,
            comanda_id: null,
            deleted_at: null,
          },
        ],
        hub_grooming_sessions: [
          {
            id: SESSION_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: APPT_GROOM,
          },
        ],
        hub_appointments: [appointmentRow(APPT_GROOM, 'paid')],
        hub_comandas: [],
        hub_encounters: [],
        hub_boarding_reservations: [],
      },
    });

    await syncHubAppointmentPaidFromReceivable({ clinicId: TEST_CLINIC_ID, receivableId: 'rec-rev-1' });
    const appt = getMockSupabaseClient()._state.tables.hub_appointments?.find((a) => a.id === APPT_GROOM);
    expect(appt?.status).toBe('done');
  });

  it('mantém paid se outro recebível vinculado ainda estiver pago', async () => {
    configureSupabaseMock({
      tables: {
        hub_receivables: [
          {
            id: 'rec-rev-2',
            clinic_id: TEST_CLINIC_ID,
            status: 'pending',
            source_type: 'manual',
            source_id: 'manual-a',
            comanda_id: 'comanda-groom',
            deleted_at: null,
          },
          {
            id: 'rec-still-paid',
            clinic_id: TEST_CLINIC_ID,
            status: 'paid',
            source_type: 'grooming_session',
            source_id: SESSION_ID,
            comanda_id: null,
            deleted_at: null,
          },
        ],
        hub_comandas: [
          {
            id: 'comanda-groom',
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'grooming_session',
            origin_id: SESSION_ID,
            deleted_at: null,
          },
        ],
        hub_grooming_sessions: [
          {
            id: SESSION_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: APPT_GROOM,
          },
        ],
        hub_appointments: [appointmentRow(APPT_GROOM, 'paid')],
        hub_encounters: [],
        hub_boarding_reservations: [],
      },
    });

    await syncHubAppointmentPaidFromReceivable({ clinicId: TEST_CLINIC_ID, receivableId: 'rec-rev-2' });
    const appt = getMockSupabaseClient()._state.tables.hub_appointments?.find((a) => a.id === APPT_GROOM);
    expect(appt?.status).toBe('paid');
  });

  it('desmarca paid via comanda origin encounter após estorno', async () => {
    configureSupabaseMock({
      tables: {
        hub_receivables: [
          {
            id: 'rec-rev-3',
            clinic_id: TEST_CLINIC_ID,
            status: 'partially_paid',
            source_type: 'manual',
            source_id: 'manual-uuid',
            comanda_id: 'comanda-enc',
            deleted_at: null,
          },
        ],
        hub_comandas: [
          {
            id: 'comanda-enc',
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'encounter',
            origin_id: ENC_ID,
            deleted_at: null,
          },
        ],
        hub_encounters: [
          {
            id: ENC_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: APPT_ENC,
            deleted_at: null,
          },
        ],
        hub_appointments: [appointmentRow(APPT_ENC, 'paid')],
        hub_grooming_sessions: [],
        hub_boarding_reservations: [],
      },
    });

    await syncHubAppointmentPaidFromReceivable({ clinicId: TEST_CLINIC_ID, receivableId: 'rec-rev-3' });
    const appt = getMockSupabaseClient()._state.tables.hub_appointments?.find((a) => a.id === APPT_ENC);
    expect(appt?.status).toBe('done');
  });
});
