jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  boardingAppointment,
  emptyBoardingTables,
  TEST_APPOINTMENT_ID,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';
import {
  syncOpenComandasAfterEncounterChargeableChange,
  tryAutoCloseComanda,
} from '../hubComandasController';

const TEST_ENCOUNTER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0010';
const TEST_APPT_COMANDA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0010';
const TEST_APPT_SVC_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0010';
const TEST_COMANDA_ITEM_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd0010';
const TEST_CLINIC_SERVICE_TYPE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0010';
const TEST_MED_SERVICE_TYPE_ID = 'ffffffff-ffff-4fff-8fff-ffffffff0010';
const TEST_MED_ADMIN_ID = '11111111-1111-4111-8111-111111111110';
const TEST_HEMO_SERVICE_TYPE_ID = '22222222-2222-4222-8222-222222222210';
const TEST_ENC_SVC_ID = '33333333-3333-4333-8333-333333333310';

function baseTables(opts?: { encounterStatus?: string; appointmentStatus?: string }) {
  const encounterStatus = opts?.encounterStatus ?? 'in_progress';
  const appointmentStatus = opts?.appointmentStatus ?? 'in_progress';
  return {
    ...emptyBoardingTables(),
    hub_service_types: [
      {
        id: TEST_CLINIC_SERVICE_TYPE_ID,
        clinic_id: TEST_CLINIC_ID,
        service_group: 'clinica',
        name: 'Consulta clínica',
        sale_amount: 180,
        cost_amount: 0,
        deleted_at: null,
      },
      {
        id: TEST_MED_SERVICE_TYPE_ID,
        clinic_id: TEST_CLINIC_ID,
        service_group: 'clinica',
        name: 'Medicação Injetável',
        sale_amount: 80,
        cost_amount: 0,
        deleted_at: null,
      },
      {
        id: TEST_HEMO_SERVICE_TYPE_ID,
        clinic_id: TEST_CLINIC_ID,
        service_group: 'clinica',
        name: 'Hemograma',
        sale_amount: 90,
        cost_amount: 0,
        deleted_at: null,
      },
    ],
    hub_appointments: [
      boardingAppointment({
        status: appointmentStatus,
        title: 'Consulta clínica',
        hub_service_type_id: TEST_CLINIC_SERVICE_TYPE_ID,
        appointment_kind: 'clinic',
        starts_at: '2026-11-26T17:00:00.000Z',
        ends_at: '2026-11-26T17:30:00.000Z',
      }),
    ],
    hub_appointment_services: [
      {
        id: TEST_APPT_SVC_ID,
        appointment_id: TEST_APPOINTMENT_ID,
        hub_service_type_id: TEST_CLINIC_SERVICE_TYPE_ID,
        sale_amount_applied: 180,
        order_index: 0,
        hub_service_types: { name: 'Consulta clínica', sale_amount: 180 },
      },
    ],
    hub_encounters: [
      {
        id: TEST_ENCOUNTER_ID,
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        guardian_id: TEST_GUARDIAN_ID,
        pet_id: TEST_PET_ID,
        hub_appointment_id: TEST_APPOINTMENT_ID,
        hub_case_id: null,
        status: encounterStatus,
        completed_at: encounterStatus === 'completed' ? '2026-11-26T17:21:00.000Z' : null,
        billing_waived_at: null,
        deleted_at: null,
      },
    ],
    hub_comandas: [
      {
        id: TEST_APPT_COMANDA_ID,
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        guardian_id: TEST_GUARDIAN_ID,
        pet_id: TEST_PET_ID,
        origin_type: 'appointment',
        origin_id: TEST_APPOINTMENT_ID,
        hub_encounter_id: TEST_ENCOUNTER_ID,
        status: 'aberta',
        financial_status: 'open',
        subtotal_amount: 180,
        discount_amount: 0,
        total_amount: 180,
        deleted_at: null,
      },
    ],
    hub_comanda_items: [
      {
        id: TEST_COMANDA_ITEM_ID,
        clinic_id: TEST_CLINIC_ID,
        comanda_id: TEST_APPT_COMANDA_ID,
        pet_id: TEST_PET_ID,
        item_kind: 'service',
        hub_service_type_id: TEST_CLINIC_SERVICE_TYPE_ID,
        description: 'Consulta clínica',
        quantity: 1,
        unit_amount: 180,
        discount_amount: 0,
        line_total: 180,
        origin_type: 'appointment_service',
        origin_id: TEST_APPT_SVC_ID,
        sort_order: 0,
      },
    ],
    hub_receivables: [],
    hub_receivable_lines: [],
    hub_payments: [],
    hub_clinical_exams: [],
    hub_vaccination_records: [],
    hub_prescriptions: [],
    hub_encounter_medication_administrations: [
      {
        id: TEST_MED_ADMIN_ID,
        clinic_id: TEST_CLINIC_ID,
        hub_encounter_id: TEST_ENCOUNTER_ID,
        hub_service_type_id: TEST_MED_SERVICE_TYPE_ID,
        service_name: 'Medicação Injetável',
        service_price: 80,
        deleted_at: null,
      },
    ],
    hub_encounter_services: [],
    hub_comanda_events: [],
  };
}

describe('sync mid-encounter na comanda da agenda', () => {
  it('inclui medicação na comanda appointment enquanto o AT está em andamento', async () => {
    configureSupabaseMock({ tables: baseTables() });

    await syncOpenComandasAfterEncounterChargeableChange(TEST_CLINIC_ID, TEST_ENCOUNTER_ID);

    const items = (getMockSupabaseClient()._state.tables.hub_comanda_items ?? []).filter(
      (it) => it.comanda_id === TEST_APPT_COMANDA_ID,
    );
    expect(items.some((it) => it.origin_type === 'appointment_service')).toBe(true);
    expect(
      items.some(
        (it) => it.origin_type === 'medication_service' && Number(it.line_total) === 80,
      ),
    ).toBe(true);

    const comanda = (getMockSupabaseClient()._state.tables.hub_comandas ?? []).find(
      (c) => c.id === TEST_APPT_COMANDA_ID,
    );
    expect(comanda?.status).toBe('aberta');
    expect(Number(comanda?.total_amount)).toBe(260);
  });

  it('inclui encounter_service (Hemograma) na comanda appointment mid-AT', async () => {
    configureSupabaseMock({
      tables: {
        ...baseTables(),
        hub_encounter_medication_administrations: [],
        hub_encounter_services: [
          {
            id: TEST_ENC_SVC_ID,
            clinic_id: TEST_CLINIC_ID,
            hub_encounter_id: TEST_ENCOUNTER_ID,
            hub_service_type_id: TEST_HEMO_SERVICE_TYPE_ID,
            hub_appointment_service_id: null,
            service_name: 'Hemograma',
            quantity: 1,
            unit_amount: 90,
            billing_mode: 'charge',
            price_status: 'confirmed',
            deleted_at: null,
            sort_order: 0,
          },
        ],
      },
    });

    await syncOpenComandasAfterEncounterChargeableChange(TEST_CLINIC_ID, TEST_ENCOUNTER_ID);

    const items = (getMockSupabaseClient()._state.tables.hub_comanda_items ?? []).filter(
      (it) => it.comanda_id === TEST_APPT_COMANDA_ID,
    );
    expect(items.some((it) => it.origin_type === 'appointment_service')).toBe(true);
    expect(
      items.some((it) => it.origin_type === 'encounter_service' && Number(it.line_total) === 90),
    ).toBe(true);
    const comanda = (getMockSupabaseClient()._state.tables.hub_comandas ?? []).find(
      (c) => c.id === TEST_APPT_COMANDA_ID,
    );
    expect(Number(comanda?.total_amount)).toBe(270);
  });

  it('não auto-fecha a comanda com saldo zerado se o encounter ainda está aberto', async () => {
    configureSupabaseMock({
      tables: {
        ...baseTables({ appointmentStatus: 'paid' }),
        hub_receivables: [
          {
            id: 'rec-paid-consulta',
            clinic_id: TEST_CLINIC_ID,
            source_type: 'manual',
            source_id: 'manual-src',
            comanda_id: TEST_APPT_COMANDA_ID,
            status: 'paid',
            final_amount: 180,
            returned_amount: 0,
            deleted_at: null,
          },
        ],
        hub_receivable_lines: [
          {
            id: 'rec-line-1',
            receivable_id: 'rec-paid-consulta',
            comanda_id: TEST_APPT_COMANDA_ID,
            comanda_item_id: TEST_COMANDA_ITEM_ID,
          },
        ],
        hub_payments: [
          {
            id: 'pay-1',
            receivable_id: 'rec-paid-consulta',
            clinic_id: TEST_CLINIC_ID,
            status: 'posted',
            amount: 180,
            method: 'pix',
          },
        ],
        hub_encounter_medication_administrations: [],
      },
    });

    const closed = await tryAutoCloseComanda(TEST_APPT_COMANDA_ID, TEST_CLINIC_ID);
    expect(closed).toBe(false);

    const comanda = (getMockSupabaseClient()._state.tables.hub_comandas ?? []).find(
      (c) => c.id === TEST_APPT_COMANDA_ID,
    );
    expect(comanda?.status).toBe('aberta');
  });
});
