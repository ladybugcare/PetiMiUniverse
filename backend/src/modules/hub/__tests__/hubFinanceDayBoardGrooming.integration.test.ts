jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  emptyBoardingTables,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';

const TEST_APPOINTMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TEST_GROOMING_SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BATH_SERVICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMANDA_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RECEIVABLE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function linkedBathTables(overrides: Record<string, unknown[]> = {}) {
  return {
    ...emptyBoardingTables(),
    hub_service_types: [
      {
        id: BATH_SERVICE_ID,
        clinic_id: TEST_CLINIC_ID,
        name: 'Banho',
        service_group: 'banho_tosa',
        sale_amount: 80,
        deleted_at: null,
      },
    ],
    hub_appointments: [
      {
        id: TEST_APPOINTMENT_ID,
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        guardian_id: TEST_GUARDIAN_ID,
        pet_id: TEST_PET_ID,
        hub_service_type_id: BATH_SERVICE_ID,
        starts_at: '2026-06-15T14:00:00.000Z',
        ends_at: '2026-06-15T15:00:00.000Z',
        status: 'done',
        title: 'Banho',
        billing_waived_at: null,
        deleted_at: null,
        parent_appointment_id: null,
        visit_group_id: null,
        appointment_kind: null,
        pet: { id: TEST_PET_ID, name: 'Rex' },
        guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
        appointment_services: [
          {
            id: `${TEST_APPOINTMENT_ID}-svc`,
            hub_service_type_id: BATH_SERVICE_ID,
            sale_amount_applied: 80,
            service_type: { name: 'Banho', service_group: 'banho_tosa', sale_amount: 80 },
          },
        ],
      },
    ],
    hub_appointment_services: [
      {
        id: `${TEST_APPOINTMENT_ID}-svc`,
        appointment_id: TEST_APPOINTMENT_ID,
        hub_service_type_id: BATH_SERVICE_ID,
        sale_amount_applied: 80,
        order_index: 0,
      },
    ],
    hub_grooming_sessions: [
      {
        id: TEST_GROOMING_SESSION_ID,
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        guardian_id: TEST_GUARDIAN_ID,
        pet_id: TEST_PET_ID,
        hub_appointment_id: TEST_APPOINTMENT_ID,
        grooming_stage: 'closed',
        billing_waived_at: null,
        deleted_at: null,
        created_at: '2026-06-15T14:05:00.000Z',
        closed_at: '2026-06-15T15:10:00.000Z',
        pet: { id: TEST_PET_ID, name: 'Rex' },
        guardian: { id: TEST_GUARDIAN_ID, full_name: 'Maria Silva' },
      },
    ],
    hub_grooming_session_extras: [],
    ...overrides,
  };
}

describe('GET /api/hub/finance/day-board (grooming ↔ appointment billing alias)', () => {
  it('mostra Recebido quando a comanda/recebível está no appointment e o board lista a sessão', async () => {
    configureSupabaseMock({
      tables: linkedBathTables({
        hub_comandas: [
          {
            id: COMANDA_ID,
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'appointment',
            origin_id: TEST_APPOINTMENT_ID,
            status: 'fechada',
            finance_handoff_at: null,
            deleted_at: null,
          },
        ],
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            source_type: 'appointment',
            source_id: TEST_APPOINTMENT_ID,
            comanda_id: COMANDA_ID,
            status: 'paid',
            due_date: '2026-06-15',
            final_amount: 80,
            deleted_at: null,
          },
        ],
        hub_payments: [],
        hub_financial_adjustments: [],
        hub_receivable_lines: [],
        hub_product_return_events: [],
      }),
    });

    const res = await request(app)
      .get('/api/hub/finance/day-board')
      .query({ clinic_id: TEST_CLINIC_ID, unit_id: TEST_UNIT_ID, date: '2026-06-15' });

    expect(res.status).toBe(200);
    const grooming = res.body.items.find(
      (it: { origin_type: string; origin_id: string }) =>
        it.origin_type === 'grooming_session' && it.origin_id === TEST_GROOMING_SESSION_ID,
    );
    const appointment = res.body.items.find(
      (it: { origin_type: string; origin_id: string }) =>
        it.origin_type === 'appointment' && it.origin_id === TEST_APPOINTMENT_ID,
    );
    expect(appointment).toBeUndefined();
    expect(grooming).toBeDefined();
    expect(grooming.billing.comanda_id).toBe(COMANDA_ID);
    expect(grooming.billing.receivable_status).toBe('paid');
    expect(grooming.billing.has_receivable).toBe(true);
  });

  it('KPI unbilled não conta sessão cobrada via appointment', async () => {
    configureSupabaseMock({
      tables: linkedBathTables({
        hub_comandas: [
          {
            id: COMANDA_ID,
            clinic_id: TEST_CLINIC_ID,
            origin_type: 'appointment',
            origin_id: TEST_APPOINTMENT_ID,
            status: 'fechada',
            finance_handoff_at: null,
            deleted_at: null,
          },
        ],
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            source_type: 'appointment',
            source_id: TEST_APPOINTMENT_ID,
            comanda_id: COMANDA_ID,
            status: 'paid',
            due_date: '2026-06-15',
            final_amount: 80,
            deleted_at: null,
          },
        ],
      }),
    });

    const res = await request(app)
      .get('/api/hub/finance/pending-billing-count')
      .query({ clinic_id: TEST_CLINIC_ID, unit_id: TEST_UNIT_ID });

    expect(res.status).toBe(200);
    expect(res.body.pending_billing_count).toBe(0);
  });
});
