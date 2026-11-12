/**
 * Cobertura automatizada do Bloco 5 (HUB_MVP_MANUAL_QA) + critérios de aceite do Epic 7.
 * Usa mocks (sem backend live) — espelha parcial, waive, estorno, cancelamento, fechamento e permissões.
 */
jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureAuthMock, resetAuthMock } from '../../../__tests__/helpers/authTestDouble';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  emptyBoardingTables,
  hotelReservationCheckedOut,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_RESERVATION_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';
import { hasPermission, type Role } from '../../../utils/permissions';
import { HUB_PAYMENT_METHODS } from '../hubPaymentMethods';

const RECEIVABLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001';
const RECEIVABLE_CANCEL_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd0002';
const PAYMENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001';
const CASH_SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';

function clinicSettings() {
  return {
    clinic_id: TEST_CLINIC_ID,
    pet_puppy_max_months: 12,
    message_templates: null,
    accepted_payment_methods: [...HUB_PAYMENT_METHODS],
  };
}

function cashSession(overrides: Record<string, unknown> = {}) {
  return {
    id: CASH_SESSION_ID,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    status: 'open',
    opening_balance: 100,
    opened_at: '2026-06-15T10:00:00.000Z',
    closed_at: null,
    deleted_at: null,
    ...overrides,
  };
}

function pendingReceivable(id: string, amount: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    guardian_id: TEST_GUARDIAN_ID,
    comanda_id: null,
    due_date: '2026-06-15',
    status: 'pending',
    final_amount: amount,
    original_amount: amount,
    source_type: 'manual',
    source_id: `manual-${id}`,
    deleted_at: null,
    notes: null,
    ...extra,
  };
}

function baseTables(extra: Record<string, unknown[]> = {}) {
  return {
    ...emptyBoardingTables(),
    hub_clinic_settings: [clinicSettings()],
    hub_cash_sessions: [cashSession()],
    hub_cash_movements: [] as Record<string, unknown>[],
    hub_receivables: [pendingReceivable(RECEIVABLE_ID, 100)],
    hub_receivable_lines: [
      {
        id: 'line-1',
        clinic_id: TEST_CLINIC_ID,
        receivable_id: RECEIVABLE_ID,
        description: 'Consulta QA',
        quantity: 1,
        unit_sale_amount: 100,
        line_total: 100,
        line_kind: 'manual',
        sort_order: 0,
      },
    ],
    hub_payments: [] as Record<string, unknown>[],
    hub_financial_adjustments: [] as Record<string, unknown>[],
    hub_comandas: [] as Record<string, unknown>[],
    hub_comanda_items: [] as Record<string, unknown>[],
    hub_charge_bundles: [] as Record<string, unknown>[],
    hub_charge_bundle_items: [] as Record<string, unknown>[],
    ...extra,
  };
}

function authAsRole(role: Role) {
  configureAuthMock({
    user: { id: '11111111-1111-4111-8111-111111111111', email: `${role.toLowerCase()}@test.com`, role },
    checkPermission: (_userId, _clinicId, permission) => hasPermission(role, permission),
  });
}

describe('Epic 7 / Bloco 5 — financeiro e caixa', () => {
  afterEach(() => {
    resetAuthMock();
  });

  describe('5.2 — pagamento parcial + restante', () => {
    beforeEach(() => {
      configureSupabaseMock({ tables: baseTables() });
      authAsRole('CFINANCE');
    });

    it('dois pagamentos no mesmo recebível: partially_paid → paid', async () => {
      const partial = await request(app)
        .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
        .send({
          clinic_id: TEST_CLINIC_ID,
          amount: 40,
          payment_method: 'pix',
        });
      expect(partial.status).toBe(201);
      expect(partial.body.receivable_status).toBe('partially_paid');

      const rest = await request(app)
        .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
        .send({
          clinic_id: TEST_CLINIC_ID,
          amount: 60,
          payment_method: 'cash',
          cash_session_id: CASH_SESSION_ID,
        });
      expect(rest.status).toBe(201);
      expect(rest.body.receivable_status).toBe('paid');

      const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
      expect(payments).toHaveLength(2);
      const sum = payments.reduce((a, p) => a + Number(p.amount ?? 0), 0);
      expect(sum).toBe(100);

      const rec = getMockSupabaseClient()._state.tables.hub_receivables?.find((r) => r.id === RECEIVABLE_ID);
      expect(rec?.status).toBe('paid');
    });
  });

  describe('5.3 — waive com motivo', () => {
    beforeEach(() => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [hotelReservationCheckedOut()],
          hub_clinic_settings: [clinicSettings()],
        },
      });
      authAsRole('CFINANCE');
    });

    it('POST /finance/waive-billing registra motivo e não cria recebível', async () => {
      const before = (getMockSupabaseClient()._state.tables.hub_receivables ?? []).length;
      const res = await request(app).post('/api/hub/finance/waive-billing').send({
        clinic_id: TEST_CLINIC_ID,
        source_type: 'boarding_reservation',
        source_id: TEST_RESERVATION_ID,
        reason: 'Cortesia QA Bloco 5',
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const reservation = getMockSupabaseClient()._state.tables.hub_boarding_reservations?.[0];
      expect(reservation?.billing_waived_at).toBeTruthy();
      expect(reservation?.billing_waive_reason).toBe('Cortesia QA Bloco 5');
      expect(getMockSupabaseClient()._state.tables.hub_receivables ?? []).toHaveLength(before);
    });
  });

  describe('5.4 — estorno e cancelamento', () => {
    it('estorno preserva histórico e reabre recebível', async () => {
      configureSupabaseMock({
        tables: baseTables({
          hub_receivables: [pendingReceivable(RECEIVABLE_ID, 50, { status: 'paid' })],
          hub_payments: [
            {
              id: PAYMENT_ID,
              clinic_id: TEST_CLINIC_ID,
              receivable_id: RECEIVABLE_ID,
              amount: 50,
              payment_method: 'pix',
              cash_session_id: null,
              status: 'posted',
              posting_kind: 'operational',
            },
          ],
        }),
      });
      authAsRole('CFINANCE');

      const res = await request(app)
        .post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`)
        .send({
          clinic_id: TEST_CLINIC_ID,
          reason: 'Pagamento duplicado QA',
          mode: 'payment_reversal',
        });
      expect(res.status).toBe(200);
      expect(res.body.receivable_status).toBe('pending');
      expect(res.body.reversal_mode).toBe('payment_reversal');

      const rec = getMockSupabaseClient()._state.tables.hub_receivables?.find((r) => r.id === RECEIVABLE_ID);
      expect(rec?.status).toBe('pending');
      const pay = getMockSupabaseClient()._state.tables.hub_payments?.find((p) => p.id === PAYMENT_ID);
      expect(pay?.status).toBe('reversed');
      const adjustments = getMockSupabaseClient()._state.tables.hub_financial_adjustments ?? [];
      expect(adjustments.some((a) => a.adjustment_type === 'payment_reversal')).toBe(true);
    });

    it('cancelamento de recebível sem pagamentos marca cancelled + write_off', async () => {
      configureSupabaseMock({
        tables: baseTables({
          hub_receivables: [pendingReceivable(RECEIVABLE_CANCEL_ID, 80)],
          hub_receivable_lines: [
            {
              id: 'line-cancel',
              clinic_id: TEST_CLINIC_ID,
              receivable_id: RECEIVABLE_CANCEL_ID,
              description: 'Serviço a cancelar',
              quantity: 1,
              unit_sale_amount: 80,
              line_total: 80,
              line_kind: 'manual',
              sort_order: 0,
            },
          ],
        }),
      });
      authAsRole('CFINANCE');

      const res = await request(app)
        .post(`/api/hub/finance/receivables/${RECEIVABLE_CANCEL_ID}/cancel`)
        .send({ clinic_id: TEST_CLINIC_ID, reason: 'Erro de lançamento QA' });
      expect(res.status).toBe(200);
      expect(res.body.receivable?.status).toBe('cancelled');

      const adjustments = getMockSupabaseClient()._state.tables.hub_financial_adjustments ?? [];
      expect(adjustments.some((a) => a.adjustment_type === 'write_off')).toBe(true);
    });
  });

  describe('5.5 — fechamento de caixa', () => {
    it('fecha sessão com expected_balance e bloqueia cash sem sessão', async () => {
      configureSupabaseMock({
        tables: baseTables({
          hub_cash_sessions: [cashSession({ opening_balance: 50 })],
          hub_payments: [
            {
              id: PAYMENT_ID,
              clinic_id: TEST_CLINIC_ID,
              receivable_id: RECEIVABLE_ID,
              amount: 25,
              payment_method: 'cash',
              cash_session_id: CASH_SESSION_ID,
              payment_date: '2026-06-15T12:00:00.000Z',
              status: 'posted',
              posting_kind: 'operational',
            },
          ],
          hub_cash_movements: [
            {
              id: 'mov-1',
              clinic_id: TEST_CLINIC_ID,
              cash_session_id: CASH_SESSION_ID,
              movement_type: 'withdrawal',
              amount: 10,
              created_at: '2026-06-15T13:00:00.000Z',
            },
          ],
          hub_customer_credit_movements: [],
        }),
      });
      // Fechamento de gaveta exige hub.cash.session (CASSISTANT/CADMIN; CFINANCE não tem).
      authAsRole('CASSISTANT');

      const close = await request(app)
        .post(`/api/hub/finance/cash-sessions/${CASH_SESSION_ID}/close`)
        .send({ clinic_id: TEST_CLINIC_ID, closing_balance: 65 });
      expect(close.status).toBe(200);
      expect(close.body.cash_session.status).toBe('closed');
      // 50 abertura + 25 cash − 10 sangria = 65
      expect(Number(close.body.cash_session.expected_balance)).toBe(65);
      expect(Number(close.body.cash_session.difference_amount)).toBe(0);

      authAsRole('CFINANCE');
      const blocked = await request(app)
        .post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/payments`)
        .send({
          clinic_id: TEST_CLINIC_ID,
          amount: 10,
          payment_method: 'cash',
        });
      expect(blocked.status).toBe(409);
      expect(String(blocked.body.error)).toMatch(/abra o caixa/i);
    });
  });

  describe('5.1 / Epic 7 — cobrança explícita', () => {
    it('Gerar cobrança cria recebível; conclusão operacional não cria sozinha (unbilled)', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_boarding_reservations: [hotelReservationCheckedOut()],
          hub_clinic_settings: [clinicSettings()],
          hub_receivables: [],
          hub_receivable_lines: [],
        },
      });
      authAsRole('CFINANCE');

      const unbilled = await request(app)
        .get('/api/hub/finance/unbilled-completed')
        .query({ clinic_id: TEST_CLINIC_ID, unit_id: TEST_UNIT_ID });
      expect(unbilled.status).toBe(200);
      const items = unbilled.body.items ?? unbilled.body.unbilled ?? [];
      expect(Array.isArray(items)).toBe(true);
      expect(items.some((i: { source_id?: string }) => i.source_id === TEST_RESERVATION_ID)).toBe(true);

      const created = await request(app).post('/api/hub/finance/receivables').send({
        clinic_id: TEST_CLINIC_ID,
        source_type: 'boarding_reservation',
        source_id: TEST_RESERVATION_ID,
      });
      expect(created.status).toBe(201);
      expect(created.body.receivable?.id).toBeTruthy();
      expect(getMockSupabaseClient()._state.tables.hub_receivables?.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Permissões CASSISTANT / CFINANCE (Bloco 3.1 + 3.4 alinhado ao código)', () => {
    beforeEach(() => {
      configureSupabaseMock({
        tables: baseTables({
          hub_cash_sessions: [],
          hub_payments: [],
          clinic_users: [],
          hub_staff_members: [],
        }),
      });
    });

    it('CFINANCE não abre caixa (sem hub.cash.session) e consegue estornar', async () => {
      authAsRole('CFINANCE');
      expect(hasPermission('CFINANCE', 'hub.cash.session')).toBe(false);
      expect(hasPermission('CFINANCE', 'hub.payments.reverse')).toBe(true);
      expect(hasPermission('CFINANCE', 'hub.financial.adjust')).toBe(true);
      const res = await request(app).post('/api/hub/finance/cash-sessions/open').send({
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        opening_balance: 0,
      });
      expect(res.status).toBe(403);
    });

    it('CASSISTANT consegue abrir caixa (recepção + caixa — modelo atual)', async () => {
      authAsRole('CASSISTANT');
      expect(hasPermission('CASSISTANT', 'hub.cash.session')).toBe(true);
      expect(hasPermission('CASSISTANT', 'hub.cash.receive')).toBe(true);
      expect(hasPermission('CASSISTANT', 'hub.receivables.create')).toBe(true);
      const res = await request(app).post('/api/hub/finance/cash-sessions/open').send({
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        opening_balance: 0,
      });
      expect(res.status).toBe(201);
    });

    it('CASSISTANT não tem financial.write (despesas → 403)', async () => {
      authAsRole('CASSISTANT');
      expect(hasPermission('CASSISTANT', 'hub.financial.write')).toBe(false);
      const res = await request(app).post('/api/hub/finance/expenses').send({
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        amount: 10,
        category: 'supplies',
        description: 'Tentativa sem permissão',
        expense_date: '2026-06-15',
      });
      expect(res.status).toBe(403);
    });

    it('CFINANCE não tem clinic.write nem appointments.write', async () => {
      expect(hasPermission('CFINANCE', 'hub.clinic.write')).toBe(false);
      expect(hasPermission('CFINANCE', 'hub.appointments.write')).toBe(false);
      expect(hasPermission('CFINANCE', 'hub.financial.write')).toBe(true);
      expect(hasPermission('CFINANCE', 'hub.cash.receive')).toBe(true);
    });
  });
});
