jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule()
);
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  boardingAppointment,
  checkedInHotelReservation,
  emptyBoardingTables,
  hotelReservationCheckedOut,
  hotelServiceType,
  reservedHotelReservation,
  TEST_APPOINTMENT_ID,
  TEST_CLINIC_ID,
  TEST_RESERVATION_ID,
  TEST_UNIT_ID,
  unitBoardingSettings,
  walkInReservation,
} from '../../../__tests__/helpers/fixtures/boarding';

describe('Boarding views — day-board, occupancy, calendar (integração)', () => {
  describe('GET /api/hub/boarding/day-board', () => {
    beforeEach(() => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_service_types: [hotelServiceType()],
          hub_appointments: [boardingAppointment()],
          hub_boarding_reservations: [],
        },
      });
    });

    it('retorna appointment_slot sem reserva vinculada', async () => {
      const res = await request(app)
        .get('/api/hub/boarding/day-board')
        .query({ clinic_id: TEST_CLINIC_ID, date: '2026-06-01' });

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      const slot = res.body.items.find((i: { appointment_id: string }) => i.appointment_id === TEST_APPOINTMENT_ID);
      expect(slot.kind).toBe('appointment_slot');
      expect(slot.boarding_stage).toBe('reserved');
    });

    it('retorna reservation quando vinculada ao agendamento', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_service_types: [hotelServiceType()],
          hub_appointments: [boardingAppointment()],
          hub_boarding_reservations: [
            checkedInHotelReservation({ hub_appointment_id: TEST_APPOINTMENT_ID }),
          ],
        },
      });

      const res = await request(app)
        .get('/api/hub/boarding/day-board')
        .query({ clinic_id: TEST_CLINIC_ID, date: '2026-06-01' });

      const item = res.body.items.find((i: { appointment_id: string }) => i.appointment_id === TEST_APPOINTMENT_ID);
      expect(item.kind).toBe('reservation');
      expect(item.boarding_stage).toBe('checked_in');
    });

    it('inclui walk-in no dia', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_service_types: [hotelServiceType()],
          hub_appointments: [],
          hub_boarding_reservations: [walkInReservation()],
        },
      });

      const res = await request(app)
        .get('/api/hub/boarding/day-board')
        .query({ clinic_id: TEST_CLINIC_ID, date: '2026-06-01' });

      expect(res.body.items.some((i: { is_walk_in: boolean }) => i.is_walk_in)).toBe(true);
    });

    it('filtra por mode=hotel', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_service_types: [hotelServiceType()],
          hub_appointments: [
            boardingAppointment(),
            boardingAppointment({
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              appointment_kind: 'daycare_block',
              starts_at: '2026-06-01T08:00:00.000Z',
              ends_at: '2026-06-01T18:00:00.000Z',
            }),
          ],
          hub_boarding_reservations: [],
        },
      });

      const res = await request(app)
        .get('/api/hub/boarding/day-board')
        .query({ clinic_id: TEST_CLINIC_ID, date: '2026-06-01', mode: 'hotel' });

      expect(res.body.items.every((i: { mode: string }) => i.mode === 'hotel')).toBe(true);
    });

    it('retorna 400 sem date ou from/to', async () => {
      const res = await request(app)
        .get('/api/hub/boarding/day-board')
        .query({ clinic_id: TEST_CLINIC_ID });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/hub/boarding/occupancy', () => {
    beforeEach(() => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_unit_boarding_settings: [unitBoardingSettings({ hotel_slots: 1, daycare_slots_per_shift: 1 })],
          hub_boarding_reservations: [
            reservedHotelReservation({
              id: '11111111-1111-4111-8111-111111111111',
              expected_check_in: '2026-06-01T00:00:00.000Z',
              expected_check_out: '2026-06-05T00:00:00.000Z',
            }),
            reservedHotelReservation({
              id: '22222222-2222-4222-8222-222222222222',
              expected_check_in: '2026-06-02T00:00:00.000Z',
              expected_check_out: '2026-06-06T00:00:00.000Z',
            }),
            reservedHotelReservation({
              id: '33333333-3333-4333-8333-333333333333',
              mode: 'daycare',
              expected_check_in: '2026-06-01T08:00:00.000Z',
              expected_check_out: '2026-06-01T18:00:00.000Z',
            }),
          ],
        },
      });
    });

    it('calcula over_capacity quando excede hotel_slots', async () => {
      const res = await request(app)
        .get('/api/hub/boarding/occupancy')
        .query({ clinic_id: TEST_CLINIC_ID, date: '2026-06-01' });

      expect(res.status).toBe(200);
      expect(res.body.hotel.current).toBe(2);
      expect(res.body.hotel.over_capacity).toBe(true);
    });

    it('não conta checked_out', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_unit_boarding_settings: [unitBoardingSettings({ hotel_slots: 5 })],
          hub_boarding_reservations: [
            hotelReservationCheckedOut({
              expected_check_in: '2026-06-01T00:00:00.000Z',
              expected_check_out: '2026-06-05T00:00:00.000Z',
            }),
          ],
        },
      });

      const res = await request(app)
        .get('/api/hub/boarding/occupancy')
        .query({ clinic_id: TEST_CLINIC_ID, date: '2026-06-01' });

      expect(res.body.hotel.current).toBe(0);
      expect(res.body.hotel.over_capacity).toBe(false);
    });

    it('over_capacity false quando max é null', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_unit_boarding_settings: [unitBoardingSettings({ hotel_slots: null })],
          hub_boarding_reservations: [
            reservedHotelReservation({
              expected_check_in: '2026-06-01T00:00:00.000Z',
              expected_check_out: '2026-06-05T00:00:00.000Z',
            }),
          ],
        },
      });

      const res = await request(app)
        .get('/api/hub/boarding/occupancy')
        .query({ clinic_id: TEST_CLINIC_ID, date: '2026-06-01' });

      expect(res.body.hotel.over_capacity).toBe(false);
    });
  });

  describe('GET /api/hub/boarding/calendar', () => {
    beforeEach(() => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [
            reservedHotelReservation({
              id: TEST_RESERVATION_ID,
              expected_check_in: '2026-06-01T14:00:00.000Z',
              expected_check_out: '2026-06-04T10:00:00.000Z',
            }),
          ],
        },
      });
    });

    it('retorna eventos no intervalo', async () => {
      const res = await request(app)
        .get('/api/hub/boarding/calendar')
        .query({ clinic_id: TEST_CLINIC_ID, from: '2026-06-01', to: '2026-06-30' });

      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(1);
      expect(res.body.events[0].id).toBe(TEST_RESERVATION_ID);
    });

    it('exclui cancelled e no_show', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [
            reservedHotelReservation({
              id: TEST_RESERVATION_ID,
              status: 'cancelled',
              expected_check_in: '2026-06-01T14:00:00.000Z',
              expected_check_out: '2026-06-04T10:00:00.000Z',
            }),
          ],
        },
      });

      const res = await request(app)
        .get('/api/hub/boarding/calendar')
        .query({ clinic_id: TEST_CLINIC_ID, from: '2026-06-01', to: '2026-06-30' });

      expect(res.body.events).toHaveLength(0);
    });

    it('filtra por mode', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [
            reservedHotelReservation({
              id: TEST_RESERVATION_ID,
              mode: 'daycare',
              expected_check_in: '2026-06-01T08:00:00.000Z',
              expected_check_out: '2026-06-01T18:00:00.000Z',
            }),
          ],
        },
      });

      const res = await request(app)
        .get('/api/hub/boarding/calendar')
        .query({ clinic_id: TEST_CLINIC_ID, from: '2026-06-01', to: '2026-06-30', mode: 'hotel' });

      expect(res.body.events).toHaveLength(0);
    });
  });
});
