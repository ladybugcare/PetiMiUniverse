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
  hotelServiceType,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_HOTEL_SERVICE_TYPE_ID,
  TEST_PET_ID,
  TEST_RESERVATION_ID,
} from '../../../__tests__/helpers/fixtures/boarding';

const TEST_HOTEL_PACKAGE_ID = '66666666-6666-4666-8666-666666666670';
const TEST_HOTEL_BALANCE_ID = '66666666-6666-4666-8666-666666666671';

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

  it('aplica pacote na linha de hospedagem (zera valor)', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_service_types: [hotelServiceType()],
        hub_boarding_reservations: [
          hotelReservationCheckedOut({ hub_service_type_id: TEST_HOTEL_SERVICE_TYPE_ID }),
        ],
        hub_packages: [
          {
            id: TEST_HOTEL_PACKAGE_ID,
            clinic_id: TEST_CLINIC_ID,
            name: 'Pacote Hotel 5 diárias',
            active: true,
            sessions_total: 5,
          },
        ],
        hub_customer_package_balances: [
          {
            id: TEST_HOTEL_BALANCE_ID,
            clinic_id: TEST_CLINIC_ID,
            guardian_id: TEST_GUARDIAN_ID,
            pet_id: TEST_PET_ID,
            package_id: TEST_HOTEL_PACKAGE_ID,
            hub_service_type_id: TEST_HOTEL_SERVICE_TYPE_ID,
            sessions_remaining: 3,
            sessions_total: 5,
            expires_at: null,
            purchased_at: '2026-01-01T00:00:00.000Z',
            pricing_variant: null,
            hub_packages: [{ id: TEST_HOTEL_PACKAGE_ID, name: 'Pacote Hotel 5 diárias' }],
          },
        ],
      },
    });

    const opened = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'boarding_reservation',
        origin_id: TEST_RESERVATION_ID,
      });
    expect(opened.status).toBe(201);
    const comandaId = opened.body.comanda.id as string;
    const itemId = opened.body.items[0].id as string;
    expect(opened.body.items[0].line_total).toBeGreaterThan(0);

    const applied = await request(app)
      .post(`/api/hub/comandas/${comandaId}/apply-package`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        item_id: itemId,
        package_balance_id: TEST_HOTEL_BALANCE_ID,
        edit_context: 'caixa',
      });

    expect(applied.status).toBe(200);
    const line = (applied.body.detail.items as Array<Record<string, unknown>>).find((it) => it.id === itemId);
    expect(line?.line_total).toBe(0);
    expect(line?.package_balance_id).toBe(TEST_HOTEL_BALANCE_ID);
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
