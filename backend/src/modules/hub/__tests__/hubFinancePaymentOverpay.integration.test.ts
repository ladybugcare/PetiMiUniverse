/**
 * Anti-overpay: segundo pagamento com chave distinta não pode ultrapassar final_amount.
 * Em NODE_ENV=test o insert usa fallback TS (mocks sem RPC). Em preprod/prod só hub_post_payment.
 */
jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule(),
);

import request from 'supertest';
import app from '../../../app';
import { configureAuthMock, resetAuthMock } from '../../../__tests__/helpers/authTestDouble';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import { hasPermission } from '../../../utils/permissions';
import { betaClinicSubscription } from '../../../__tests__/helpers/fixtures/hubSubscription';

const TEST_CLINIC_ID = '11111111-1111-4111-8111-111111111102';
const TEST_UNIT_ID = '22222222-2222-4222-8222-222222222202';
const RECEIVABLE_ID = '33333333-3333-4333-8333-333333333302';
const CASH_SESSION_ID = '55555555-5555-4555-8555-555555555502';
const KEY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const KEY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';

describe('Finance payment overpay guard', () => {
  afterEach(() => resetAuthMock());

  beforeEach(() => {
    configureAuthMock({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'cfinance@test.com', role: 'CFINANCE' },
      checkPermission: (_u, _c, permission) => hasPermission('CFINANCE', permission),
    });
    configureSupabaseMock({
      tables: {
        clinic_hub_subscriptions: [betaClinicSubscription(TEST_CLINIC_ID)],
        hub_clinic_settings: [
          {
            clinic_id: TEST_CLINIC_ID,
            accepted_payment_methods: ['pix', 'cash'],
          },
        ],
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            comanda_id: null,
            guardian_id: null,
            final_amount: 100,
            status: 'pending',
            deleted_at: null,
          },
        ],
        hub_payments: [],
        hub_financial_adjustments: [],
        hub_comandas: [],
        hub_cash_sessions: [
          {
            id: CASH_SESSION_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            status: 'open',
            opening_balance: 0,
            opened_at: '2026-06-15T10:00:00.000Z',
            deleted_at: null,
          },
        ],
        hub_charge_bundles: [],
        hub_charge_bundle_items: [],
        hub_customer_package_balances: [],
        hub_package_redemptions: [],
        hub_appointments: [],
      },
    });
  });

  it('segundo pagamento com outra idempotency_key excede saldo → 400', async () => {
    const first = await request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`).send({
      clinic_id: TEST_CLINIC_ID,
      amount: 100,
      payment_method: 'pix',
      idempotency_key: KEY_A,
    });
    expect(first.status).toBe(201);

    const second = await request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`).send({
      clinic_id: TEST_CLINIC_ID,
      amount: 100,
      payment_method: 'pix',
      idempotency_key: KEY_B,
    });
    expect(second.status).toBe(400);
    expect(String(second.body.error)).toMatch(/excede o saldo/i);

    const payments = (getMockSupabaseClient()._state.tables.hub_payments ?? []).filter(
      (p) => p.status === 'posted',
    );
    expect(payments).toHaveLength(1);
  });

  it('replay da mesma idempotency_key → 200 sem novo lançamento', async () => {
    const first = await request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`).send({
      clinic_id: TEST_CLINIC_ID,
      amount: 40,
      payment_method: 'pix',
      idempotency_key: KEY_A,
    });
    expect(first.status).toBe(201);

    const replay = await request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`).send({
      clinic_id: TEST_CLINIC_ID,
      amount: 40,
      payment_method: 'pix',
      idempotency_key: KEY_A,
    });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);

    const payments = (getMockSupabaseClient()._state.tables.hub_payments ?? []).filter(
      (p) => p.status === 'posted',
    );
    expect(payments).toHaveLength(1);
  });
});
