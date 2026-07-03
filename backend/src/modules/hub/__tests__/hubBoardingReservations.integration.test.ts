jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule()
);
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  boardingAppointment,
  checkedInHotelReservation,
  emptyBoardingTables,
  hotelServiceType,
  reservedHotelReservation,
  TEST_APPOINTMENT_ID,
  TEST_CLINIC_ID,
  TEST_PET_ID,
  TEST_RESERVATION_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';

const RESERVED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Boarding reservations (integração)', () => {
  describe('POST /api/hub/boarding/reservations/open-from-appointment', () => {
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

    it('cria reserva checked_in e sincroniza agendamento in_progress', async () => {
      const res = await request(app)
        .post('/api/hub/boarding/reservations/open-from-appointment')
        .send({ clinic_id: TEST_CLINIC_ID, hub_appointment_id: TEST_APPOINTMENT_ID });

      expect(res.status).toBe(201);
      expect(res.body.created).toBe(true);
      expect(res.body.reservation.status).toBe('checked_in');
      expect(res.body.reservation.hub_appointment_id).toBe(TEST_APPOINTMENT_ID);

      const appt = getMockSupabaseClient()._state.tables.hub_appointments?.[0];
      expect(appt?.status).toBe('in_progress');
    });

    it('retorna reserva existente (idempotência)', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_appointments: [boardingAppointment()],
          hub_boarding_reservations: [
            checkedInHotelReservation({ hub_appointment_id: TEST_APPOINTMENT_ID }),
          ],
        },
      });

      const res = await request(app)
        .post('/api/hub/boarding/reservations/open-from-appointment')
        .send({ clinic_id: TEST_CLINIC_ID, hub_appointment_id: TEST_APPOINTMENT_ID });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(false);
    });

    it('retorna 404 quando agendamento não existe', async () => {
      const res = await request(app)
        .post('/api/hub/boarding/reservations/open-from-appointment')
        .send({
          clinic_id: TEST_CLINIC_ID,
          hub_appointment_id: '00000000-0000-4000-8000-000000000001',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Agendamento não encontrado/i);
    });

    it('retorna 422 quando agendamento sem pet', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_appointments: [boardingAppointment({ pet_id: null })],
          hub_boarding_reservations: [],
        },
      });

      const res = await request(app)
        .post('/api/hub/boarding/reservations/open-from-appointment')
        .send({ clinic_id: TEST_CLINIC_ID, hub_appointment_id: TEST_APPOINTMENT_ID });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/sem pet/i);
    });
  });

  describe('POST /api/hub/boarding/reservations', () => {
    beforeEach(() => {
      configureSupabaseMock({ tables: emptyBoardingTables() });
    });

    it('cria walk-in com status checked_in', async () => {
      const res = await request(app).post('/api/hub/boarding/reservations').send({
        clinic_id: TEST_CLINIC_ID,
        pet_id: TEST_PET_ID,
        unit_id: TEST_UNIT_ID,
        mode: 'hotel',
        daily_rate_cents: 15000,
      });

      expect(res.status).toBe(201);
      expect(res.body.reservation.status).toBe('checked_in');
      expect(res.body.reservation.checked_in_at).toBeTruthy();
      expect(res.body.reservation.pet_id).toBe(TEST_PET_ID);
    });

    it('retorna 400 com body inválido', async () => {
      const res = await request(app).post('/api/hub/boarding/reservations').send({
        clinic_id: TEST_CLINIC_ID,
        pet_id: 'invalid',
        mode: 'hotel',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/hub/boarding/reservations/:id', () => {
    it('reserved → checked_in preenche checked_in_at', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [
            reservedHotelReservation({ id: RESERVED_ID, hub_appointment_id: TEST_APPOINTMENT_ID }),
          ],
          hub_appointments: [boardingAppointment()],
        },
      });

      const res = await request(app)
        .patch(`/api/hub/boarding/reservations/${RESERVED_ID}`)
        .send({ clinic_id: TEST_CLINIC_ID, status: 'checked_in' });

      expect(res.status).toBe(200);
      expect(res.body.reservation.status).toBe('checked_in');
      expect(res.body.reservation.checked_in_at).toBeTruthy();
    });

    it('checked_in → checked_out sincroniza agendamento done', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [
            checkedInHotelReservation({ id: RESERVED_ID, hub_appointment_id: TEST_APPOINTMENT_ID }),
          ],
          hub_appointments: [boardingAppointment({ status: 'in_progress' })],
        },
      });

      const res = await request(app)
        .patch(`/api/hub/boarding/reservations/${RESERVED_ID}`)
        .send({ clinic_id: TEST_CLINIC_ID, status: 'checked_out' });

      expect(res.status).toBe(200);
      expect(res.body.reservation.status).toBe('checked_out');
      expect(res.body.reservation.checked_out_at).toBeTruthy();

      const appt = getMockSupabaseClient()._state.tables.hub_appointments?.[0];
      expect(appt?.status).toBe('done');
    });

    it('rejeita transição inválida com 422', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [
            reservedHotelReservation({ id: RESERVED_ID, status: 'cancelled' }),
          ],
        },
      });

      const res = await request(app)
        .patch(`/api/hub/boarding/reservations/${RESERVED_ID}`)
        .send({ clinic_id: TEST_CLINIC_ID, status: 'checked_in' });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/Transição inválida/i);
    });

    it('retorna 404 para reserva de outra clínica', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [reservedHotelReservation({ id: RESERVED_ID })],
        },
      });

      const res = await request(app)
        .patch(`/api/hub/boarding/reservations/${RESERVED_ID}`)
        .send({
          clinic_id: '00000000-0000-4000-8000-000000000099',
          status: 'checked_in',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Reserva não encontrada/i);
    });

    it('permite reversão checked_out → checked_in', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [
            {
              ...checkedInHotelReservation({ id: RESERVED_ID }),
              status: 'checked_out',
              checked_out_at: '2026-06-04T10:00:00.000Z',
            },
          ],
        },
      });

      const res = await request(app)
        .patch(`/api/hub/boarding/reservations/${RESERVED_ID}`)
        .send({ clinic_id: TEST_CLINIC_ID, status: 'checked_in' });

      expect(res.status).toBe(200);
      expect(res.body.reservation.status).toBe('checked_in');
    });
  });
});
