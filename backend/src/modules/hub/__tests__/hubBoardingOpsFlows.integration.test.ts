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
  hotelServiceType,
  pendingFeedingTask,
  reservedHotelReservation,
  TEST_CLINIC_ID,
  TEST_PET_ID,
  TEST_PET_ID_2,
  TEST_RESERVATION_ID,
  TEST_TASK_ID,
  TEST_UNIT_ID,
  unitBoardingSettings,
  walkInReservation,
} from '../../../__tests__/helpers/fixtures/boarding';

const RESERVED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OCCUPYING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Boarding ops flows (integração)', () => {
  describe('GET /api/hub/boarding/ops-board', () => {
    it('lista estadia multi-dia no meio do período e marca atenção por plano pendente', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_service_types: [hotelServiceType()],
          hub_unit_boarding_settings: [unitBoardingSettings()],
          hub_boarding_reservations: [
            walkInReservation({
              expected_check_in: '2026-06-01T14:00:00.000Z',
              expected_check_out: '2026-06-04T10:00:00.000Z',
              checked_in_at: '2026-06-01T14:00:00.000Z',
            }),
          ],
        },
      });

      const res = await request(app)
        .get('/api/hub/boarding/ops-board')
        .query({ clinic_id: TEST_CLINIC_ID, date: '2026-06-02' });

      expect(res.status).toBe(200);
      const stay = res.body.stays?.find(
        (s: { reservation_id: string }) => s.reservation_id === TEST_RESERVATION_ID,
      );
      expect(stay).toBeTruthy();
      expect(stay.stage).toBe('checked_in');
      expect(stay.attention.some((a: { key: string }) => a.key === 'plan_pending')).toBe(true);
      expect(res.body.counts?.attention).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PUT /api/hub/boarding/reservations/:id/care-plan', () => {
    it('confirma plano e gera hub_boarding_tasks', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_unit_boarding_settings: [unitBoardingSettings()],
          hub_boarding_reservations: [checkedInHotelReservation()],
        },
      });

      const res = await request(app)
        .put(`/api/hub/boarding/reservations/${TEST_RESERVATION_ID}/care-plan`)
        .send({
          clinic_id: TEST_CLINIC_ID,
          feeding: {
            food_source: 'own',
            food_name: 'Ração Premium',
            meals: [{ time: '08:00', amount: '1 xícara', notes: null }],
          },
          medications: [],
          handling: { sociability: 'sociable', group_play_allowed: true },
          confirm_blocks: ['feeding', 'medications', 'handling'],
        });

      expect(res.status).toBe(200);
      expect(res.body.tasks_sync?.inserted).toBeGreaterThan(0);
      expect(res.body.plan_pendencies).toEqual([]);

      const tasks = getMockSupabaseClient()._state.tables.hub_boarding_tasks ?? [];
      expect(tasks.some((t) => t.kind === 'feeding' && t.hub_boarding_reservation_id === TEST_RESERVATION_ID)).toBe(
        true,
      );
    });
  });

  describe('POST /api/hub/boarding/tasks/:id/execute', () => {
    it('persiste outcome e cria execution', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [checkedInHotelReservation()],
          hub_boarding_tasks: [pendingFeedingTask()],
        },
      });

      const res = await request(app)
        .post(`/api/hub/boarding/tasks/${TEST_TASK_ID}/execute`)
        .send({ clinic_id: TEST_CLINIC_ID, outcome: 'ate_all', notes: 'Comeu tudo' });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe('done');
      expect(res.body.task.outcome).toBe('ate_all');

      const execs = getMockSupabaseClient()._state.tables.hub_boarding_task_executions ?? [];
      expect(execs).toHaveLength(1);
      expect(execs[0].hub_boarding_task_id).toBe(TEST_TASK_ID);
      expect(execs[0].outcome).toBe('ate_all');
    });
  });

  describe('POST /api/hub/boarding/tasks/batch-activity', () => {
    it('registra recreação em lote', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [checkedInHotelReservation()],
          hub_boarding_care_plans: [
            {
              id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              clinic_id: TEST_CLINIC_ID,
              hub_boarding_reservation_id: TEST_RESERVATION_ID,
              pet_id: TEST_PET_ID,
              handling: { sociability: 'sociable', group_play_allowed: true },
              block_status: { handling: 'confirmed' },
            },
          ],
        },
      });

      const res = await request(app)
        .post('/api/hub/boarding/tasks/batch-activity')
        .send({
          clinic_id: TEST_CLINIC_ID,
          reservation_ids: [TEST_RESERVATION_ID],
          kind: 'recreation',
          outcome: 'done',
          executed_at: '2026-06-02T15:00:00.000Z',
        });

      expect(res.status).toBe(200);
      expect(res.body.done).toHaveLength(1);
      expect(res.body.done[0].reservation_id).toBe(TEST_RESERVATION_ID);
      expect(res.body.batch_id).toBeTruthy();
    });

    it('rejeita alimentação em lote', async () => {
      configureSupabaseMock({ tables: emptyBoardingTables() });

      const res = await request(app)
        .post('/api/hub/boarding/tasks/batch-activity')
        .send({
          clinic_id: TEST_CLINIC_ID,
          reservation_ids: [TEST_RESERVATION_ID],
          kind: 'feeding',
          outcome: 'ate_all',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('capacidade no check-in', () => {
    it('warn exige force_capacity; block impede mesmo com force', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_unit_boarding_settings: [
            unitBoardingSettings({ hotel_slots: 1, overbooking_policy: 'warn' }),
          ],
          hub_boarding_reservations: [
            checkedInHotelReservation({ id: OCCUPYING_ID, pet_id: TEST_PET_ID }),
            reservedHotelReservation({ id: RESERVED_ID, pet_id: TEST_PET_ID_2 }),
          ],
        },
      });

      const warn = await request(app)
        .patch(`/api/hub/boarding/reservations/${RESERVED_ID}`)
        .send({ clinic_id: TEST_CLINIC_ID, status: 'checked_in' });

      expect(warn.status).toBe(409);
      expect(warn.body.code).toBe('CAPACITY_WARNING');

      const forced = await request(app)
        .patch(`/api/hub/boarding/reservations/${RESERVED_ID}`)
        .send({ clinic_id: TEST_CLINIC_ID, status: 'checked_in', force_capacity: true });

      expect(forced.status).toBe(200);
      expect(forced.body.reservation.status).toBe('checked_in');

      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_unit_boarding_settings: [
            unitBoardingSettings({ hotel_slots: 1, overbooking_policy: 'block' }),
          ],
          hub_boarding_reservations: [
            checkedInHotelReservation({ id: OCCUPYING_ID, pet_id: TEST_PET_ID }),
            reservedHotelReservation({ id: RESERVED_ID, pet_id: TEST_PET_ID_2 }),
          ],
        },
      });

      const blocked = await request(app)
        .patch(`/api/hub/boarding/reservations/${RESERVED_ID}`)
        .send({ clinic_id: TEST_CLINIC_ID, status: 'checked_in', force_capacity: true });

      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('CAPACITY_BLOCKED');
    });
  });

  describe('passagem de turno', () => {
    it('cria handoff e registra ciência', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_service_types: [hotelServiceType()],
          hub_unit_boarding_settings: [unitBoardingSettings()],
          hub_boarding_reservations: [checkedInHotelReservation()],
        },
      });

      const created = await request(app).post('/api/hub/boarding/handoffs').send({
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        shift_label: 'Manhã',
        notes: 'Rex comeu bem',
      });

      expect(created.status).toBe(201);
      expect(created.body.handoff.shift_label).toBe('Manhã');
      expect(created.body.handoff.snapshot).toBeTruthy();
      const handoffId = created.body.handoff.id as string;

      const ack = await request(app)
        .post(`/api/hub/boarding/handoffs/${handoffId}/acknowledge`)
        .send({ clinic_id: TEST_CLINIC_ID });

      expect(ack.status).toBe(200);
      expect(ack.body.handoff.acknowledged_at).toBeTruthy();
    });
  });
});
