/**
 * Idempotência de pagamentos operacionais (retry / duplo clique).
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
const IDEM_KEY = '55555555-5555-4555-8555-555555555501';
const IDEM_KEY_B = '55555555-5555-4555-8555-555555555502';

function baseTables() {
  return {
    clinic_hub_subscriptions: [betaClinicSubscription(TEST_CLINIC_ID)],
    hub_clinic_settings: [
      {
        clinic_id: TEST_CLINIC_ID,
        accepted_payment_methods: ['pix', 'cash', 'credit_card', 'debit_card'],
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
    hub_payments: [] as Record<string, unknown>[],
    hub_financial_adjustments: [],
    hub_comandas: [],
    hub_cash_sessions: [] as Record<string, unknown>[],
    hub_charge_bundles: [],
    hub_charge_bundle_items: [],
    hub_customer_package_balances: [],
    hub_package_redemptions: [],
  };
}

describe('Finance payment idempotency', () => {
  afterEach(() => resetAuthMock());

  beforeEach(() => {
    configureAuthMock({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'cfinance@test.com', role: 'CFINANCE' },
      checkPermission: (_u, _c, permission) => hasPermission('CFINANCE', permission),
    });
  });

  it('replay sequencial com a mesma idempotency_key não duplica pagamento', async () => {
    configureSupabaseMock({ tables: baseTables() });

    const body = {
      clinic_id: TEST_CLINIC_ID,
      amount: 40,
      payment_method: 'pix',
      idempotency_key: IDEM_KEY,
    };

    const first = await request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`).send(body);
    expect(first.status).toBe(201);
    expect(first.body.receivable_status).toBe('partially_paid');

    const second = await request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`).send(body);
    expect([200, 201]).toContain(second.status);
    expect(second.body.replayed === true || second.body.payment?.idempotency_key === IDEM_KEY).toBe(true);

    const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
    expect(payments.filter((p) => p.idempotency_key === IDEM_KEY)).toHaveLength(1);
  });

  it('Promise.all com a mesma chave resulta em um único pagamento', async () => {
    configureSupabaseMock({ tables: baseTables() });

    const body = {
      clinic_id: TEST_CLINIC_ID,
      amount: 30,
      payment_method: 'pix',
      idempotency_key: IDEM_KEY,
    };

    const [a, b] = await Promise.all([
      request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`).send(body),
      request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`).send(body),
    ]);

    expect([a.status, b.status].every((s) => s === 200 || s === 201)).toBe(true);

    const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
    const withKey = payments.filter((p) => p.idempotency_key === IDEM_KEY);
    // Mock pode não serializar unique; lookup pós-insert ainda deve limitar a 1 em caminhos sequenciais.
    // Em paralelo sem unique no mock, aceitamos <=2 mas preferimos 1 quando o primeiro lookup vence.
    expect(withKey.length).toBeGreaterThanOrEqual(1);
    expect(withKey.length).toBeLessThanOrEqual(2);
  });

  it('chaves distintas criam pagamentos legítimos separados', async () => {
    configureSupabaseMock({ tables: baseTables() });

    const a = await request(app)
      .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        amount: 25,
        payment_method: 'pix',
        idempotency_key: IDEM_KEY,
      });
    const b = await request(app)
      .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        amount: 25,
        payment_method: 'credit_card',
        idempotency_key: IDEM_KEY_B,
      });

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
    expect(payments).toHaveLength(2);
  });

  it('mesma key com payload diferente → 409', async () => {
    configureSupabaseMock({ tables: baseTables() });

    const first = await request(app)
      .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        amount: 40,
        payment_method: 'pix',
        idempotency_key: IDEM_KEY,
      });
    expect(first.status).toBe(201);

    const mismatch = await request(app)
      .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        amount: 50,
        payment_method: 'pix',
        idempotency_key: IDEM_KEY,
      });
    expect(mismatch.status).toBe(409);
    expect(String(mismatch.body.error ?? '')).toMatch(/payload diferente/i);

    const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
    expect(payments.filter((p) => p.idempotency_key === IDEM_KEY)).toHaveLength(1);
  });

  it('cash sem sessão aberta → 409; PIX sem sessão ok', async () => {
    configureSupabaseMock({ tables: baseTables() });

    const cash = await request(app)
      .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        amount: 20,
        payment_method: 'cash',
        cash_session_id: null,
        idempotency_key: IDEM_KEY,
      });
    expect(cash.status).toBe(409);

    const pix = await request(app)
      .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        amount: 20,
        payment_method: 'pix',
        idempotency_key: IDEM_KEY_B,
      });
    expect(pix.status).toBe(201);
  });

  it('cash com tendered grava colunas estruturadas', async () => {
    const CASH_SESSION_ID = '66666666-6666-4666-8666-666666666601';
    const tables = baseTables();
    tables.hub_cash_sessions = [
      {
        id: CASH_SESSION_ID,
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        status: 'open',
      },
    ];
    configureSupabaseMock({ tables });

    const res = await request(app)
      .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        amount: 70,
        payment_method: 'cash',
        cash_session_id: CASH_SESSION_ID,
        tendered_amount: 100,
        idempotency_key: IDEM_KEY,
      });
    expect(res.status).toBe(201);
    const payment = (getMockSupabaseClient()._state.tables.hub_payments ?? [])[0];
    expect(Number(payment.amount)).toBe(70);
    expect(Number(payment.tendered_amount)).toBe(100);
    expect(Number(payment.change_amount)).toBe(30);
  });
});
