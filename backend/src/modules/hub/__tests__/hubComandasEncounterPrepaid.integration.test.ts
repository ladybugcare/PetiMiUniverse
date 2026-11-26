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
import { syncOpenComandasAfterEncounterCompleted } from '../hubComandasController';

const TEST_ENCOUNTER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002';
const TEST_APPT_COMANDA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002';
const TEST_APPT_SVC_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0002';
const TEST_COMANDA_ITEM_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd0002';
const TEST_CLINIC_SERVICE_TYPE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002';
const TEST_HEMO_SERVICE_TYPE_ID = 'ffffffff-ffff-4fff-8fff-ffffffff0003';
const TEST_ENC_SVC_ID = '11111111-1111-4111-8111-111111111002';

function clinicServiceType() {
  return {
    id: TEST_CLINIC_SERVICE_TYPE_ID,
    clinic_id: TEST_CLINIC_ID,
    service_group: 'clinica',
    name: 'Consulta clínica',
    sale_amount: 180,
    cost_amount: 0,
    deleted_at: null,
  };
}

function hemoServiceType() {
  return {
    id: TEST_HEMO_SERVICE_TYPE_ID,
    clinic_id: TEST_CLINIC_ID,
    service_group: 'clinica',
    name: 'Hemograma',
    sale_amount: 90,
    cost_amount: 0,
    deleted_at: null,
  };
}

function prepaidAppointmentFixture(opts?: { withEncounterService?: boolean }) {
  return {
    ...emptyBoardingTables(),
    hub_service_types: [clinicServiceType(), hemoServiceType()],
    hub_appointments: [
      boardingAppointment({
        status: 'done',
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
        status: 'completed',
        completed_at: '2026-11-26T17:21:00.000Z',
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
        status: 'fechada',
        financial_status: 'settled',
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
    hub_receivables: [
      {
        id: 'rec-manual-prepaid',
        clinic_id: TEST_CLINIC_ID,
        source_type: 'manual',
        source_id: 'manual-src-prepaid',
        comanda_id: TEST_APPT_COMANDA_ID,
        status: 'paid',
        deleted_at: null,
      },
    ],
    hub_receivable_lines: [
      {
        id: 'rec-line-prepaid',
        receivable_id: 'rec-manual-prepaid',
        comanda_id: TEST_APPT_COMANDA_ID,
        comanda_item_id: TEST_COMANDA_ITEM_ID,
      },
    ],
    hub_encounter_services: opts?.withEncounterService
      ? [
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
        ]
      : [],
    hub_clinical_exams: [],
    hub_vaccination_records: [],
    hub_prescriptions: [],
    hub_encounter_medication_administrations: [],
    hub_comanda_events: [],
  };
}

describe('syncOpenComandasAfterEncounterCompleted — consulta pré-paga na agenda', () => {
  it('não cria segunda comanda quando a consulta da agenda já foi quitada', async () => {
    configureSupabaseMock({ tables: prepaidAppointmentFixture() });

    await syncOpenComandasAfterEncounterCompleted(TEST_CLINIC_ID, TEST_ENCOUNTER_ID);

    const comandas = getMockSupabaseClient()._state.tables.hub_comandas ?? [];
    const encounterComandas = comandas.filter(
      (c) => c.origin_type === 'encounter' && c.origin_id === TEST_ENCOUNTER_ID,
    );
    expect(encounterComandas).toHaveLength(0);
    expect(comandas).toHaveLength(1);
    expect(comandas[0]?.id).toBe(TEST_APPT_COMANDA_ID);
  });

  it('abre comanda do encounter só com extras clínicos, sem re-lançar a consulta já paga', async () => {
    configureSupabaseMock({ tables: prepaidAppointmentFixture({ withEncounterService: true }) });

    await syncOpenComandasAfterEncounterCompleted(TEST_CLINIC_ID, TEST_ENCOUNTER_ID);

    const comandas = getMockSupabaseClient()._state.tables.hub_comandas ?? [];
    const encounterComandas = comandas.filter(
      (c) => c.origin_type === 'encounter' && c.origin_id === TEST_ENCOUNTER_ID,
    );
    expect(encounterComandas).toHaveLength(1);

    const encComandaId = encounterComandas[0]?.id as string;
    const items = (getMockSupabaseClient()._state.tables.hub_comanda_items ?? []).filter(
      (it) => it.comanda_id === encComandaId,
    );
    expect(items.some((it) => it.origin_type === 'appointment_service')).toBe(false);
    expect(
      items.some((it) => it.origin_type === 'encounter_service' && Number(it.line_total) === 90),
    ).toBe(true);
    expect(Number(encounterComandas[0]?.total_amount)).toBe(90);
  });
});
