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
  TEST_RESERVATION_ID,
} from '../../../__tests__/helpers/fixtures/boarding';

describe('Financeiro boarding — preview, receivable e waive', () => {
  beforeEach(() => {
    configureSupabaseMock(baseBoardingFixture());
  });

  it('GET /finance/preview retorna diárias corretas', async () => {
    const res = await request(app)
      .get('/api/hub/finance/preview')
      .query({
        clinic_id: TEST_CLINIC_ID,
        source_type: 'boarding_reservation',
        source_id: TEST_RESERVATION_ID,
      });

    expect(res.status).toBe(200);
    expect(res.body.preview.estimated_amount).toBe(450);
    expect(res.body.preview.lines[0].description).toMatch(/Hotel/);
  });

  it('POST /finance/receivables cria recebível para boarding', async () => {
    const res = await request(app)
      .post('/api/hub/finance/receivables')
      .send({
        clinic_id: TEST_CLINIC_ID,
        source_type: 'boarding_reservation',
        source_id: TEST_RESERVATION_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.receivable.source_type).toBe('boarding_reservation');
    expect(res.body.receivable.source_id).toBe(TEST_RESERVATION_ID);
  });

  it('POST /finance/waive-billing persiste waive na reserva', async () => {
    const res = await request(app)
      .post('/api/hub/finance/waive-billing')
      .send({
        clinic_id: TEST_CLINIC_ID,
        source_type: 'boarding_reservation',
        source_id: TEST_RESERVATION_ID,
        reason: 'Cortesia promocional',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const state = getMockSupabaseClient()._state.tables.hub_boarding_reservations?.[0];
    expect(state?.billing_waived_at).toBeTruthy();
    expect(state?.billing_waive_reason).toBe('Cortesia promocional');
  });

  it('preview retorna 409 para reserva não checked_out', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_boarding_reservations: [hotelReservationCheckedOut({ status: 'checked_in' })],
      },
    });

    const res = await request(app)
      .get('/api/hub/finance/preview')
      .query({
        clinic_id: TEST_CLINIC_ID,
        source_type: 'boarding_reservation',
        source_id: TEST_RESERVATION_ID,
      });

    expect(res.status).toBe(409);
  });
});
