jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  emptyBoardingTables,
  hotelReservationCheckedOut,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_RESERVATION_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';
import {
  bathServiceType,
  emptyPackageTables,
  hubPackageItemRow,
  hubPackageRow,
  TEST_PACKAGE_ID,
  TEST_SERVICE_TYPE_ID,
  TEST_CLINIC_ID as PKG_CLINIC_ID,
  TEST_GUARDIAN_ID as PKG_GUARDIAN_ID,
  TEST_PET_ID as PKG_PET_ID,
  TEST_UNIT_ID as PKG_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/packages';

const CASH_SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const BATH_SERVICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
const CLINIC_SERVICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002';
const LT_SERVICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0003';
const APPT_BATH_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0001';
const APPT_CLINIC_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0002';
const APPT_LT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0003';
const GROOMING_SESSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001';
const GROOMING_EXTRA_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd0002';
const ENCOUNTER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001';
const EXAM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002';
const QUOTE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffff01';
const QUOTE_LINE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffff02';

function cashSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CASH_SESSION_ID,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    status: 'open',
    opening_balance: 100,
    opened_at: '2026-06-15T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function serviceType(id: string, group: string, name: string) {
  return {
    id,
    clinic_id: TEST_CLINIC_ID,
    service_group: group,
    name,
    sale_amount: 100,
    deleted_at: null,
    active: true,
  };
}

function appointmentRow(id: string, serviceTypeId: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    pet_id: TEST_PET_ID,
    guardian_id: TEST_GUARDIAN_ID,
    starts_at: '2026-06-15T14:00:00.000Z',
    ends_at: '2026-06-15T15:00:00.000Z',
    status: 'done',
    title,
    hub_service_type_id: serviceTypeId,
    billing_waived_at: null,
    deleted_at: null,
    ...overrides,
  };
}

function appointmentService(id: string, appointmentId: string, serviceTypeId: string, amount: number) {
  return {
    id,
    appointment_id: appointmentId,
    hub_service_type_id: serviceTypeId,
    sale_amount_applied: amount,
    order_index: 0,
  };
}

function baseFinanceTables(extra: Record<string, unknown[]> = {}) {
  return {
    ...emptyBoardingTables(),
    hub_cash_sessions: [cashSessionRow()],
    hub_cash_movements: [] as Record<string, unknown>[],
    hub_grooming_session_extras: [] as Record<string, unknown>[],
    hub_vaccination_records: [] as Record<string, unknown>[],
    hub_prescriptions: [] as Record<string, unknown>[],
    hub_clinical_exams: [] as Record<string, unknown>[],
    hub_quote_lines: [] as Record<string, unknown>[],
    hub_quote_pets: [] as Record<string, unknown>[],
    hub_quote_line_pets: [] as Record<string, unknown>[],
    ...extra,
  };
}

async function openComanda(body: Record<string, unknown>) {
  return request(app).post('/api/hub/comandas/open').send(body);
}

async function checkoutReceiveNow(comandaId: string, amount: number, opts?: { cashSessionId?: string | null; method?: string }) {
  const method = opts?.method ?? 'cash';
  const cashSessionId = opts?.cashSessionId === undefined ? CASH_SESSION_ID : opts.cashSessionId;
  return request(app)
    .post(`/api/hub/comandas/${comandaId}/checkout`)
    .send({
      clinic_id: TEST_CLINIC_ID,
      grouping: 'all',
      action: 'receive_now',
      payments: [
        {
          group_index: 0,
          amount,
          payment_method: method,
          ...(cashSessionId ? { cash_session_id: cashSessionId } : {}),
        },
      ],
    });
}

async function checkoutLeavePending(comandaId: string) {
  return request(app)
    .post(`/api/hub/comandas/${comandaId}/checkout`)
    .send({
      clinic_id: TEST_CLINIC_ID,
      grouping: 'all',
      action: 'leave_pending',
      due_date: '2026-06-20',
    });
}

describe('Matriz Caixa — open → checkout por origem', () => {
  describe('boarding_reservation', () => {
    beforeEach(() => {
      configureSupabaseMock({
        tables: baseFinanceTables({
          hub_boarding_reservations: [hotelReservationCheckedOut()],
        }),
      });
    });

    it('receive_now em dinheiro com sessão gera receivable + payment vinculados', async () => {
      const open = await openComanda({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'boarding_reservation',
        origin_id: TEST_RESERVATION_ID,
      });
      expect(open.status).toBe(201);
      const comandaId = open.body.comanda.id as string;
      const total = Number(open.body.comanda.total_amount ?? open.body.items?.[0]?.line_total ?? 450);

      const pay = await checkoutReceiveNow(comandaId, total);
      expect(pay.status).toBe(201);
      expect(pay.body.receivable_ids?.length).toBeGreaterThanOrEqual(1);

      const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
      expect(payments.length).toBeGreaterThanOrEqual(1);
      expect(payments[0]).toMatchObject({
        payment_method: 'cash',
        cash_session_id: CASH_SESSION_ID,
        amount: total,
      });

      const receivables = getMockSupabaseClient()._state.tables.hub_receivables ?? [];
      expect(receivables.length).toBeGreaterThanOrEqual(1);
      expect(Number(receivables[0].final_amount ?? receivables[0].original_amount)).toBe(total);
    });

    it('receive_now em dinheiro sem cash_session_id retorna 409', async () => {
      const open = await openComanda({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'boarding_reservation',
        origin_id: TEST_RESERVATION_ID,
      });
      expect(open.status).toBe(201);
      const comandaId = open.body.comanda.id as string;
      const total = Number(open.body.comanda.total_amount ?? 450);

      const pay = await checkoutReceiveNow(comandaId, total, { cashSessionId: null });
      expect(pay.status).toBe(409);
      expect(pay.body.error).toMatch(/abra o caixa/i);
    });

    it('leave_pending cria receivable sem payment e marca handoff', async () => {
      const open = await openComanda({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'boarding_reservation',
        origin_id: TEST_RESERVATION_ID,
      });
      expect(open.status).toBe(201);
      const comandaId = open.body.comanda.id as string;

      const pending = await checkoutLeavePending(comandaId);
      expect(pending.status).toBe(201);
      expect(pending.body.receivable_ids?.length).toBeGreaterThanOrEqual(1);

      const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
      expect(payments).toHaveLength(0);

      const comanda = (getMockSupabaseClient()._state.tables.hub_comandas ?? []).find((c) => c.id === comandaId);
      expect(comanda?.finance_handoff_at).toBeTruthy();
    });
  });

  describe.each([
    {
      label: 'banho_tosa',
      apptId: APPT_BATH_ID,
      serviceId: BATH_SERVICE_ID,
      group: 'banho_tosa',
      name: 'Banho E2E',
      amount: 80,
    },
    {
      label: 'clinica',
      apptId: APPT_CLINIC_ID,
      serviceId: CLINIC_SERVICE_ID,
      group: 'clinica',
      name: 'Consulta E2E',
      amount: 120,
    },
    {
      label: 'leva_traz',
      apptId: APPT_LT_ID,
      serviceId: LT_SERVICE_ID,
      group: 'leva_traz',
      name: 'Leva e Traz E2E',
      amount: 45,
    },
  ])('appointment ($label)', ({ apptId, serviceId, group, name, amount }) => {
    beforeEach(() => {
      configureSupabaseMock({
        tables: baseFinanceTables({
          hub_service_types: [serviceType(serviceId, group, name)],
          hub_appointments: [appointmentRow(apptId, serviceId, name)],
          hub_appointment_services: [
            appointmentService(`${apptId}-svc`, apptId, serviceId, amount),
          ],
        }),
      });
    });

    it('open + receive_now liquida o agendamento', async () => {
      const open = await openComanda({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'appointment',
        origin_id: apptId,
      });
      expect(open.status).toBe(201);
      const comandaId = open.body.comanda.id as string;

      const pay = await checkoutReceiveNow(comandaId, amount);
      expect(pay.status).toBe(201);
      expect(pay.body.receivable_ids?.length).toBe(1);

      const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
      expect(payments[0]).toMatchObject({
        payment_method: 'cash',
        cash_session_id: CASH_SESSION_ID,
        amount,
      });
    });
  });

  describe('grooming_session (walk-in closed)', () => {
    beforeEach(() => {
      configureSupabaseMock({
        tables: baseFinanceTables({
          hub_grooming_sessions: [
            {
              id: GROOMING_SESSION_ID,
              clinic_id: TEST_CLINIC_ID,
              unit_id: TEST_UNIT_ID,
              guardian_id: TEST_GUARDIAN_ID,
              hub_appointment_id: null,
              grooming_stage: 'closed',
              billing_waived_at: null,
              deleted_at: null,
            },
          ],
          hub_grooming_session_extras: [
            {
              id: GROOMING_EXTRA_ID,
              clinic_id: TEST_CLINIC_ID,
              hub_grooming_session_id: GROOMING_SESSION_ID,
              hub_service_type_id: BATH_SERVICE_ID,
              name_snapshot: 'Banho walk-in',
              sale_amount_snapshot: 70,
              deleted_at: null,
            },
          ],
          hub_service_types: [serviceType(BATH_SERVICE_ID, 'banho_tosa', 'Banho')],
        }),
      });
    });

    it('open + receive_now liquida extras da sessão', async () => {
      const open = await openComanda({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'grooming_session',
        origin_id: GROOMING_SESSION_ID,
      });
      expect(open.status).toBe(201);
      const comandaId = open.body.comanda.id as string;

      const pay = await checkoutReceiveNow(comandaId, 70);
      expect(pay.status).toBe(201);
      expect(pay.body.receivable_ids?.length).toBe(1);

      const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
      expect(payments[0]).toMatchObject({ amount: 70, cash_session_id: CASH_SESSION_ID });
    });
  });

  describe('encounter (completed + exame)', () => {
    beforeEach(() => {
      configureSupabaseMock({
        tables: baseFinanceTables({
          hub_encounters: [
            {
              id: ENCOUNTER_ID,
              clinic_id: TEST_CLINIC_ID,
              unit_id: TEST_UNIT_ID,
              guardian_id: TEST_GUARDIAN_ID,
              pet_id: TEST_PET_ID,
              status: 'completed',
              billing_waived_at: null,
              hub_appointment_id: null,
              hub_case_id: null,
              deleted_at: null,
            },
          ],
          hub_clinical_exams: [
            {
              id: EXAM_ID,
              clinic_id: TEST_CLINIC_ID,
              hub_encounter_id: ENCOUNTER_ID,
              exam_type: 'Hemograma',
              lab_kind: 'internal',
              lab_name: 'Lab interno',
              external_lab_name: null,
              price: 95,
              status: 'requested',
              deleted_at: null,
            },
          ],
        }),
      });
    });

    it('open + receive_now liquida exame do encounter', async () => {
      const open = await openComanda({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'encounter',
        origin_id: ENCOUNTER_ID,
      });
      expect(open.status).toBe(201);
      const comandaId = open.body.comanda.id as string;

      const pay = await checkoutReceiveNow(comandaId, 95);
      expect(pay.status).toBe(201);
      expect(pay.body.receivable_ids?.length).toBe(1);

      const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
      expect(payments[0]).toMatchObject({ amount: 95, cash_session_id: CASH_SESSION_ID });
    });
  });

  describe('quote (accepted)', () => {
    beforeEach(() => {
      configureSupabaseMock({
        tables: baseFinanceTables({
          hub_quotes: [
            {
              id: QUOTE_ID,
              clinic_id: TEST_CLINIC_ID,
              unit_id: TEST_UNIT_ID,
              guardian_id: TEST_GUARDIAN_ID,
              status: 'accepted',
              billing_state: 'awaiting_billing',
              billing_waived_at: null,
              client_notes: null,
              deleted_at: null,
            },
          ],
          hub_quote_lines: [
            {
              id: QUOTE_LINE_ID,
              quote_id: QUOTE_ID,
              hub_service_type_id: BATH_SERVICE_ID,
              description: 'Banho orçado',
              quantity: 1,
              unit_price: 90,
              discount_amount: 0,
              line_total: 90,
              sort_order: 0,
            },
          ],
          hub_service_types: [serviceType(BATH_SERVICE_ID, 'banho_tosa', 'Banho')],
        }),
      });
    });

    it('open + receive_now marca quote como receivable_created', async () => {
      const open = await openComanda({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'quote',
        origin_id: QUOTE_ID,
      });
      expect(open.status).toBe(201);
      const comandaId = open.body.comanda.id as string;

      const pay = await checkoutReceiveNow(comandaId, 90);
      expect(pay.status).toBe(201);

      const quote = (getMockSupabaseClient()._state.tables.hub_quotes ?? [])[0];
      expect(quote?.billing_state).toBe('receivable_created');

      const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
      expect(payments[0]).toMatchObject({ amount: 90, cash_session_id: CASH_SESSION_ID });
    });
  });

  describe('package', () => {
    const PKG_CASH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0099';

    beforeEach(() => {
      configureSupabaseMock({
        tables: {
          ...emptyPackageTables(),
          hub_service_types: [bathServiceType()],
          hub_packages: [hubPackageRow()],
          hub_package_items: [hubPackageItemRow()],
          hub_cash_sessions: [
            {
              id: PKG_CASH_ID,
              clinic_id: PKG_CLINIC_ID,
              unit_id: PKG_UNIT_ID,
              status: 'open',
              opening_balance: 50,
              opened_at: '2026-06-15T10:00:00.000Z',
              deleted_at: null,
            },
          ],
        },
      });
    });

    it('open + receive_now liquida venda de pacote', async () => {
      const open = await openComanda({
        clinic_id: PKG_CLINIC_ID,
        origin_type: 'package',
        package_id: TEST_PACKAGE_ID,
        guardian_id: PKG_GUARDIAN_ID,
        pet_id: PKG_PET_ID,
        unit_id: PKG_UNIT_ID,
      });
      expect(open.status).toBe(201);
      const comandaId = open.body.comanda.id as string;
      const total = Number(open.body.comanda.total_amount ?? open.body.items?.[0]?.line_total ?? 500);

      const pay = await request(app)
        .post(`/api/hub/comandas/${comandaId}/checkout`)
        .send({
          clinic_id: PKG_CLINIC_ID,
          grouping: 'all',
          action: 'receive_now',
          payments: [
            {
              group_index: 0,
              amount: total,
              payment_method: 'cash',
              cash_session_id: PKG_CASH_ID,
            },
          ],
        });

      expect(pay.status).toBe(201);
      expect(pay.body.receivable_ids?.length).toBeGreaterThanOrEqual(1);

      const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
      expect(payments.some((p) => p.cash_session_id === PKG_CASH_ID)).toBe(true);

      const balances = getMockSupabaseClient()._state.tables.hub_customer_package_balances ?? [];
      expect(balances.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('sessão de caixa', () => {
    it('POST /finance/cash-sessions/open retorna 409 se já houver sessão aberta', async () => {
      configureSupabaseMock({
        tables: {
          ...emptyBoardingTables(),
          hub_cash_sessions: [cashSessionRow()],
          hub_staff_members: [],
        },
      });

      const res = await request(app)
        .post('/api/hub/finance/cash-sessions/open')
        .send({
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          opening_balance: 50,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/já existe caixa aberto/i);
      expect(res.body.previous_session_id).toBe(CASH_SESSION_ID);
    });

    it('receive_now com pix sem sessão também liquida (não exige caixa)', async () => {
      configureSupabaseMock({
        tables: baseFinanceTables({
          hub_boarding_reservations: [hotelReservationCheckedOut()],
          hub_cash_sessions: [],
        }),
      });

      const open = await openComanda({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'boarding_reservation',
        origin_id: TEST_RESERVATION_ID,
      });
      expect(open.status).toBe(201);
      const comandaId = open.body.comanda.id as string;
      const total = Number(open.body.comanda.total_amount ?? 450);

      const pay = await checkoutReceiveNow(comandaId, total, { method: 'pix', cashSessionId: null });
      expect(pay.status).toBe(201);

      const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
      expect(payments[0]).toMatchObject({ payment_method: 'pix' });
      expect(payments[0].cash_session_id == null).toBe(true);
    });
  });
});
