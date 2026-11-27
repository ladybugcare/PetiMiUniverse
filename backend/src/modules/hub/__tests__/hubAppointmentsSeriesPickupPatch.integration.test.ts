jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule(),
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/boarding';
import { betaClinicSubscription } from '../../../__tests__/helpers/fixtures/hubSubscription';

const SERIES_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const BATH_SVC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const PICKUP_SVC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const EXTRA_SVC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';

const DAY1 = '2027-03-09';
const DAY2 = '2027-03-16';
const DAY3 = '2027-03-23';

const bath1 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const bath2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const bath3 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
const legBefore1 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const legAfter1 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const legBefore2 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3';
const legAfter2 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
const legBefore3 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd5';
const legAfter3 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd6';
const extra1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';

function bathServiceType() {
  return {
    id: BATH_SVC,
    clinic_id: TEST_CLINIC_ID,
    name: 'Banho',
    code: 'banho',
    service_group: 'banho_tosa',
    cost_amount: 40,
    sale_amount: 80,
    pricing_matrix: null,
    active: true,
    deleted_at: null,
    is_addon: false,
    default_duration_minutes: 60,
  };
}

function pickupServiceType() {
  return {
    id: PICKUP_SVC,
    clinic_id: TEST_CLINIC_ID,
    name: 'Leva e Traz',
    code: 'lt',
    service_group: 'leva_traz',
    cost_amount: 10,
    sale_amount: 40,
    pricing_matrix: null,
    pickup_price_scope: 'round_trip',
    active: true,
    deleted_at: null,
    is_addon: false,
    default_duration_minutes: 30,
  };
}

function extraServiceType() {
  return {
    id: EXTRA_SVC,
    clinic_id: TEST_CLINIC_ID,
    name: 'Tosa higiênica',
    code: 'tosa_hig',
    service_group: 'banho_tosa',
    cost_amount: 20,
    sale_amount: 50,
    pricing_matrix: null,
    active: true,
    deleted_at: null,
    is_addon: true,
    default_duration_minutes: 30,
  };
}

function mainAppt(id: string, day: string) {
  return {
    id,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    hub_service_type_id: BATH_SVC,
    hub_staff_member_id: null,
    pet_id: TEST_PET_ID,
    guardian_id: TEST_GUARDIAN_ID,
    starts_at: `${day}T13:00:00.000Z`,
    ends_at: `${day}T14:00:00.000Z`,
    status: 'confirmed',
    appointment_kind: 'standard',
    parent_appointment_id: null,
    series_id: SERIES_ID,
    series_occurrence_date: day,
    pricing_porte_tier: null,
    pricing_coat_type: null,
    deleted_at: null,
    resource_label: null,
    hub_resource_id: null,
    hub_partner_clinic_id: null,
    title: 'Banho série',
  };
}

function legAppt(id: string, parentId: string, day: string, kind: 'before' | 'after') {
  const starts = kind === 'before' ? `${day}T12:00:00.000Z` : `${day}T14:15:00.000Z`;
  const ends = kind === 'before' ? `${day}T12:30:00.000Z` : `${day}T14:45:00.000Z`;
  return {
    id,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    hub_service_type_id: PICKUP_SVC,
    hub_staff_member_id: null,
    pet_id: TEST_PET_ID,
    guardian_id: TEST_GUARDIAN_ID,
    starts_at: starts,
    ends_at: ends,
    status: 'confirmed',
    appointment_kind: 'pickup_route',
    parent_appointment_id: parentId,
    series_id: SERIES_ID,
    series_occurrence_date: day,
    pricing_porte_tier: null,
    pricing_coat_type: null,
    deleted_at: null,
    resource_label: null,
    hub_resource_id: null,
    hub_partner_clinic_id: null,
    title: null,
  };
}

function svcLine(id: string, appointmentId: string, serviceTypeId: string, sale: number) {
  return {
    id,
    appointment_id: appointmentId,
    hub_service_type_id: serviceTypeId,
    duration_minutes: serviceTypeId === PICKUP_SVC ? 30 : 60,
    order_index: 0,
    pricing_porte_tier_applied: null,
    pricing_coat_type_applied: null,
    cost_amount_applied: sale / 2,
    sale_amount_applied: sale,
    pricing_variant: null,
    pricing_source: 'catalog',
    special_price_id: null,
  };
}

function seedSeries() {
  const appointments = [
    mainAppt(bath1, DAY1),
    mainAppt(bath2, DAY2),
    mainAppt(bath3, DAY3),
    legAppt(legBefore1, bath1, DAY1, 'before'),
    legAppt(legAfter1, bath1, DAY1, 'after'),
    legAppt(legBefore2, bath2, DAY2, 'before'),
    legAppt(legAfter2, bath2, DAY2, 'after'),
    legAppt(legBefore3, bath3, DAY3, 'before'),
    legAppt(legAfter3, bath3, DAY3, 'after'),
    {
      ...mainAppt(extra1, DAY1),
      id: extra1,
      hub_service_type_id: EXTRA_SVC,
      parent_appointment_id: bath1,
      starts_at: `${DAY1}T14:00:00.000Z`,
      ends_at: `${DAY1}T14:30:00.000Z`,
      title: 'Bloco extra',
    },
  ];

  const services = [
    svcLine('s-bath-1', bath1, BATH_SVC, 80),
    svcLine('s-bath-2', bath2, BATH_SVC, 80),
    svcLine('s-bath-3', bath3, BATH_SVC, 80),
    svcLine('s-lb-1', legBefore1, PICKUP_SVC, 20),
    svcLine('s-la-1', legAfter1, PICKUP_SVC, 20),
    svcLine('s-lb-2', legBefore2, PICKUP_SVC, 20),
    svcLine('s-la-2', legAfter2, PICKUP_SVC, 20),
    svcLine('s-lb-3', legBefore3, PICKUP_SVC, 20),
    svcLine('s-la-3', legAfter3, PICKUP_SVC, 20),
    svcLine('s-extra-1', extra1, EXTRA_SVC, 50),
  ];

  configureSupabaseMock({
    tables: {
      clinic_hub_subscriptions: [betaClinicSubscription(TEST_CLINIC_ID)],
      units: [{ id: TEST_UNIT_ID, clinic_id: TEST_CLINIC_ID, name: 'Matriz', is_main: true }],
      hub_pets: [
        {
          id: TEST_PET_ID,
          clinic_id: TEST_CLINIC_ID,
          name: 'Rex',
          size_tier: 'medio',
          coat_type: null,
          birth_date: null,
          deleted_at: null,
        },
      ],
      hub_guardians: [{ id: TEST_GUARDIAN_ID, clinic_id: TEST_CLINIC_ID, full_name: 'Tutor', deleted_at: null }],
      hub_service_types: [bathServiceType(), pickupServiceType(), extraServiceType()],
      hub_service_groups: [],
      hub_clinic_settings: [
        {
          clinic_id: TEST_CLINIC_ID,
          pet_puppy_max_months: 6,
          message_templates: {},
          accepted_payment_methods: ['cash'],
          cupom_width_mm: 80,
          card_machine_fees: {},
          multipet_pickup_billing: 'per_pet',
        },
      ],
      hub_appointments: appointments,
      hub_appointment_services: services,
      hub_encounters: [],
      hub_staff_members: [],
      hub_surgeries: [],
      hub_boarding_reservations: [],
      hub_comandas: [],
      notifications: [],
    },
  });
}

describe('PATCH série future com L&T (P0-02)', () => {
  it('altera horário sem corromper pernas/extras e conta só mains', async () => {
    seedSeries();

    const newStarts = `${DAY1}T19:30:00.000Z`;
    const newEnds = `${DAY1}T20:30:00.000Z`;

    const res = await request(app)
      .patch(`/api/hub/appointments/${bath1}?scope=future`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        starts_at: newStarts,
        ends_at: newEnds,
        services: [{ hub_service_type_id: BATH_SVC, duration_minutes: 60 }],
        allow_schedule_overlap: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.updated_count).toBe(3);

    const rows = getMockSupabaseClient()._state.tables.hub_appointments ?? [];
    const services = getMockSupabaseClient()._state.tables.hub_appointment_services ?? [];

    const mains = rows.filter(
      (r) =>
        r.series_id === SERIES_ID &&
        r.appointment_kind === 'standard' &&
        r.parent_appointment_id == null &&
        r.deleted_at == null,
    );
    expect(mains).toHaveLength(3);

    for (const day of [DAY1, DAY2, DAY3]) {
      const dayMains = mains.filter((m) => String(m.series_occurrence_date) === day);
      expect(dayMains).toHaveLength(1);
      const main = dayMains[0]!;
      const legs = rows.filter(
        (r) =>
          r.parent_appointment_id === main.id &&
          r.appointment_kind === 'pickup_route' &&
          r.deleted_at == null,
      );
      expect(legs).toHaveLength(2);

      // Nenhum dia “só transporte”: pernas no mesmo dia civil do banho.
      for (const leg of legs) {
        expect(String(leg.starts_at).slice(0, 10)).toBe(String(main.starts_at).slice(0, 10));
      }

      const mainSvc = services.filter((s) => s.appointment_id === main.id);
      expect(mainSvc.length).toBeGreaterThanOrEqual(1);
      expect(mainSvc.every((s) => s.hub_service_type_id === BATH_SVC)).toBe(true);

      for (const leg of legs) {
        const legSvc = services.filter((s) => s.appointment_id === leg.id);
        expect(legSvc.length).toBe(1);
        expect(legSvc[0]!.hub_service_type_id).toBe(PICKUP_SVC);
      }
    }

    // Bloco extra não virou cópia do banho.
    const extraSvc = services.filter((s) => s.appointment_id === extra1);
    expect(extraSvc).toHaveLength(1);
    expect(extraSvc[0]!.hub_service_type_id).toBe(EXTRA_SVC);

    // Âncora e futuras deslocaram +6h30.
    const updatedBath1 = rows.find((r) => r.id === bath1)!;
    expect(updatedBath1.starts_at).toBe(newStarts);
    const updatedBath2 = rows.find((r) => r.id === bath2)!;
    expect(updatedBath2.starts_at).toBe(`${DAY2}T19:30:00.000Z`);
    // Delta âncora: 13:00 → 19:30 = +6h30
    const updatedBefore2 = rows.find((r) => r.id === legBefore2)!;
    expect(updatedBefore2.starts_at).toBe(`${DAY2}T18:30:00.000Z`);
    const updatedAfter2 = rows.find((r) => r.id === legAfter2)!;
    expect(updatedAfter2.starts_at).toBe(`${DAY2}T20:45:00.000Z`);
  });
});
