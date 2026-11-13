/**
 * Concorrência básica do ledger: reverse × reverse via soft-status.
 */
jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureAuthMock, resetAuthMock } from '../../../__tests__/helpers/authTestDouble';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import { hasPermission } from '../../../utils/permissions';
import { betaClinicSubscription } from '../../../__tests__/helpers/fixtures/hubSubscription';

const TEST_CLINIC_ID = '11111111-1111-4111-8111-111111111101';
const TEST_UNIT_ID = '22222222-2222-4222-8222-222222222201';
const RECEIVABLE_ID = '33333333-3333-4333-8333-333333333301';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444401';

describe('Finance ledger concurrency', () => {
  afterEach(() => resetAuthMock());

  it('dois reverse paralelos: um sucesso e um 409', async () => {
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
            final_amount: 50,
            status: 'paid',
            deleted_at: null,
          },
        ],
        hub_payments: [
          {
            id: PAYMENT_ID,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            amount: 50,
            payment_method: 'pix',
            status: 'posted',
            posting_kind: 'operational',
          },
        ],
        hub_financial_adjustments: [],
        hub_comandas: [],
        hub_cash_sessions: [],
        hub_charge_bundles: [],
        hub_charge_bundle_items: [],
        hub_customer_package_balances: [],
        hub_package_redemptions: [],
      },
    });
    configureAuthMock({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'cfinance@test.com', role: 'CFINANCE' },
      checkPermission: (_u, _c, permission) => hasPermission('CFINANCE', permission),
    });

    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`)
        .send({ clinic_id: TEST_CLINIC_ID, reason: 'Concorrente A', mode: 'payment_reversal' }),
      request(app)
        .post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`)
        .send({ clinic_id: TEST_CLINIC_ID, reason: 'Concorrente B', mode: 'payment_reversal' }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const pay = getMockSupabaseClient()._state.tables.hub_payments?.find((p) => p.id === PAYMENT_ID);
    expect(pay?.status).toBe('reversed');
    const adjustments = getMockSupabaseClient()._state.tables.hub_financial_adjustments ?? [];
    expect(adjustments.filter((x) => x.adjustment_type === 'payment_reversal')).toHaveLength(1);
  });
});
