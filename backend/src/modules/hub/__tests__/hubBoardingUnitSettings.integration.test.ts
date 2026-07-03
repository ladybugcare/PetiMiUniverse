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
  emptyBoardingTables,
  TEST_CLINIC_ID,
  TEST_UNIT_ID,
  unitBoardingSettings,
} from '../../../__tests__/helpers/fixtures/boarding';

describe('Boarding unit-settings (integração)', () => {
  beforeEach(() => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_unit_boarding_settings: [unitBoardingSettings()],
      },
    });
  });

  describe('GET /api/hub/boarding/unit-settings', () => {
    it('lista configurações da clínica', async () => {
      const res = await request(app)
        .get('/api/hub/boarding/unit-settings')
        .query({ clinic_id: TEST_CLINIC_ID });

      expect(res.status).toBe(200);
      expect(res.body.settings).toHaveLength(1);
      expect(res.body.settings[0].hotel_slots).toBe(10);
    });

    it('filtra por unit_id', async () => {
      const res = await request(app)
        .get('/api/hub/boarding/unit-settings')
        .query({ clinic_id: TEST_CLINIC_ID, unit_id: TEST_UNIT_ID });

      expect(res.status).toBe(200);
      expect(res.body.settings[0].unit_id).toBe(TEST_UNIT_ID);
    });
  });

  describe('PATCH /api/hub/boarding/unit-settings', () => {
    it('atualiza slots existentes', async () => {
      const res = await request(app)
        .patch('/api/hub/boarding/unit-settings')
        .send({
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          hotel_slots: 20,
          daycare_slots_per_shift: 25,
        });

      expect(res.status).toBe(200);
      expect(res.body.settings.hotel_slots).toBe(20);
      expect(res.body.settings.daycare_slots_per_shift).toBe(25);
    });

    it('cria configuração nova via upsert', async () => {
      configureSupabaseMock({
        tables: { ...emptyBoardingTables(), hub_unit_boarding_settings: [] },
      });

      const res = await request(app)
        .patch('/api/hub/boarding/unit-settings')
        .send({
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          hotel_slots: null,
          daycare_slots_per_shift: 8,
        });

      expect(res.status).toBe(200);
      expect(res.body.settings.hotel_slots).toBeNull();
      expect(res.body.settings.daycare_slots_per_shift).toBe(8);

      const rows = getMockSupabaseClient()._state.tables.hub_unit_boarding_settings ?? [];
      expect(rows).toHaveLength(1);
    });
  });
});
