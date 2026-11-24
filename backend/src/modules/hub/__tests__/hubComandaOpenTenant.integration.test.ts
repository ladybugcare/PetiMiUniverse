/**
 * Isolamento multi-tenant — POST /comandas/open (manual/package) e POST /comandas/:id/items.
 * Cobertura: T1–T10, R1–R5, P1 (permissão).
 */
jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule(),
);

import request from 'supertest';
import app from '../../../app';
import {
  configureAuthMock,
  resetAuthMock,
} from '../../../__tests__/helpers/authTestDouble';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import { betaClinicSubscription } from '../../../__tests__/helpers/fixtures/hubSubscription';

const CLINIC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLINIC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PET_A = '11111111-1111-4111-8111-111111111111';
const PET_B = '22222222-2222-4222-8222-222222222222';
const PET_A_UNLINKED = '12121212-1212-4121-8121-121212121212';
const GUARDIAN_A = '33333333-3333-4333-8333-333333333333';
const GUARDIAN_B = '44444444-4444-4444-8444-444444444444';
const GUARDIAN_A_DELETED = '35353535-3535-4353-8353-353535353535';
const UNIT_A = '77777777-7777-4777-8777-777777777777';
const UNIT_B = '88888888-8888-4888-8888-888888888888';
const ENCOUNTER_B = '99999999-9999-4999-8999-999999999999';
const APPT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const SERVICE_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
const PACKAGE_A = 'cccccccc-cccc-4ccc-8ccc-cccccccc0001';
const COMANDA_A = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001';

function clinicSettings(clinicId: string) {
  return {
    clinic_id: clinicId,
    accepted_payment_methods: [
      'pix',
      'cash',
      'credit_card',
      'debit_card',
      'transfer',
      'payment_link',
      'customer_credit',
    ],
  };
}

function baseTables(extra: Record<string, unknown[]> = {}) {
  return {
    clinic_hub_subscriptions: [betaClinicSubscription(CLINIC_A)],
    hub_clinic_settings: [clinicSettings(CLINIC_A)],
    units: [
      { id: UNIT_A, clinic_id: CLINIC_A, is_main: true, name: 'Matriz A' },
      { id: UNIT_B, clinic_id: CLINIC_B, is_main: true, name: 'Matriz B' },
    ],
    hub_guardians: [
      { id: GUARDIAN_A, clinic_id: CLINIC_A, full_name: 'Tutor A', phone: null, email: null, deleted_at: null },
      { id: GUARDIAN_B, clinic_id: CLINIC_B, full_name: 'Tutor B', phone: null, email: null, deleted_at: null },
      {
        id: GUARDIAN_A_DELETED,
        clinic_id: CLINIC_A,
        full_name: 'Tutor Arquivado',
        phone: null,
        email: null,
        deleted_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    hub_pets: [
      { id: PET_A, clinic_id: CLINIC_A, name: 'Rex', deleted_at: null },
      { id: PET_A_UNLINKED, clinic_id: CLINIC_A, name: 'Sem Vínculo', deleted_at: null },
      { id: PET_B, clinic_id: CLINIC_B, name: 'Outro', deleted_at: null },
    ],
    hub_pet_guardians: [{ id: 'pg-1', pet_id: PET_A, guardian_id: GUARDIAN_A, role: 'primary' }],
    hub_comandas: [] as Record<string, unknown>[],
    hub_comanda_items: [] as Record<string, unknown>[],
    hub_comanda_events: [] as Record<string, unknown>[],
    hub_receivables: [] as Record<string, unknown>[],
    hub_receivable_lines: [] as Record<string, unknown>[],
    hub_payments: [] as Record<string, unknown>[],
    hub_appointments: [] as Record<string, unknown>[],
    hub_appointment_services: [] as Record<string, unknown>[],
    hub_service_types: [
      {
        id: SERVICE_A,
        clinic_id: CLINIC_A,
        name: 'Consulta',
        service_group: 'clinica',
        sale_amount: 100,
        active: true,
        deleted_at: null,
      },
    ],
    hub_packages: [
      {
        id: PACKAGE_A,
        clinic_id: CLINIC_A,
        name: 'Pacote 5',
        hub_service_type_id: SERVICE_A,
        sessions_total: 5,
        price: 200,
        validity_days: 90,
        active: true,
        package_kind: 'single',
        pricing_mode: 'manual',
        catalog_subtotal: 250,
        discount_amount: 0,
        discount_percent: null,
        notes: null,
      },
    ],
    hub_package_items: [
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
        clinic_id: CLINIC_A,
        package_id: PACKAGE_A,
        hub_service_type_id: SERVICE_A,
        quantity: 5,
        sort_order: 0,
      },
    ],
    hub_customer_package_balances: [] as Record<string, unknown>[],
    hub_package_redemptions: [] as Record<string, unknown>[],
    hub_encounters: [
      {
        id: ENCOUNTER_B,
        clinic_id: CLINIC_B,
        pet_id: PET_B,
        guardian_id: GUARDIAN_B,
        status: 'completed',
        hub_case_id: null,
        deleted_at: null,
      },
    ],
    hub_clinical_cases: [] as Record<string, unknown>[],
    hub_grooming_sessions: [] as Record<string, unknown>[],
    hub_boarding_reservations: [] as Record<string, unknown>[],
    hub_quotes: [] as Record<string, unknown>[],
    ...extra,
  };
}

function openManual(body: Record<string, unknown>) {
  return request(app).post('/api/hub/comandas/open').send({
    clinic_id: CLINIC_A,
    origin_type: 'manual',
    unit_id: UNIT_A,
    manual_lines: [],
    ...body,
  });
}

function countComandas(): number {
  return (getMockSupabaseClient()._state.tables.hub_comandas ?? []).length;
}

function countItems(): number {
  return (getMockSupabaseClient()._state.tables.hub_comanda_items ?? []).length;
}

describe('Tenant isolation — abertura de comanda / add items', () => {
  afterEach(() => {
    resetAuthMock();
  });

  beforeEach(() => {
    configureAuthMock({ checkPermission: async () => true });
    configureSupabaseMock({ tables: baseTables() });
  });

  // ─── T1–T10 ───────────────────────────────────────────────────────────────

  it('T1: open manual com tutor de outra clínica → 400 e sem insert', async () => {
    const res = await openManual({ guardian_id: GUARDIAN_B });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Tutor inválido/i);
    expect(countComandas()).toBe(0);
  });

  it('T2: open manual com pet de outra clínica → 400', async () => {
    const res = await openManual({ pet_id: PET_B });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pet inválido/i);
    expect(countComandas()).toBe(0);
  });

  it('T3: open manual com unidade de outra clínica → 400', async () => {
    const res = await openManual({ unit_id: UNIT_B });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unidade inválida/i);
    expect(countComandas()).toBe(0);
  });

  it('T4: open manual com tutor A + pet B → 400', async () => {
    const res = await openManual({ guardian_id: GUARDIAN_A, pet_id: PET_B });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/inválid/i);
    expect(countComandas()).toBe(0);
  });

  it('T5: open manual com tutor e pet da clínica sem vínculo → 400', async () => {
    const res = await openManual({ guardian_id: GUARDIAN_A, pet_id: PET_A_UNLINKED });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Tutor inválido/i);
    expect(countComandas()).toBe(0);
  });

  it('T6: open manual com manual_lines[].pet_id de outra clínica → 400', async () => {
    const res = await openManual({
      guardian_id: GUARDIAN_A,
      pet_id: PET_A,
      manual_lines: [
        {
          description: 'Serviço avulso',
          unit_amount: 50,
          quantity: 1,
          pet_id: PET_B,
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pet inválido/i);
    expect(countComandas()).toBe(0);
  });

  it('T7: open package com guardian de outra clínica → 400', async () => {
    const res = await request(app).post('/api/hub/comandas/open').send({
      clinic_id: CLINIC_A,
      origin_type: 'package',
      guardian_id: GUARDIAN_B,
      unit_id: UNIT_A,
      package_id: PACKAGE_A,
      pet_id: PET_A,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Tutor inválido/i);
    expect(countComandas()).toBe(0);
  });

  it('T8: open package com pet de outra clínica → 400', async () => {
    const res = await request(app).post('/api/hub/comandas/open').send({
      clinic_id: CLINIC_A,
      origin_type: 'package',
      guardian_id: GUARDIAN_A,
      unit_id: UNIT_A,
      package_id: PACKAGE_A,
      pet_id: PET_B,
    });
    // Assert tenant (400) ou builder PET_NOT_FOUND (404) — ambos bloqueiam escrita.
    expect([400, 404]).toContain(res.status);
    expect(countComandas()).toBe(0);
  });

  it('T9: open manual com hub_encounter_id de outra clínica → 400', async () => {
    const res = await openManual({
      guardian_id: GUARDIAN_A,
      pet_id: PET_A,
      hub_encounter_id: ENCOUNTER_B,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Atendimento inválido/i);
    expect(countComandas()).toBe(0);
  });

  it('T10: add items com pet_id de outra clínica → 400 e sem insert parcial', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_comandas: [
          {
            id: COMANDA_A,
            clinic_id: CLINIC_A,
            unit_id: UNIT_A,
            guardian_id: GUARDIAN_A,
            pet_id: PET_A,
            origin_type: 'manual',
            origin_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0099',
            status: 'aberta',
            financial_status: 'open',
            subtotal_amount: 0,
            discount_amount: 0,
            total_amount: 0,
            deleted_at: null,
            finance_handoff_at: null,
          },
        ],
      }),
    });

    const before = countItems();
    const res = await request(app).post(`/api/hub/comandas/${COMANDA_A}/items`).send({
      clinic_id: CLINIC_A,
      items: [
        {
          description: 'Item ok',
          quantity: 1,
          unit_amount: 10,
          item_kind: 'service',
          pet_id: PET_A,
        },
        {
          description: 'Item cross-tenant',
          quantity: 1,
          unit_amount: 20,
          item_kind: 'service',
          pet_id: PET_B,
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pet inválido/i);
    expect(countItems()).toBe(before);
  });

  // ─── Regressões R1–R5 ─────────────────────────────────────────────────────

  it('R1: venda avulsa sem tutor/pet → 201', async () => {
    const res = await openManual({});
    expect(res.status).toBe(201);
    expect(res.body.comanda?.guardian_id == null).toBe(true);
    expect(res.body.comanda?.pet_id == null).toBe(true);
    expect(countComandas()).toBe(1);
  });

  it('R2: manual com tutor+pet vinculados → 201', async () => {
    const res = await openManual({ guardian_id: GUARDIAN_A, pet_id: PET_A });
    expect(res.status).toBe(201);
    expect(res.body.comanda?.guardian_id).toBe(GUARDIAN_A);
    expect(res.body.comanda?.pet_id).toBe(PET_A);
  });

  it('R3: manual com manual_lines e pets válidos → 201', async () => {
    const res = await openManual({
      guardian_id: GUARDIAN_A,
      pet_id: PET_A,
      manual_lines: [
        {
          description: 'Banho avulso',
          unit_amount: 80,
          quantity: 1,
          pet_id: PET_A,
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(countItems()).toBe(1);
    expect(res.body.comanda?.total_amount).toBe(80);
  });

  it('R4: open por appointment da mesma clínica não regride', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_appointments: [
          {
            id: APPT_A,
            clinic_id: CLINIC_A,
            unit_id: UNIT_A,
            pet_id: PET_A,
            guardian_id: GUARDIAN_A,
            starts_at: '2026-06-15T14:00:00.000Z',
            ends_at: '2026-06-15T15:00:00.000Z',
            status: 'done',
            title: 'Consulta',
            hub_service_type_id: SERVICE_A,
            billing_waived_at: null,
            deleted_at: null,
          },
        ],
        hub_appointment_services: [
          {
            id: 'ffffffff-ffff-4fff-8fff-ffffffffff01',
            appointment_id: APPT_A,
            hub_service_type_id: SERVICE_A,
            sale_amount_applied: 100,
            order_index: 0,
          },
        ],
      }),
    });

    const res = await request(app).post('/api/hub/comandas/open').send({
      clinic_id: CLINIC_A,
      origin_type: 'appointment',
      origin_id: APPT_A,
    });
    expect(res.status).toBe(201);
    expect(res.body.comanda?.origin_type).toBe('appointment');
    expect(res.body.comanda?.guardian_id).toBe(GUARDIAN_A);
  });

  it('R5: tutor soft-deleted da mesma clínica → 400', async () => {
    const res = await openManual({ guardian_id: GUARDIAN_A_DELETED, pet_id: PET_A });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Tutor inválido/i);
    expect(countComandas()).toBe(0);
  });

  // ─── Permissão ────────────────────────────────────────────────────────────

  it('P1: sem hub.receivables.create → 403 (middleware)', async () => {
    configureAuthMock({
      checkPermission: async (_userId, _clinicId, permission) => permission !== 'hub.receivables.create',
    });
    const res = await openManual({ guardian_id: GUARDIAN_A, pet_id: PET_A });
    expect(res.status).toBe(403);
    expect(countComandas()).toBe(0);
  });

  it('add items: pet default da comanda + item sem pet_id com tutor vinculado → 201', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_comandas: [
          {
            id: COMANDA_A,
            clinic_id: CLINIC_A,
            unit_id: UNIT_A,
            guardian_id: GUARDIAN_A,
            pet_id: PET_A,
            origin_type: 'manual',
            origin_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0098',
            status: 'aberta',
            financial_status: 'open',
            subtotal_amount: 0,
            discount_amount: 0,
            total_amount: 0,
            deleted_at: null,
            finance_handoff_at: null,
          },
        ],
      }),
    });

    const res = await request(app).post(`/api/hub/comandas/${COMANDA_A}/items`).send({
      clinic_id: CLINIC_A,
      items: [
        {
          description: 'Usa pet default',
          quantity: 1,
          unit_amount: 15,
          item_kind: 'service',
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(countItems()).toBe(1);
  });

  it('add items: pet efetivo sem vínculo com tutor da comanda → 400', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_comandas: [
          {
            id: COMANDA_A,
            clinic_id: CLINIC_A,
            unit_id: UNIT_A,
            guardian_id: GUARDIAN_A,
            pet_id: PET_A,
            origin_type: 'manual',
            origin_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0097',
            status: 'aberta',
            financial_status: 'open',
            subtotal_amount: 0,
            discount_amount: 0,
            total_amount: 0,
            deleted_at: null,
            finance_handoff_at: null,
          },
        ],
      }),
    });

    const res = await request(app).post(`/api/hub/comandas/${COMANDA_A}/items`).send({
      clinic_id: CLINIC_A,
      items: [
        {
          description: 'Pet sem vínculo',
          quantity: 1,
          unit_amount: 15,
          item_kind: 'service',
          pet_id: PET_A_UNLINKED,
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Tutor inválido/i);
    expect(countItems()).toBe(0);
  });
});
