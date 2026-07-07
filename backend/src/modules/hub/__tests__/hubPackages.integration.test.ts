jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
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
