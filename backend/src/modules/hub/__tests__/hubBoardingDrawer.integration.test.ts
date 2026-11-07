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
  checkedInHotelReservation,
  emptyBoardingTables,
  TEST_CLINIC_ID,
  TEST_RESERVATION_ID,
} from '../../../__tests__/helpers/fixtures/boarding';

describe('Boarding drawer e daily logs (integração)', () => {
  beforeEach(() => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [checkedInHotelReservation()],
        hub_boarding_daily_logs: [],
      },
    });
  });

  describe('GET /api/hub/boarding/reservations/:id/drawer', () => {
    it('retorna pet, guardian, nights_count e daily_logs', async () => {
      const res = await request(app)
        .get(`/api/hub/boarding/reservations/${TEST_RESERVATION_ID}/drawer`)
        .query({ clinic_id: TEST_CLINIC_ID });

      expect(res.status).toBe(200);
      expect(res.body.reservation.id).toBe(TEST_RESERVATION_ID);
      expect(res.body.pet.name).toBe('Rex');
      expect(res.body.guardian.full_name).toBe('Maria Silva');
      expect(res.body.nights_count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(res.body.daily_logs)).toBe(true);
    });

    it('retorna 404 quando reserva não existe', async () => {
      const res = await request(app)
        .get('/api/hub/boarding/reservations/00000000-0000-4000-8000-000000000001/drawer')
        .query({ clinic_id: TEST_CLINIC_ID });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Reserva não encontrada/i);
    });

    it('retorna 400 para id inválido', async () => {
      const res = await request(app)
        .get('/api/hub/boarding/reservations/not-a-uuid/drawer')
        .query({ clinic_id: TEST_CLINIC_ID });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ID de reserva inválido/i);
    });
  });

  describe('POST /api/hub/boarding/reservations/:id/daily-logs', () => {
    it('retorna 410 — escrita descontinuada em favor das tarefas', async () => {
      const res = await request(app)
        .post(`/api/hub/boarding/reservations/${TEST_RESERVATION_ID}/daily-logs`)
        .send({
          clinic_id: TEST_CLINIC_ID,
          log_date: '2026-06-02',
          mood: 'feliz',
          notes: 'Comeu bem',
        });

      expect(res.status).toBe(410);
      expect(res.body.code).toBe('BOARDING_DAILY_LOGS_GONE');
      expect(res.body.error).toMatch(/descontinuado|tarefas/i);

      const logs = getMockSupabaseClient()._state.tables.hub_boarding_daily_logs ?? [];
      expect(logs).toHaveLength(0);
    });
  });
});
