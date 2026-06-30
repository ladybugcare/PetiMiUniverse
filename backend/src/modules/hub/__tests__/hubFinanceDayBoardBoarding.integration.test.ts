jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  emptyBoardingTables,
  hotelReservationCheckedOut,
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
});
