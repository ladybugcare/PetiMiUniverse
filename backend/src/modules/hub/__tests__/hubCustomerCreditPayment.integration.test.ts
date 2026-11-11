jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  emptyBoardingTables,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';
import { HUB_PAYMENT_METHODS } from '../hubPaymentMethods';

const TEST_RECEIVABLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function baseCreditTables(extra: Record<string, unknown[]> = {}) {
  return {
    ...emptyBoardingTables(),
    hub_clinic_settings: [
      {
        clinic_id: TEST_CLINIC_ID,
        pet_puppy_max_months: 12,
        message_templates: null,
        accepted_payment_methods: [...HUB_PAYMENT_METHODS],
      },
    ],
    hub_customer_credit_movements: [
      {
        id: 'credit-in-1',
        clinic_id: TEST_CLINIC_ID,
        guardian_id: TEST_GUARDIAN_ID,
        direction: 'in',
        amount: 100,
        reason: 'Adiantamento',
        comanda_id: null,
        receivable_id: null,
        payment_method: 'pix',
        cash_session_id: null,
        notes: null,
        created_by_user_id: null,
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ],
    hub_receivables: [
      {
        id: TEST_RECEIVABLE_ID,
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        guardian_id: TEST_GUARDIAN_ID,
        comanda_id: null,
        due_date: null,
        status: 'pending',
        final_amount: 40,
        original_amount: 40,
        source_type: 'manual',
        source_id: 'manual-credit-pay',
        deleted_at: null,
      },
    ],
    hub_payments: [] as Record<string, unknown>[],
    hub_financial_adjustments: [] as Record<string, unknown>[],
    hub_cash_sessions: [] as Record<string, unknown>[],
    ...extra,
  };
}

describe('Pagamento com customer_credit debita saldo do tutor', () => {
  beforeEach(() => {
    configureSupabaseMock({ tables: baseCreditTables() });
  });

  it('POST /finance/receivables/:id/payments com customer_credit cria movimento out', async () => {
    const res = await request(app)
      .post(`/api/hub/finance/receivables/${TEST_RECEIVABLE_ID}/payments`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        amount: 40,
        payment_method: 'customer_credit',
      });

    expect(res.status).toBe(201);
    expect(res.body.receivable_status).toBe('paid');

    const movements = getMockSupabaseClient()._state.tables.hub_customer_credit_movements ?? [];
    const outs = movements.filter((m) => m.direction === 'out');
    expect(outs).toHaveLength(1);
    expect(Number(outs[0].amount)).toBe(40);
    expect(outs[0].receivable_id).toBe(TEST_RECEIVABLE_ID);
    expect(outs[0].payment_method).toBe('customer_credit');
  });

  it('recusa pagamento com crédito quando saldo é insuficiente', async () => {
    configureSupabaseMock({
      tables: baseCreditTables({
        hub_customer_credit_movements: [],
      }),
    });

    const res = await request(app)
      .post(`/api/hub/finance/receivables/${TEST_RECEIVABLE_ID}/payments`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        amount: 40,
        payment_method: 'customer_credit',
      });

    expect(res.status).toBe(409);
    expect(String(res.body.error)).toMatch(/insuficiente/i);

    const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
    expect(payments).toHaveLength(0);
  });

  it('estorno de pagamento com crédito devolve o saldo (movimento in)', async () => {
    const payRes = await request(app)
      .post(`/api/hub/finance/receivables/${TEST_RECEIVABLE_ID}/payments`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        amount: 40,
        payment_method: 'customer_credit',
      });
    expect(payRes.status).toBe(201);
    const paymentId = payRes.body.payment.id as string;

    const reverseRes = await request(app)
      .post(`/api/hub/finance/payments/${paymentId}/reverse`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        reason: 'Estorno de teste',
      });
    expect(reverseRes.status).toBe(200);

    const movements = getMockSupabaseClient()._state.tables.hub_customer_credit_movements ?? [];
    const outs = movements.filter((m) => m.direction === 'out');
    const restorations = movements.filter(
      (m) => m.direction === 'in' && String(m.notes ?? '').includes('Estorno'),
    );
    expect(outs).toHaveLength(1);
    expect(restorations).toHaveLength(1);
    expect(Number(restorations[0].amount)).toBe(40);
  });
});
