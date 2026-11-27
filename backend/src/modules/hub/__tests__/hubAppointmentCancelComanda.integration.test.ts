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

const COMANDA_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RECEIVABLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PAYMENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function baseTables(extra: Record<string, unknown[]> = {}) {
  return {
    ...emptyBoardingTables(),
    units: [{ id: TEST_UNIT_ID, clinic_id: TEST_CLINIC_ID, name: 'Matriz', is_main: true }],
    hub_pets: [{ id: TEST_PET_ID, clinic_id: TEST_CLINIC_ID, size_tier: 'medio', deleted_at: null }],
    hub_guardians: [{ id: TEST_GUARDIAN_ID, clinic_id: TEST_CLINIC_ID, deleted_at: null }],
    hub_appointments: [
      boardingAppointment({
        status: 'confirmed',
        appointment_kind: 'standard',
        title: 'Consulta',
        starts_at: '2026-11-27T14:00:00.000Z',
        ends_at: '2026-11-27T14:30:00.000Z',
      }),
    ],
    hub_appointment_services: [],
    hub_financial_adjustments: [],
    hub_comanda_events: [],
    hub_customer_package_balances: [],
    hub_package_redemptions: [],
    notifications: [],
    ...extra,
  };
}

function openAppointmentComanda(overrides: Record<string, unknown> = {}) {
  return {
    id: COMANDA_ID,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    guardian_id: TEST_GUARDIAN_ID,
    pet_id: TEST_PET_ID,
    origin_type: 'appointment',
    origin_id: TEST_APPOINTMENT_ID,
    status: 'aberta',
    financial_status: 'open',
    subtotal_amount: 180,
    discount_amount: 0,
    total_amount: 180,
    deleted_at: null,
    cancellation_pending_at: null,
    cancellation_resolved_at: null,
    ...overrides,
  };
}

describe('PATCH /api/hub/appointments/:id cancel → comanda', () => {
  it('anula comanda aberta sem pagamento ao cancelar o agendamento', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_comandas: [openAppointmentComanda()],
        hub_comanda_items: [
          {
            id: 'item-1',
            clinic_id: TEST_CLINIC_ID,
            comanda_id: COMANDA_ID,
            line_total: 180,
            quantity: 1,
            unit_amount: 180,
            sort_order: 0,
            pet_id: TEST_PET_ID,
          },
        ],
      }),
    });

    const res = await request(app)
      .patch(`/api/hub/appointments/${TEST_APPOINTMENT_ID}`)
      .send({ clinic_id: TEST_CLINIC_ID, status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(res.body.appointment?.status).toBe('cancelled');
    expect(res.body.comanda_effects?.cancelled_ids).toContain(COMANDA_ID);

    const comanda = getMockSupabaseClient()._state.tables.hub_comandas?.find((c) => c.id === COMANDA_ID);
    expect(comanda?.status).toBe('cancelada');
    expect(comanda?.billing_waived_at ?? comanda?.closed_at).toBeTruthy();

    const appt = getMockSupabaseClient()._state.tables.hub_appointments?.find(
      (a) => a.id === TEST_APPOINTMENT_ID,
    );
    expect(appt?.billing_waived_at).toBeTruthy();
    expect(String(appt?.billing_waive_reason ?? '')).toMatch(/Cancelamento operacional/i);
  });

  it('marca pendência de ajuste quando a comanda já tem pagamento', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_comandas: [openAppointmentComanda()],
        hub_comanda_items: [
          {
            id: 'item-1',
            clinic_id: TEST_CLINIC_ID,
            comanda_id: COMANDA_ID,
            line_total: 180,
            quantity: 1,
            unit_amount: 180,
            sort_order: 0,
            pet_id: TEST_PET_ID,
          },
        ],
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            guardian_id: TEST_GUARDIAN_ID,
            comanda_id: COMANDA_ID,
            status: 'paid',
            final_amount: 180,
            original_amount: 180,
            source_type: 'appointment',
            source_id: TEST_APPOINTMENT_ID,
            returned_amount: 0,
            deleted_at: null,
          },
        ],
        hub_payments: [
          {
            id: PAYMENT_ID,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            amount: 180,
            payment_method: 'pix',
            status: 'posted',
          },
        ],
      }),
    });

    const res = await request(app)
      .patch(`/api/hub/appointments/${TEST_APPOINTMENT_ID}`)
      .send({ clinic_id: TEST_CLINIC_ID, status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(res.body.comanda_effects?.pending_adjustment_ids).toContain(COMANDA_ID);
    expect(res.body.comanda_effects?.cancelled_ids ?? []).not.toContain(COMANDA_ID);

    const comanda = getMockSupabaseClient()._state.tables.hub_comandas?.find((c) => c.id === COMANDA_ID);
    expect(comanda?.status).toBe('aberta');
    expect(comanda?.cancellation_pending_at).toBeTruthy();
  });

  it('cancela recebível pending sem pagamento e anula a comanda', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_comandas: [openAppointmentComanda()],
        hub_comanda_items: [
          {
            id: 'item-1',
            clinic_id: TEST_CLINIC_ID,
            comanda_id: COMANDA_ID,
            line_total: 180,
            quantity: 1,
            unit_amount: 180,
            sort_order: 0,
            pet_id: TEST_PET_ID,
          },
        ],
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            guardian_id: TEST_GUARDIAN_ID,
            comanda_id: COMANDA_ID,
            status: 'pending',
            final_amount: 180,
            original_amount: 180,
            source_type: 'appointment',
            source_id: TEST_APPOINTMENT_ID,
            returned_amount: 0,
            deleted_at: null,
          },
        ],
        hub_payments: [],
      }),
    });

    const res = await request(app)
      .patch(`/api/hub/appointments/${TEST_APPOINTMENT_ID}`)
      .send({ clinic_id: TEST_CLINIC_ID, status: 'no_show' });

    expect(res.status).toBe(200);
    expect(res.body.appointment?.status).toBe('no_show');
    expect(res.body.comanda_effects?.cancelled_ids).toContain(COMANDA_ID);

    const rec = getMockSupabaseClient()._state.tables.hub_receivables?.find((r) => r.id === RECEIVABLE_ID);
    expect(rec?.status).toBe('cancelled');

    const comanda = getMockSupabaseClient()._state.tables.hub_comandas?.find((c) => c.id === COMANDA_ID);
    expect(comanda?.status).toBe('cancelada');
  });

  it('anula comanda aberta com origin grooming_session ligada ao agendamento', async () => {
    const GROOMING_SESSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    configureSupabaseMock({
      tables: baseTables({
        hub_grooming_sessions: [
          {
            id: GROOMING_SESSION_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: TEST_APPOINTMENT_ID,
            deleted_at: null,
            created_at: '2026-11-27T13:00:00.000Z',
          },
        ],
        hub_comandas: [
          openAppointmentComanda({
            origin_type: 'grooming_session',
            origin_id: GROOMING_SESSION_ID,
          }),
        ],
        hub_comanda_items: [
          {
            id: 'item-1',
            clinic_id: TEST_CLINIC_ID,
            comanda_id: COMANDA_ID,
            line_total: 180,
            quantity: 1,
            unit_amount: 180,
            sort_order: 0,
            pet_id: TEST_PET_ID,
          },
        ],
      }),
    });

    const res = await request(app)
      .patch(`/api/hub/appointments/${TEST_APPOINTMENT_ID}`)
      .send({ clinic_id: TEST_CLINIC_ID, status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(res.body.comanda_effects?.cancelled_ids).toContain(COMANDA_ID);

    const comanda = getMockSupabaseClient()._state.tables.hub_comandas?.find((c) => c.id === COMANDA_ID);
    expect(comanda?.status).toBe('cancelada');

    const session = getMockSupabaseClient()._state.tables.hub_grooming_sessions?.find(
      (s) => s.id === GROOMING_SESSION_ID,
    );
    expect(session?.billing_waived_at).toBeTruthy();
  });
});
