jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureAuthMock, resetAuthMock } from '../../../__tests__/helpers/authTestDouble';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import { hasPermission } from '../../../utils/permissions';
import { betaClinicSubscription } from '../../../__tests__/helpers/fixtures/hubSubscription';
import {
  addonServiceType,
  bathServiceType,
  daycareServiceType,
  emptyPackageTables,
  hubPackageItemRow,
  hubPackageItemRow2,
  hubPackageRow,
  hubPackageRow2,
  TEST_ADDON_SERVICE_TYPE_ID,
  TEST_CLINIC_ID,
  TEST_GUARDIAN_ID,
  TEST_PACKAGE_ID,
  TEST_PACKAGE_ID_2,
  TEST_PET_ID,
  TEST_PET_ID_2,
  TEST_SERVICE_TYPE_ID,
  TEST_UNIT_ID,
} from '../../../__tests__/helpers/fixtures/packages';

const BALANCE_ID = '88888888-8888-4888-8888-888888888888';
const RECEIVABLE_ID = '33333333-3333-4333-8333-333333333301';

describe('Pacotes — API', () => {
  it('POST /finance/packages/suggest-price calcula subtotal do catálogo', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyPackageTables(),
        hub_service_types: [bathServiceType()],
      },
    });

    const res = await request(app)
      .post('/api/hub/finance/packages/suggest-price')
      .send({
        clinic_id: TEST_CLINIC_ID,
        items: [{ hub_service_type_id: TEST_SERVICE_TYPE_ID, quantity: 10 }],
        discount_amount: 100,
      });

    expect(res.status).toBe(200);
    expect(res.body.catalog_subtotal).toBe(600);
    expect(res.body.suggested_price).toBe(500);
  });

  it('POST /finance/packages/suggest-price aceita adicionais na composição', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyPackageTables(),
        hub_service_types: [bathServiceType(), addonServiceType()],
      },
    });

    const res = await request(app)
      .post('/api/hub/finance/packages/suggest-price')
      .send({
        clinic_id: TEST_CLINIC_ID,
        items: [
          { hub_service_type_id: TEST_SERVICE_TYPE_ID, quantity: 5 },
          { hub_service_type_id: TEST_ADDON_SERVICE_TYPE_ID, quantity: 3 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.catalog_subtotal).toBe(375);
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines.find((l: { hub_service_type_id: string }) => l.hub_service_type_id === TEST_ADDON_SERVICE_TYPE_ID)).toMatchObject({
      is_addon: true,
      service_name: 'Hidratação',
      line_total: 75,
    });
  });

  it('POST /finance/packages cria pacote com itens', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyPackageTables(),
        hub_service_types: [bathServiceType()],
      },
    });

    const res = await request(app)
      .post('/api/hub/finance/packages')
      .send({
        clinic_id: TEST_CLINIC_ID,
        name: 'Combo Banho',
        items: [{ hub_service_type_id: TEST_SERVICE_TYPE_ID, quantity: 5 }],
        pricing_mode: 'catalog_sum',
        discount_percent: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.package?.name).toBe('Combo Banho');
    expect(res.body.package?.items?.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /comandas/open package abre comanda de venda', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyPackageTables(),
        hub_service_types: [bathServiceType()],
        hub_packages: [hubPackageRow()],
        hub_package_items: [hubPackageItemRow()],
      },
    });

    const res = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'package',
        package_id: TEST_PACKAGE_ID,
        guardian_id: TEST_GUARDIAN_ID,
        pet_id: TEST_PET_ID,
        unit_id: TEST_UNIT_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.comanda?.origin_type).toBe('package');
    expect((res.body.items as Array<{ description?: string }>)[0]?.description).toMatch(/Pacote/);
  });

  it('POST /comandas/open package com pet_ids cria uma linha por pet', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyPackageTables(),
        hub_service_types: [bathServiceType()],
        hub_packages: [hubPackageRow()],
        hub_package_items: [hubPackageItemRow()],
      },
    });

    const res = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'package',
        package_id: TEST_PACKAGE_ID,
        guardian_id: TEST_GUARDIAN_ID,
        pet_ids: [TEST_PET_ID, TEST_PET_ID_2],
        unit_id: TEST_UNIT_ID,
      });

    expect(res.status).toBe(201);
    const items = res.body.items as Array<{ description?: string; pet_id?: string; line_total?: number }>;
    expect(items).toHaveLength(2);
    expect(items.map((it) => it.pet_id).sort()).toEqual([TEST_PET_ID, TEST_PET_ID_2].sort());
    expect(items[0]?.description).toMatch(/Atum|Mel/);
    expect(items[0]?.line_total).toBe(500);
    expect(res.body.comanda?.total_amount).toBe(1000);
  });

  it('POST /comandas/open package com package_lines cria linhas mistas (mesmo pet, pacotes diferentes)', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyPackageTables(),
        hub_service_types: [bathServiceType(), daycareServiceType()],
        hub_packages: [hubPackageRow(), hubPackageRow2()],
        hub_package_items: [hubPackageItemRow(), hubPackageItemRow2()],
      },
    });

    const res = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'package',
        guardian_id: TEST_GUARDIAN_ID,
        unit_id: TEST_UNIT_ID,
        package_lines: [
          { package_id: TEST_PACKAGE_ID, pet_id: TEST_PET_ID },
          { package_id: TEST_PACKAGE_ID_2, pet_id: TEST_PET_ID },
        ],
      });

    expect(res.status).toBe(201);
    const items = res.body.items as Array<{ description?: string; pet_id?: string; line_total?: number; origin_id?: string }>;
    expect(items).toHaveLength(2);
    expect(items.every((it) => it.pet_id === TEST_PET_ID)).toBe(true);
    expect(items.map((it) => it.origin_id).sort()).toEqual([TEST_PACKAGE_ID, TEST_PACKAGE_ID_2].sort());
    expect(res.body.comanda?.total_amount).toBe(700);
  });

  it('POST /comandas/open package com package_lines cria pacotes diferentes por pet', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyPackageTables(),
        hub_service_types: [bathServiceType(), daycareServiceType()],
        hub_packages: [hubPackageRow(), hubPackageRow2()],
        hub_package_items: [hubPackageItemRow(), hubPackageItemRow2()],
      },
    });

    const res = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'package',
        guardian_id: TEST_GUARDIAN_ID,
        unit_id: TEST_UNIT_ID,
        package_lines: [
          { package_id: TEST_PACKAGE_ID, pet_id: TEST_PET_ID },
          { package_id: TEST_PACKAGE_ID_2, pet_id: TEST_PET_ID_2 },
        ],
      });

    expect(res.status).toBe(201);
    const items = res.body.items as Array<{ pet_id?: string; origin_id?: string; line_total?: number }>;
    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pet_id: TEST_PET_ID, origin_id: TEST_PACKAGE_ID, line_total: 500 }),
        expect.objectContaining({ pet_id: TEST_PET_ID_2, origin_id: TEST_PACKAGE_ID_2, line_total: 200 }),
      ]),
    );
    expect(res.body.comanda?.total_amount).toBe(700);
  });

  it('POST /comandas/open package rejeita package_lines duplicado (mesmo pet + pacote)', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyPackageTables(),
        hub_service_types: [bathServiceType()],
        hub_packages: [hubPackageRow()],
        hub_package_items: [hubPackageItemRow()],
      },
    });

    const res = await request(app)
      .post('/api/hub/comandas/open')
      .send({
        clinic_id: TEST_CLINIC_ID,
        origin_type: 'package',
        guardian_id: TEST_GUARDIAN_ID,
        unit_id: TEST_UNIT_ID,
        package_lines: [
          { package_id: TEST_PACKAGE_ID, pet_id: TEST_PET_ID },
          { package_id: TEST_PACKAGE_ID, pet_id: TEST_PET_ID },
        ],
      });

    expect(res.status).toBe(400);
  });

  it('GET /pets/:id/package-balances lista saldos ativos', async () => {
    configureSupabaseMock({
      tables: {
        ...emptyPackageTables(),
        hub_packages: [hubPackageRow()],
        hub_customer_package_balances: [
          {
            id: '88888888-8888-4888-8888-888888888888',
            clinic_id: TEST_CLINIC_ID,
            guardian_id: TEST_GUARDIAN_ID,
            pet_id: TEST_PET_ID,
            package_id: TEST_PACKAGE_ID,
            hub_service_type_id: TEST_SERVICE_TYPE_ID,
            sessions_remaining: 8,
            sessions_total: 10,
            status: 'active',
            expires_at: '2099-12-31',
            purchased_at: new Date().toISOString(),
            hub_packages: { id: TEST_PACKAGE_ID, name: 'Pacote 10 banhos' },
            hub_service_types: { id: TEST_SERVICE_TYPE_ID, name: 'Banho P' },
          },
          {
            id: '88888888-8888-4888-8888-888888888889',
            clinic_id: TEST_CLINIC_ID,
            guardian_id: TEST_GUARDIAN_ID,
            pet_id: TEST_PET_ID,
            package_id: TEST_PACKAGE_ID,
            hub_service_type_id: TEST_SERVICE_TYPE_ID,
            sessions_remaining: 5,
            sessions_total: 5,
            status: 'pending',
            expires_at: '2099-12-31',
            purchased_at: new Date().toISOString(),
            hub_packages: { id: TEST_PACKAGE_ID, name: 'Pacote 10 banhos' },
            hub_service_types: { id: TEST_SERVICE_TYPE_ID, name: 'Banho P' },
          },
        ],
      },
    });

    const res = await request(app)
      .get(`/api/hub/pets/${TEST_PET_ID}/package-balances`)
      .query({ clinic_id: TEST_CLINIC_ID });

    expect(res.status).toBe(200);
    expect(res.body.balances?.length).toBe(1);
    expect(res.body.balances[0].sessions_remaining).toBe(8);
  });
});

describe('Pacotes — cancel comercial ≠ estorno', () => {
  afterEach(() => resetAuthMock());

  beforeEach(() => {
    configureAuthMock({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'cfinance@test.com', role: 'CFINANCE' },
      checkPermission: (_u, _c, permission) => hasPermission('CFINANCE', permission),
    });
  });

  function packageFinanceTables(extra: Record<string, unknown[]> = {}) {
    return {
      ...emptyPackageTables(),
      clinic_hub_subscriptions: [betaClinicSubscription(TEST_CLINIC_ID)],
      hub_packages: [hubPackageRow()],
      hub_receivables: [
        {
          id: RECEIVABLE_ID,
          clinic_id: TEST_CLINIC_ID,
          unit_id: TEST_UNIT_ID,
          final_amount: 500,
          status: 'paid',
          deleted_at: null,
        },
      ],
      hub_payments: [
        {
          id: '44444444-4444-4444-8444-444444444401',
          clinic_id: TEST_CLINIC_ID,
          receivable_id: RECEIVABLE_ID,
          amount: 500,
          payment_method: 'pix',
          status: 'posted',
        },
      ],
      hub_financial_adjustments: [] as Record<string, unknown>[],
      hub_customer_package_balances: [
        {
          id: BALANCE_ID,
          clinic_id: TEST_CLINIC_ID,
          guardian_id: TEST_GUARDIAN_ID,
          pet_id: TEST_PET_ID,
          package_id: TEST_PACKAGE_ID,
          hub_service_type_id: TEST_SERVICE_TYPE_ID,
          sessions_remaining: 7,
          sessions_total: 10,
          status: 'active',
          purchased_receivable_id: RECEIVABLE_ID,
          expires_at: '2099-12-31',
          purchased_at: new Date().toISOString(),
        },
      ],
      hub_package_redemptions: [
        {
          id: '99999999-9999-4999-8999-999999999901',
          balance_id: BALANCE_ID,
          clinic_id: TEST_CLINIC_ID,
          reversed_at: null,
        },
        {
          id: '99999999-9999-4999-8999-999999999902',
          balance_id: BALANCE_ID,
          clinic_id: TEST_CLINIC_ID,
          reversed_at: null,
        },
        {
          id: '99999999-9999-4999-8999-999999999903',
          balance_id: BALANCE_ID,
          clinic_id: TEST_CLINIC_ID,
          reversed_at: null,
        },
      ],
      ...extra,
    };
  }

  it('cancel comercial zera restantes, preserva redemptions e não mexe no recebível', async () => {
    configureSupabaseMock({ tables: packageFinanceTables() });

    const res = await request(app)
      .post(`/api/hub/finance/package-balances/${BALANCE_ID}/cancel`)
      .send({ clinic_id: TEST_CLINIC_ID, reason: 'Tutor desistiu do restante' });

    expect(res.status).toBe(200);
    expect(res.body.balance.status).toBe('cancelled');
    expect(Number(res.body.balance.sessions_remaining)).toBe(0);
    expect(Number(res.body.balance.sessions_remaining_at_cancel)).toBe(7);

    const redemptions = getMockSupabaseClient()._state.tables.hub_package_redemptions ?? [];
    expect(redemptions.filter((r) => r.reversed_at == null)).toHaveLength(3);

    const rec = (getMockSupabaseClient()._state.tables.hub_receivables ?? [])[0];
    expect(rec.status).toBe('paid');
  });

  it('refund-preview sugere proporcional aos restantes; authorize parcial cria adjustment', async () => {
    configureSupabaseMock({
      tables: packageFinanceTables({
        hub_customer_package_balances: [
          {
            id: BALANCE_ID,
            clinic_id: TEST_CLINIC_ID,
            guardian_id: TEST_GUARDIAN_ID,
            pet_id: TEST_PET_ID,
            package_id: TEST_PACKAGE_ID,
            hub_service_type_id: TEST_SERVICE_TYPE_ID,
            sessions_remaining: 0,
            sessions_total: 10,
            sessions_remaining_at_cancel: 7,
            status: 'cancelled',
            purchased_receivable_id: RECEIVABLE_ID,
            cancelled_at: new Date().toISOString(),
            cancel_reason: 'desistência',
          },
        ],
      }),
    });

    const preview = await request(app)
      .get(`/api/hub/finance/package-balances/${BALANCE_ID}/refund-preview`)
      .query({ clinic_id: TEST_CLINIC_ID });
    expect(preview.status).toBe(200);
    expect(preview.body.preview.sessions_total).toBe(10);
    expect(preview.body.preview.sessions_consumed).toBe(3);
    expect(Number(preview.body.preview.suggested_refund)).toBe(350);

    const refund = await request(app)
      .post(`/api/hub/finance/package-balances/${BALANCE_ID}/refund`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        refund_amount: 200,
        reason: 'Reembolso parcial autorizado',
      });
    expect(refund.status).toBe(201);
    expect(Number(refund.body.adjustment.amount)).toBe(200);

    const adjustments = getMockSupabaseClient()._state.tables.hub_financial_adjustments ?? [];
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].adjustment_type).toBe('refund');

    const redemptions = getMockSupabaseClient()._state.tables.hub_package_redemptions ?? [];
    expect(redemptions.filter((r) => r.reversed_at == null)).toHaveLength(3);

    const payments = getMockSupabaseClient()._state.tables.hub_payments ?? [];
    expect(payments[0].status).toBe('posted');
  });

  it('estorno sem cancel comercial → 409', async () => {
    configureSupabaseMock({ tables: packageFinanceTables() });

    const refund = await request(app)
      .post(`/api/hub/finance/package-balances/${BALANCE_ID}/refund`)
      .send({
        clinic_id: TEST_CLINIC_ID,
        refund_amount: 100,
        reason: 'Tentativa sem cancel',
      });
    expect(refund.status).toBe(409);
  });
});
