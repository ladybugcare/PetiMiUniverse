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
  TEST_PET_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';
import { HUB_PAYMENT_METHODS } from '../hubPaymentMethods';

const TEST_RECEIVABLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TEST_PAYMENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TEST_APPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEST_SESSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('POST /api/hub/finance/payments/:id/reverse — agenda paid', () => {
  it('desmarca appointment.status paid → done quando recebível volta a pendente', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_clinic_settings: [
          {
            clinic_id: TEST_CLINIC_ID,
            pet_puppy_max_months: 12,
            message_templates: null,
            accepted_payment_methods: [...HUB_PAYMENT_METHODS],
          },
        ],
        hub_appointments: [
          {
            id: TEST_APPT_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            guardian_id: TEST_GUARDIAN_ID,
            pet_id: TEST_PET_ID,
            status: 'paid',
            deleted_at: null,
          },
        ],
        hub_grooming_sessions: [
          {
            id: TEST_SESSION_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_appointment_id: TEST_APPT_ID,
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
            status: 'paid',
            final_amount: 50,
            original_amount: 50,
            source_type: 'grooming_session',
            source_id: TEST_SESSION_ID,
            deleted_at: null,
          },
        ],
        hub_payments: [
          {
            id: TEST_PAYMENT_ID,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: TEST_RECEIVABLE_ID,
            amount: 50,
            payment_method: 'pix',
            cash_session_id: null,
          },
        ],
        hub_financial_adjustments: [],
        hub_comandas: [],
        hub_encounters: [],
        hub_boarding_reservations: [],
        hub_comanda_cancellations: [],
      },
    });

    const res = await request(app)
      .post(`/api/hub/finance/payments/${TEST_PAYMENT_ID}/reverse`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        reason: 'Cliente desistiu do pagamento',
      });

    expect(res.status).toBe(200);
    expect(res.body.receivable_status).toBe('pending');

    const rec = getMockSupabaseClient()._state.tables.hub_receivables?.find(
      (r) => r.id === TEST_RECEIVABLE_ID,
    );
    expect(rec?.status).toBe('pending');

    const appt = getMockSupabaseClient()._state.tables.hub_appointments?.find(
      (a) => a.id === TEST_APPT_ID,
    );
    expect(appt?.status).toBe('done');
  });
});
