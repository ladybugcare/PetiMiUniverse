jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  baseBoardingFixture,
  emptyBoardingTables,
  hotelReservationCheckedOut,
  TEST_CLINIC_ID,
  TEST_RESERVATION_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';

describe('GET /api/hub/finance/unbilled-completed (boarding)', () => {
  beforeEach(() => {
    configureSupabaseMock(baseBoardingFixture());
  });

  it('lista reserva checked_out com valor de diárias correto', async () => {
    const res = await request(app)
      .get('/api/hub/finance/unbilled-completed')
      .query({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    const item = res.body.items[0];
    expect(item.source_type).toBe('boarding_reservation');
    expect(item.source_id).toBe(TEST_RESERVATION_ID);
    expect(item.estimated_amount).toBe(450);
  });

  it('exclui reserva com billing_waived_at', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [
          hotelReservationCheckedOut({ billing_waived_at: '2026-06-05T00:00:00.000Z' }),
        ],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/unbilled-completed')
      .query({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('exclui reserva com comanda aberta', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [hotelReservationCheckedOut()],
        hub_comandas: [
          {
            id: 'comanda-open-1',
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'boarding_reservation',
            origin_id: TEST_RESERVATION_ID,
            status: 'aberta',
            deleted_at: null,
          },
        ],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/unbilled-completed')
      .query({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('exclui reserva com recebível ativo por source_type', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [hotelReservationCheckedOut()],
        hub_receivables: [
          {
            id: 'rec-1',
            clinic_id: TEST_CLINIC_ID,
            source_type: 'boarding_reservation',
            source_id: TEST_RESERVATION_ID,
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
    expect(res.body.count).toBe(0);
  });

  it('exclui reserva com recebível manual via comanda_id', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [hotelReservationCheckedOut()],
        hub_comandas: [
          {
            id: 'comanda-closed-1',
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'boarding_reservation',
            origin_id: TEST_RESERVATION_ID,
            status: 'fechada',
            deleted_at: null,
          },
        ],
        hub_receivables: [
          {
            id: 'rec-manual-1',
            clinic_id: TEST_CLINIC_ID,
            source_type: 'manual',
            source_id: 'manual-src-1',
            comanda_id: 'comanda-closed-1',
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
    expect(res.body.count).toBe(0);
  });
});
