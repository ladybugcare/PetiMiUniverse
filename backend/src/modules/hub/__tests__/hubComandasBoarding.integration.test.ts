jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  baseBoardingFixture,
  emptyBoardingTables,
  hotelReservationCheckedOut,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_RESERVATION_ID,
} from '../../../__tests__/helpers/fixtures/boarding';

describe('POST /api/hub/comandas/open (boarding)', () => {
  beforeEach(() => {
    configureSupabaseMock(baseBoardingFixture());
  });

  it('abre comanda de reserva checked_out com diárias corretas', async () => {
    const res = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'boarding_reservation',
        origin_id: TEST_RESERVATION_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.comanda.origin_type).toBe('boarding_reservation');
    expect(res.body.comanda.origin_id).toBe(TEST_RESERVATION_ID);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(3);
    expect(res.body.items[0].line_total).toBe(450);
  });

  it('retorna 409 quando reserva não está checked_out', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [hotelReservationCheckedOut({ status: 'checked_in' })],
      },
    });

    const res = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'boarding_reservation',
        origin_id: TEST_RESERVATION_ID,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/não está pronta/i);
  });

  it('retorna 409 quando reserva sem tutor', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [hotelReservationCheckedOut({ guardian_id: null })],
      },
    });

    const res = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'boarding_reservation',
        origin_id: TEST_RESERVATION_ID,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/tutor/i);
  });

  it('retorna comanda existente ao abrir segunda vez (idempotência)', async () => {
    const first = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'boarding_reservation',
        origin_id: TEST_RESERVATION_ID,
      });
    expect(first.status).toBe(201);
    const comandaId = first.body.comanda.id as string;

    const second = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'boarding_reservation',
        origin_id: TEST_RESERVATION_ID,
      });

    expect(second.status).toBe(200);
    expect(second.body.comanda.id).toBe(comandaId);
  });
});

describe('POST /api/hub/comandas/:id/checkout cancel (boarding waive)', () => {
  const COMANDA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeEach(() => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [hotelReservationCheckedOut()],
        hub_comandas: [
          {
            id: COMANDA_ID,
            clinic_id: TEST_CLINIC_ID,
            guardian_id: TEST_GUARDIAN_ID,
            origin_type: 'boarding_reservation',
            origin_id: TEST_RESERVATION_ID,
            status: 'aberta',
            financial_status: 'open',
            total_amount: 450,
            subtotal_amount: 450,
            discount_amount: 0,
            deleted_at: null,
          },
        ],
        hub_comanda_items: [
          {
            id: 'item-1',
            comanda_id: COMANDA_ID,
            clinic_id: TEST_CLINIC_ID,
            line_total: 450,
            quantity: 3,
            unit_amount: 150,
            sort_order: 0,
            pet_id: null,
          },
        ],
      },
    });
  });

  it('persiste billing_waived_at na reserva ao cancelar comanda', async () => {
    const res = await request(app)
      .post(`/api/hub/comandas/${COMANDA_ID}/checkout`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        grouping: 'all',
        action: 'cancel',
        waive_reason: 'Cortesia ao cliente',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const state = getMockSupabaseClient()._state.tables.hub_boarding_reservations?.[0];
    expect(state?.billing_waived_at).toBeTruthy();
    expect(state?.billing_waive_reason).toBe('Cortesia ao cliente');
  });
});
