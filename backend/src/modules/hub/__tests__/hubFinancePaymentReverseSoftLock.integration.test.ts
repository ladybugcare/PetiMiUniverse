/**
 * Estorno: exceção de produto (full / soft_lock / read_history com RBAC).
 * Isolamento multi-tenant e negação sem permissão.
 */
jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  configureAuthMock,
  resetAuthMock,
} from '../../../__tests__/helpers/authTestDouble';
import {
  emptyBoardingTables,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';
import { HUB_PAYMENT_METHODS } from '../hubPaymentMethods';

const OTHER_CLINIC_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TEST_RECEIVABLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TEST_PAYMENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function seedPaymentTables(clinicId: string = TEST_CLINIC_ID) {
  configureSupabaseMock({
    tables: {
      ...emptyBoardingTables(),
      hub_clinic_settings: [
        {
          clinic_id: clinicId,
          pet_puppy_max_months: 12,
          message_templates: null,
          accepted_payment_methods: [...HUB_PAYMENT_METHODS],
        },
      ],
      hub_receivables: [
        {
          id: TEST_RECEIVABLE_ID,
          clinic_id: clinicId,
          unit_id: TEST_UNIT_ID,
          guardian_id: TEST_GUARDIAN_ID,
          comanda_id: null,
          due_date: null,
          status: 'paid',
          final_amount: 50,
          original_amount: 50,
          source_type: 'manual',
          source_id: null,
          deleted_at: null,
        },
      ],
      hub_payments: [
        {
          id: TEST_PAYMENT_ID,
          clinic_id: clinicId,
          receivable_id: TEST_RECEIVABLE_ID,
          amount: 50,
          payment_method: 'pix',
          cash_session_id: null,
          status: 'posted',
          posting_kind: 'sale',
        },
      ],
      hub_financial_adjustments: [],
      hub_comandas: [],
      hub_encounters: [],
      hub_boarding_reservations: [],
      hub_comanda_cancellations: [],
      hub_customer_package_balances: [],
      hub_appointments: [],
      hub_grooming_sessions: [],
      units: [{ id: TEST_UNIT_ID, clinic_id: clinicId }],
      hub_pets: [{ id: TEST_PET_ID, clinic_id: clinicId }],
      hub_guardians: [{ id: TEST_GUARDIAN_ID, clinic_id: clinicId }],
    },
  });
}

describe('POST /finance/payments/:id/reverse — soft-lock / RBAC / isolamento', () => {
  afterEach(() => {
    resetAuthMock();
  });

  it('autorizado (RBAC) estorna com sucesso', async () => {
    seedPaymentTables();
    configureAuthMock({
      checkPermission: async (_u, _c, perm) => perm === 'hub.payments.reverse',
    });

    const res = await request(app)
      .post(`/api/hub/finance/payments/${TEST_PAYMENT_ID}/reverse`)
      .send({ clinic_id: TEST_CLINIC_ID, reason: 'Correção de lançamento' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('sem permissão hub.payments.reverse → 403', async () => {
    seedPaymentTables();
    configureAuthMock({
      checkPermission: async () => false,
    });

    const res = await request(app)
      .post(`/api/hub/finance/payments/${TEST_PAYMENT_ID}/reverse`)
      .send({ clinic_id: TEST_CLINIC_ID, reason: 'Tentativa sem permissão' });

    expect(res.status).toBe(403);
  });

  it('clinic_id de outra clínica não estorna pagamento (isolamento)', async () => {
    seedPaymentTables(TEST_CLINIC_ID);
    configureAuthMock({
      checkPermission: async () => true,
    });

    const res = await request(app)
      .post(`/api/hub/finance/payments/${TEST_PAYMENT_ID}/reverse`)
      .send({ clinic_id: OTHER_CLINIC_ID, reason: 'Tentativa cross-tenant' });

    expect(res.status).toBe(404);
    const payment = getMockSupabaseClient()._state.tables.hub_payments?.find(
      (p) => p.id === TEST_PAYMENT_ID,
    );
    expect(payment?.status).not.toBe('reversed');
  });

  it('reason curta → 400', async () => {
    seedPaymentTables();
    configureAuthMock({ checkPermission: async () => true });

    const res = await request(app)
      .post(`/api/hub/finance/payments/${TEST_PAYMENT_ID}/reverse`)
      .send({ clinic_id: TEST_CLINIC_ID, reason: 'ab' });

    expect(res.status).toBe(400);
  });

  /**
   * Exceção de produto: a rota NÃO aplica requireCoreOpsWrite / soft-lock.
   * Com RBAC ok, o estorno funciona independentemente do access_mode da clínica
   * (não há middleware de entitlement nesta rota).
   */
  it('não depende de entitlement MW (rota deliberadamente sem soft-lock)', async () => {
    seedPaymentTables();
    configureAuthMock({ checkPermission: async () => true });
    const res = await request(app)
      .post(`/api/hub/finance/payments/${TEST_PAYMENT_ID}/reverse`)
      .send({ clinic_id: TEST_CLINIC_ID, reason: 'Permitido em qualquer access_mode via RBAC' });
    expect(res.status).toBe(200);
  });
});
