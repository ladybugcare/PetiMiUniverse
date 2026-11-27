jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  TEST_APPOINTMENT_ID,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PET_ID,
  TEST_UNIT_ID,
  emptyBoardingTables,
} from '../../../__tests__/helpers/fixtures/boarding';

const BATH_SERVICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const LT_SERVICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
const LEG_BEFORE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0001';
const LEG_AFTER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001';
const BLOCK_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001';
const BLOCK_LEG_ID = 'ffffffff-ffff-4fff-8fff-ffffffff0001';
const BLOCK_SERVICE_ID = '99999999-9999-4999-8999-999999990001';

function baseServiceTypes() {
  return [
    {
      id: BATH_SERVICE_ID,
      clinic_id: TEST_CLINIC_ID,
      service_group: 'banho_tosa',
      name: 'Banho',
      sale_amount: 50,
      deleted_at: null,
    },
    {
      id: LT_SERVICE_ID,
      clinic_id: TEST_CLINIC_ID,
      service_group: 'leva_traz',
      name: 'Leva e Traz',
      sale_amount: 40,
      deleted_at: null,
    },
    {
      id: BLOCK_SERVICE_ID,
      clinic_id: TEST_CLINIC_ID,
      service_group: 'clinica',
      name: 'Consulta',
      sale_amount: 120,
      deleted_at: null,
    },
  ];
}

function parentWithTwoLegsFixture(overrides: { legHasOwnComanda?: boolean } = {}) {
  const tables = {
    ...emptyBoardingTables(),
    hub_service_types: baseServiceTypes(),
    hub_appointments: [
      {
        id: TEST_APPOINTMENT_ID,
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        pet_id: TEST_PET_ID,
        guardian_id: TEST_GUARDIAN_ID,
        starts_at: '2026-06-15T14:00:00.000Z',
        ends_at: '2026-06-15T15:00:00.000Z',
        status: 'done',
        title: 'Banho Pipoca',
        hub_service_type_id: BATH_SERVICE_ID,
        appointment_kind: 'standard',
        parent_appointment_id: null,
        billing_waived_at: null,
        deleted_at: null,
      },
      {
        id: LEG_BEFORE_ID,
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        pet_id: TEST_PET_ID,
        guardian_id: TEST_GUARDIAN_ID,
        starts_at: '2026-06-15T13:30:00.000Z',
        ends_at: '2026-06-15T13:45:00.000Z',
        status: 'done',
        title: 'Busca',
        hub_service_type_id: LT_SERVICE_ID,
        appointment_kind: 'pickup_route',
        parent_appointment_id: TEST_APPOINTMENT_ID,
        billing_waived_at: null,
        deleted_at: null,
      },
      {
        id: LEG_AFTER_ID,
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        pet_id: TEST_PET_ID,
        guardian_id: TEST_GUARDIAN_ID,
        starts_at: '2026-06-15T15:15:00.000Z',
        ends_at: '2026-06-15T15:30:00.000Z',
        status: 'done',
        title: 'Retorno',
        hub_service_type_id: LT_SERVICE_ID,
        appointment_kind: 'pickup_route',
        parent_appointment_id: TEST_APPOINTMENT_ID,
        billing_waived_at: null,
        deleted_at: null,
      },
    ],
    hub_appointment_services: [
      {
        id: 'svc-bath-1',
        appointment_id: TEST_APPOINTMENT_ID,
        hub_service_type_id: BATH_SERVICE_ID,
        sale_amount_applied: 50,
        order_index: 0,
      },
      {
        id: 'svc-lt-before',
        appointment_id: LEG_BEFORE_ID,
        hub_service_type_id: LT_SERVICE_ID,
        sale_amount_applied: 20,
        order_index: 0,
      },
      {
        id: 'svc-lt-after',
        appointment_id: LEG_AFTER_ID,
        hub_service_type_id: LT_SERVICE_ID,
        sale_amount_applied: 20,
        order_index: 0,
      },
    ],
    hub_comandas: [] as Array<Record<string, unknown>>,
    hub_comanda_items: [] as Array<Record<string, unknown>>,
    hub_receivables: [] as Array<Record<string, unknown>>,
  };

  if (overrides.legHasOwnComanda) {
    tables.hub_comandas = [
      {
        id: 'comanda-leg-before',
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        guardian_id: TEST_GUARDIAN_ID,
        pet_id: TEST_PET_ID,
        origin_type: 'appointment',
        origin_id: LEG_BEFORE_ID,
        status: 'aberta',
        financial_status: 'open',
        deleted_at: null,
      },
    ];
  }

  return { tables };
}

describe('POST /api/hub/comandas/open — L&T anexado na comanda do pai/bloco', () => {
  it('inclui pernas pickup_route na comanda do pai', async () => {
    configureSupabaseMock(parentWithTwoLegsFixture());

    const res = await request(app).post('/api/hub/comandas/open').send({
      clinic_id: TEST_CLINIC_ID,
      origin_type: 'appointment',
      origin_id: TEST_APPOINTMENT_ID,
    });

    expect(res.status).toBe(201);
    const items = res.body.items as Array<{
      description?: string;
      line_total?: number;
      origin_id?: string | null;
    }>;
    const totals = items.reduce((s, it) => s + Number(it.line_total ?? 0), 0);
    expect(totals).toBeCloseTo(90, 2);
    expect(items.some((it) => it.origin_id === 'svc-bath-1')).toBe(true);
    expect(items.some((it) => it.origin_id === 'svc-lt-before')).toBe(true);
    expect(items.some((it) => it.origin_id === 'svc-lt-after')).toBe(true);
  });

  it('não reinclui perna que já tem comanda própria', async () => {
    configureSupabaseMock(parentWithTwoLegsFixture({ legHasOwnComanda: true }));

    const res = await request(app).post('/api/hub/comandas/open').send({
      clinic_id: TEST_CLINIC_ID,
      origin_type: 'appointment',
      origin_id: TEST_APPOINTMENT_ID,
    });

    expect(res.status).toBe(201);
    const items = res.body.items as Array<{ origin_id?: string | null; line_total?: number }>;
    expect(items.some((it) => it.origin_id === 'svc-lt-before')).toBe(false);
    expect(items.some((it) => it.origin_id === 'svc-lt-after')).toBe(true);
    expect(items.some((it) => it.origin_id === 'svc-bath-1')).toBe(true);
    const totals = items.reduce((s, it) => s + Number(it.line_total ?? 0), 0);
    expect(totals).toBeCloseTo(70, 2);
  });

  it('L&T do bloco entra na comanda do bloco, não na do avô', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyBoardingTables(),
        hub_service_types: baseServiceTypes(),
        hub_appointments: [
          {
            id: TEST_APPOINTMENT_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            pet_id: TEST_PET_ID,
            guardian_id: TEST_GUARDIAN_ID,
            starts_at: '2026-06-15T14:00:00.000Z',
            ends_at: '2026-06-15T15:00:00.000Z',
            status: 'done',
            title: 'Banho',
            hub_service_type_id: BATH_SERVICE_ID,
            appointment_kind: 'standard',
            parent_appointment_id: null,
            billing_waived_at: null,
            deleted_at: null,
          },
          {
            id: BLOCK_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            pet_id: TEST_PET_ID,
            guardian_id: TEST_GUARDIAN_ID,
            starts_at: '2026-06-15T15:30:00.000Z',
            ends_at: '2026-06-15T16:00:00.000Z',
            status: 'done',
            title: 'Consulta',
            hub_service_type_id: BLOCK_SERVICE_ID,
            appointment_kind: 'standard',
            parent_appointment_id: TEST_APPOINTMENT_ID,
            billing_waived_at: null,
            deleted_at: null,
          },
          {
            id: BLOCK_LEG_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            pet_id: TEST_PET_ID,
            guardian_id: TEST_GUARDIAN_ID,
            starts_at: '2026-06-15T16:15:00.000Z',
            ends_at: '2026-06-15T16:30:00.000Z',
            status: 'done',
            title: 'Retorno bloco',
            hub_service_type_id: LT_SERVICE_ID,
            appointment_kind: 'pickup_route',
            parent_appointment_id: BLOCK_ID,
            billing_waived_at: null,
            deleted_at: null,
          },
        ],
        hub_appointment_services: [
          {
            id: 'svc-bath-1',
            appointment_id: TEST_APPOINTMENT_ID,
            hub_service_type_id: BATH_SERVICE_ID,
            sale_amount_applied: 50,
            order_index: 0,
          },
          {
            id: 'svc-block-1',
            appointment_id: BLOCK_ID,
            hub_service_type_id: BLOCK_SERVICE_ID,
            sale_amount_applied: 120,
            order_index: 0,
          },
          {
            id: 'svc-block-lt',
            appointment_id: BLOCK_LEG_ID,
            hub_service_type_id: LT_SERVICE_ID,
            sale_amount_applied: 20,
            order_index: 0,
          },
        ],
        hub_comandas: [],
        hub_comanda_items: [],
        hub_receivables: [],
      },
    });

    const parentRes = await request(app).post('/api/hub/comandas/open').send({
      clinic_id: TEST_CLINIC_ID,
      origin_type: 'appointment',
      origin_id: TEST_APPOINTMENT_ID,
    });
    expect(parentRes.status).toBe(201);
    const parentItems = parentRes.body.items as Array<{ origin_id?: string | null }>;
    expect(parentItems.some((it) => it.origin_id === 'svc-bath-1')).toBe(true);
    expect(parentItems.some((it) => it.origin_id === 'svc-block-lt')).toBe(false);

    const blockRes = await request(app).post('/api/hub/comandas/open').send({
      clinic_id: TEST_CLINIC_ID,
      origin_type: 'appointment',
      origin_id: BLOCK_ID,
    });
    expect(blockRes.status).toBe(201);
    const blockItems = blockRes.body.items as Array<{ origin_id?: string | null; line_total?: number }>;
    expect(blockItems.some((it) => it.origin_id === 'svc-block-1')).toBe(true);
    expect(blockItems.some((it) => it.origin_id === 'svc-block-lt')).toBe(true);
    const blockTotal = blockItems.reduce((s, it) => s + Number(it.line_total ?? 0), 0);
    expect(blockTotal).toBeCloseTo(140, 2);
  });
});
