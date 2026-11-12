/**
 * Independência Caixa × Financeiro: soft-reverse, historical cash, permissões.
 */
jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureAuthMock, resetAuthMock } from '../../../__tests__/helpers/authTestDouble';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import { hasPermission, type Role } from '../../../utils/permissions';

const TEST_CLINIC_ID = '11111111-1111-4111-8111-111111111101';
const TEST_UNIT_ID = '22222222-2222-4222-8222-222222222201';
const RECEIVABLE_ID = '33333333-3333-4333-8333-333333333301';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444401';
const PAYMENT_ID_2 = '44444444-4444-4444-8444-444444444402';
const CASH_SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const USER_ID = '11111111-1111-4111-8111-111111111111';

function clinicSettings() {
  return {
    clinic_id: TEST_CLINIC_ID,
    accepted_payment_methods: ['pix', 'cash', 'credit_card', 'debit_card', 'transfer', 'payment_link', 'customer_credit'],
  };
}

function pendingReceivable(id: string, amount: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    comanda_id: null,
    guardian_id: null,
    final_amount: amount,
    original_amount: amount,
    status: 'pending',
    due_date: '2026-06-15',
    deleted_at: null,
    ...overrides,
  };
}

function cashSession(overrides: Record<string, unknown> = {}) {
  return {
    id: CASH_SESSION_ID,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    status: 'open',
    opening_balance: 0,
    opened_at: '2026-06-15T10:00:00.000Z',
    ...overrides,
  };
}

function authAsRole(role: Role) {
  configureAuthMock({
    user: { id: USER_ID, email: `${role.toLowerCase()}@test.com`, role },
    checkPermission: (_userId, _clinicId, permission) => hasPermission(role, permission),
  });
}

describe('Financeiro × Caixa — independência e ledger', () => {
  afterEach(() => {
    resetAuthMock();
  });

  it('PIX sem sessão de caixa funciona', async () => {
    configureSupabaseMock({
      tables: {
        hub_clinic_settings: [clinicSettings()],
        hub_receivables: [pendingReceivable(RECEIVABLE_ID, 100)],
        hub_payments: [],
        hub_cash_sessions: [],
        hub_financial_adjustments: [],
        hub_comandas: [],
        hub_charge_bundles: [],
        hub_charge_bundle_items: [],
      },
    });
    authAsRole('CFINANCE');

    const res = await request(app)
      .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
      .send({ clinic_id: TEST_CLINIC_ID, amount: 40, payment_method: 'pix' });
    expect(res.status).toBe(201);
    expect(res.body.receivable_status).toBe('partially_paid');
    const pay = getMockSupabaseClient()._state.tables.hub_payments?.[0];
    expect(pay?.cash_session_id ?? null).toBeNull();
    expect(pay?.status).toBe('posted');
  });

  it('cash sem sessão retorna 409', async () => {
    configureSupabaseMock({
      tables: {
        hub_clinic_settings: [clinicSettings()],
        hub_receivables: [pendingReceivable(RECEIVABLE_ID, 100)],
        hub_payments: [],
        hub_cash_sessions: [],
      },
    });
    authAsRole('CFINANCE');

    const res = await request(app)
      .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
      .send({ clinic_id: TEST_CLINIC_ID, amount: 10, payment_method: 'cash' });
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toMatch(/abra o caixa/i);
  });

  it('anulação vs reembolso efetivo gravam adjustment_type distintos', async () => {
    configureSupabaseMock({
      tables: {
        hub_clinic_settings: [clinicSettings()],
        hub_receivables: [pendingReceivable(RECEIVABLE_ID, 100, { status: 'paid' })],
        hub_payments: [
          {
            id: PAYMENT_ID,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            amount: 100,
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
      },
    });
    authAsRole('CFINANCE');

    const res = await request(app)
      .post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        reason: 'Cliente devolveu via Pix',
        mode: 'refund',
        refund_method: 'pix',
        refund_effective_date: '2026-06-16',
      });
    expect(res.status).toBe(200);
    expect(res.body.reversal_mode).toBe('refund');
    const adj = getMockSupabaseClient()._state.tables.hub_financial_adjustments?.[0];
    expect(adj?.adjustment_type).toBe('refund');
    expect(adj?.refund_method).toBe('pix');
    const pay = getMockSupabaseClient()._state.tables.hub_payments?.find((p) => p.id === PAYMENT_ID);
    expect(pay?.status).toBe('reversed');
  });

  it('estorno duplicado retorna 409', async () => {
    configureSupabaseMock({
      tables: {
        hub_clinic_settings: [clinicSettings()],
        hub_receivables: [pendingReceivable(RECEIVABLE_ID, 50, { status: 'paid' })],
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
      },
    });
    authAsRole('CFINANCE');

    const first = await request(app)
      .post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`)
      .send({ clinic_id: TEST_CLINIC_ID, reason: 'Primeiro estorno', mode: 'payment_reversal' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`)
      .send({ clinic_id: TEST_CLINIC_ID, reason: 'Segundo estorno', mode: 'payment_reversal' });
    expect(second.status).toBe(409);
  });

  it('correção histórica em dinheiro sem sessão', async () => {
    configureSupabaseMock({
      tables: {
        hub_clinic_settings: [clinicSettings()],
        hub_receivables: [pendingReceivable(RECEIVABLE_ID, 80)],
        hub_payments: [],
        hub_cash_sessions: [cashSession()],
        hub_financial_adjustments: [],
        hub_comandas: [],
        hub_charge_bundles: [],
        hub_charge_bundle_items: [],
      },
    });
    authAsRole('CFINANCE');

    const res = await request(app)
      .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments/historical-cash`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        amount: 80,
        effective_payment_date: '2026-05-01',
        reason: 'Recebimento em dinheiro não lançado no dia',
        idempotency_key: '55555555-5555-4555-8555-555555555501',
      });
    expect(res.status).toBe(201);
    expect(res.body.receivable_status).toBe('paid');
    const pay = getMockSupabaseClient()._state.tables.hub_payments?.[0];
    expect(pay?.posting_kind).toBe('historical_correction');
    expect(pay?.cash_session_id ?? null).toBeNull();
    expect(pay?.correction_reason).toMatch(/não lançado/i);
  });

  it('CASSISTANT não acessa historical nem reverse; CFINANCE não abre caixa', async () => {
    expect(hasPermission('CASSISTANT', 'hub.payments.reverse')).toBe(false);
    expect(hasPermission('CASSISTANT', 'hub.financial.adjust')).toBe(false);
    expect(hasPermission('CASSISTANT', 'hub.cash.session')).toBe(true);
    expect(hasPermission('CFINANCE', 'hub.cash.session')).toBe(false);
  });

  it('estorno parcial mantém outro pagamento posted', async () => {
    configureSupabaseMock({
      tables: {
        hub_clinic_settings: [clinicSettings()],
        hub_receivables: [pendingReceivable(RECEIVABLE_ID, 100, { status: 'paid' })],
        hub_payments: [
          {
            id: PAYMENT_ID,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            amount: 40,
            payment_method: 'pix',
            status: 'posted',
            posting_kind: 'operational',
          },
          {
            id: PAYMENT_ID_2,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            amount: 60,
            payment_method: 'cash',
            cash_session_id: CASH_SESSION_ID,
            status: 'posted',
            posting_kind: 'operational',
          },
        ],
        hub_cash_sessions: [cashSession({ status: 'closed', expected_balance: 60, closing_balance: 60, difference_amount: 0 })],
        hub_financial_adjustments: [],
        hub_cash_session_post_close_adjustments: [],
        hub_comandas: [],
        hub_charge_bundles: [],
        hub_charge_bundle_items: [],
      },
    });
    authAsRole('CFINANCE');

    const res = await request(app)
      .post(`/api/hub/finance/payments/${PAYMENT_ID_2}/reverse`)
      .send({ clinic_id: TEST_CLINIC_ID, reason: 'Dinheiro lançado a mais', mode: 'payment_reversal' });
    expect(res.status).toBe(200);
    expect(res.body.receivable_status).toBe('partially_paid');
    expect(res.body.warning).toMatch(/fechado/i);

    const pays = getMockSupabaseClient()._state.tables.hub_payments ?? [];
    expect(pays.find((p) => p.id === PAYMENT_ID)?.status).toBe('posted');
    expect(pays.find((p) => p.id === PAYMENT_ID_2)?.status).toBe('reversed');

    const session = getMockSupabaseClient()._state.tables.hub_cash_sessions?.[0];
    expect(Number(session?.expected_balance)).toBe(60);

    const postClose = getMockSupabaseClient()._state.tables.hub_cash_session_post_close_adjustments ?? [];
    expect(postClose.length).toBeGreaterThanOrEqual(1);
  });
});
