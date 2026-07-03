jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  boardingAppointment,
  emptyBoardingTables,
  hotelReservationCheckedOut,
  hotelServiceType,
  TEST_APPOINTMENT_ID,
  TEST_CLINIC_ID,
  TEST_RESERVATION_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';

describe('GET /api/hub/finance/day-board (boarding)', () => {
  beforeEach(() => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [
          hotelReservationCheckedOut({
            expected_check_out: '2026-06-30T10:00:00.000Z',
            checked_out_at: '2026-06-30T10:00:00.000Z',
          }),
        ],
      },
    });
  });

  it('inclui reserva com expected_check_out no dia', async () => {
    const res = await request(app)
      .get('/api/hub/finance/day-board')
      .query({ clinic_id: TEST_CLINIC_ID, unit_id: TEST_UNIT_ID, date: '2026-06-30' });

    expect(res.status).toBe(200);
    const boarding = res.body.items.find(
      (it: { origin_type: string; origin_id: string }) =>
        it.origin_type === 'boarding_reservation' && it.origin_id === TEST_RESERVATION_ID
    );
    expect(boarding).toBeDefined();
    expect(boarding.operational_status).toBe('checked_out');
  });

  it('filtra scope financeiro por finance_handoff_at', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [
          hotelReservationCheckedOut({
            expected_check_out: '2026-06-30T10:00:00.000Z',
            checked_out_at: '2026-06-30T10:00:00.000Z',
          }),
        ],
        hub_comandas: [
          {
            id: 'comanda-handoff',
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'boarding_reservation',
            origin_id: TEST_RESERVATION_ID,
            status: 'fechada',
            finance_handoff_at: '2026-06-30T12:00:00.000Z',
            deleted_at: null,
          },
        ],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/day-board')
      .query({
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        date: '2026-06-30',
        billing_scope: 'financeiro',
      });

    expect(res.status).toBe(200);
    const boarding = res.body.items.find(
      (it: { origin_id: string }) => it.origin_id === TEST_RESERVATION_ID
    );
    expect(boarding).toBeDefined();
    expect(boarding.billing.finance_handoff_at).toBeTruthy();
  });

  it('inclui reserva no dia de check-in quando não há agendamento duplicado', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [
          hotelReservationCheckedOut({
            hub_appointment_id: null,
            status: 'reserved',
            expected_check_in: '2026-06-01T14:00:00.000Z',
            expected_check_out: '2026-06-04T10:00:00.000Z',
            checked_in_at: null,
            checked_out_at: null,
          }),
        ],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/day-board')
      .query({ clinic_id: TEST_CLINIC_ID, unit_id: TEST_UNIT_ID, date: '2026-06-01' });

    expect(res.status).toBe(200);
    const boarding = res.body.items.find(
      (it: { origin_type: string; origin_id: string }) =>
        it.origin_type === 'boarding_reservation' && it.origin_id === TEST_RESERVATION_ID
    );
    expect(boarding).toBeDefined();
    expect(boarding.service_group).toBe('hotel');
  });

  it('omite reserva no check-in quando agendamento já está no day board', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_service_types: [hotelServiceType()],
        hub_appointments: [
          boardingAppointment({
            starts_at: '2026-06-01T14:00:00.000Z',
            ends_at: '2026-06-04T10:00:00.000Z',
          }),
        ],
        hub_appointment_services: [
          {
            id: 'svc-hotel-1',
            appointment_id: TEST_APPOINTMENT_ID,
            hub_service_type_id: '88888888-8888-4888-8888-888888888888',
            sale_amount_applied: 150,
            order_index: 0,
          },
        ],
        hub_boarding_reservations: [
          hotelReservationCheckedOut({
            hub_appointment_id: TEST_APPOINTMENT_ID,
            status: 'checked_in',
            expected_check_in: '2026-06-01T14:00:00.000Z',
            expected_check_out: '2026-06-04T10:00:00.000Z',
            checked_in_at: '2026-06-01T14:00:00.000Z',
            checked_out_at: null,
          }),
        ],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/day-board')
      .query({ clinic_id: TEST_CLINIC_ID, unit_id: TEST_UNIT_ID, date: '2026-06-01' });

    expect(res.status).toBe(200);
    const appointmentItem = res.body.items.find(
      (it: { origin_type: string; origin_id: string }) =>
        it.origin_type === 'appointment' && it.origin_id === TEST_APPOINTMENT_ID
    );
    const boardingItem = res.body.items.find(
      (it: { origin_type: string; origin_id: string }) =>
        it.origin_type === 'boarding_reservation' && it.origin_id === TEST_RESERVATION_ID
    );
    expect(appointmentItem).toBeDefined();
    expect(boardingItem).toBeUndefined();
  });
});
