/**
 * Reembolso financeiro ≠ devolução física.
 * Reentrada só com confirm_stock_return + condição; unsellable audita sem aumentar disponível.
 */
jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule(),
);

import request from 'supertest';
import app from '../../../app';
import { configureAuthMock, resetAuthMock } from '../../../__tests__/helpers/authTestDouble';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import { hasPermission } from '../../../utils/permissions';
import { betaClinicSubscription } from '../../../__tests__/helpers/fixtures/hubSubscription';
import { RECEIVABLE_PRODUCT_RESTOCK_REF } from '../hubInventoryStockUtils';

const TEST_CLINIC_ID = '11111111-1111-4111-8111-111111111103';
const TEST_UNIT_ID = '22222222-2222-4222-8222-222222222203';
const RECEIVABLE_ID = '33333333-3333-4333-8333-333333333303';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444403';
const PAYMENT_PARTIAL_ID = '44444444-4444-4444-8444-444444444404';
const LINE_ID = '66666666-6666-4666-8666-666666666603';
const LINE_ID_2 = '66666666-6666-4666-8666-666666666604';
const ITEM_ID = '77777777-7777-4777-8777-777777777703';
const ITEM_ID_2 = '77777777-7777-4777-8777-777777777704';
const LOT_ID = '88888888-8888-4888-8888-888888888803';
const LOT_ID_2 = '88888888-8888-4888-8888-888888888804';

function restockIns(lineId = LINE_ID) {
  return (getMockSupabaseClient()._state.tables.hub_stock_movements ?? []).filter(
    (m) =>
      m.movement_type === 'adjustment_in' &&
      m.reference_type === RECEIVABLE_PRODUCT_RESTOCK_REF &&
      m.reference_id === lineId,
  );
}

function returnEvents() {
  return getMockSupabaseClient()._state.tables.hub_product_return_events ?? [];
}

function productLine(overrides: Record<string, unknown> = {}) {
  return {
    id: LINE_ID,
    clinic_id: TEST_CLINIC_ID,
    receivable_id: RECEIVABLE_ID,
    line_kind: 'product',
    hub_inventory_item_id: ITEM_ID,
    hub_inventory_lot_id: LOT_ID,
    quantity: 2,
    line_total: 45,
    unit_cost_amount: 10,
    description: 'Coleira',
    ...overrides,
  };
}

function baseTables(extra: Record<string, unknown[]> = {}) {
  return {
    clinic_hub_subscriptions: [betaClinicSubscription(TEST_CLINIC_ID)],
    hub_clinic_settings: [
      {
        clinic_id: TEST_CLINIC_ID,
        accepted_payment_methods: ['pix', 'cash', 'customer_credit'],
      },
    ],
    hub_receivables: [
      {
        id: RECEIVABLE_ID,
        clinic_id: TEST_CLINIC_ID,
        unit_id: TEST_UNIT_ID,
        comanda_id: null,
        guardian_id: null,
        final_amount: 45,
        original_amount: 45,
        net_amount_at_sale: 45,
        returned_amount: 0,
        status: 'paid',
        deleted_at: null,
      },
    ],
    hub_receivable_lines: [productLine()],
    hub_payments: [
      {
        id: PAYMENT_ID,
        clinic_id: TEST_CLINIC_ID,
        receivable_id: RECEIVABLE_ID,
        amount: 45,
        payment_method: 'pix',
        status: 'posted',
        posting_kind: 'operational',
        cash_session_id: null,
      },
    ],
    hub_financial_adjustments: [],
    hub_financial_adjustment_lines: [],
    hub_product_return_requests: [],
    hub_product_return_events: [],
    hub_customer_credit_movements: [],
    hub_cash_movements: [],
    hub_stock_movements: [
      {
        id: '99999999-9999-4999-8999-999999999903',
        clinic_id: TEST_CLINIC_ID,
        item_id: ITEM_ID,
        lot_id: LOT_ID,
        movement_type: 'sale_out',
        qty: 2,
        reference_type: 'hub_receivable_line',
        reference_id: LINE_ID,
      },
    ],
    hub_comandas: [],
    hub_cash_sessions: [],
    hub_charge_bundles: [],
    hub_charge_bundle_items: [],
    hub_customer_package_balances: [],
    hub_package_redemptions: [],
    hub_appointments: [],
    hub_inventory_items: [
      { id: ITEM_ID, clinic_id: TEST_CLINIC_ID, name: 'Coleira', deleted_at: null, active: true, cost_amount: 10 },
      { id: ITEM_ID_2, clinic_id: TEST_CLINIC_ID, name: 'Shampoo', deleted_at: null, active: true, cost_amount: 5 },
    ],
    hub_inventory_lots: [
      { id: LOT_ID, clinic_id: TEST_CLINIC_ID, item_id: ITEM_ID, lot_code: 'L1' },
      { id: LOT_ID_2, clinic_id: TEST_CLINIC_ID, item_id: ITEM_ID_2, lot_code: 'L2' },
    ],
    ...extra,
  };
}

describe('Finance refund ↔ estoque (sem reentrada automática)', () => {
  afterEach(() => resetAuthMock());

  beforeEach(() => {
    configureAuthMock({
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'cfinance@test.com', role: 'CFINANCE' },
      checkPermission: (_u, _c, permission) => hasPermission('CFINANCE', permission),
    });
    configureSupabaseMock({ tables: baseTables() });
  });

  it('1) reembolso sem confirmação: estoque inalterado', async () => {
    const res = await request(app).post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Devolução de dinheiro ao cliente',
      mode: 'refund',
      refund_method: 'pix',
      refund_effective_date: '2026-06-16',
    });
    expect(res.status).toBe(200);
    expect(res.body.receivable_status).toBe('refunded');
    expect(res.body.stock_restored ?? 0).toBe(0);
    expect(String(res.body.warning ?? '')).toMatch(/Estoque não foi alterado/i);
    expect(restockIns()).toHaveLength(0);
    expect(returnEvents()).toHaveLength(0);
  });

  it('2) cancelamento sem confirmação: estoque inalterado', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            comanda_id: null,
            guardian_id: null,
            final_amount: 45,
            status: 'pending',
            deleted_at: null,
            original_amount: 45,
          },
        ],
        hub_payments: [],
      }),
    });

    const res = await request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/cancel`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Venda cancelada no balcão',
    });
    expect(res.status).toBe(200);
    expect(res.body.stock_restored ?? 0).toBe(0);
    expect(String(res.body.warning ?? '')).toMatch(/não presume devolução física/i);
    expect(restockIns()).toHaveLength(0);
  });

  it('3) devolução revendável: quantidade retorna corretamente', async () => {
    const res = await request(app).post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Cliente devolveu o produto em condições de revenda',
      mode: 'refund',
      refund_method: 'pix',
      refund_effective_date: '2026-06-16',
      confirm_stock_return: true,
      stock_return_condition: 'sellable',
    });
    expect(res.status).toBe(200);
    expect(res.body.receivable_status).toBe('refunded');
    expect(res.body.stock_restored).toBe(1);
    expect(restockIns()).toHaveLength(1);
    expect(restockIns()[0].qty).toBe(2);
    expect(returnEvents()).toHaveLength(1);
    expect(returnEvents()[0].condition).toBe('sellable');
  });

  it('4) devolução não revendável: registro auditável, sem aumento do disponível', async () => {
    const res = await request(app).post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Produto devolvido danificado',
      mode: 'refund',
      refund_method: 'pix',
      refund_effective_date: '2026-06-16',
      confirm_stock_return: true,
      stock_return_condition: 'unsellable',
    });
    expect(res.status).toBe(200);
    expect(res.body.stock_restored ?? 0).toBe(0);
    expect(res.body.stock_unsellable).toBe(1);
    expect(restockIns()).toHaveLength(0);
    expect(returnEvents()).toHaveLength(1);
    expect(returnEvents()[0].condition).toBe('unsellable');
    expect(returnEvents()[0].qty).toBe(2);
  });

  it('5) repetição sequencial: nenhuma duplicidade', async () => {
    const first = await request(app).post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Cliente devolveu o produto',
      mode: 'refund',
      refund_method: 'pix',
      refund_effective_date: '2026-06-16',
      confirm_stock_return: true,
      stock_return_condition: 'sellable',
    });
    expect(first.status).toBe(200);
    expect(first.body.stock_restored).toBe(1);

    configureSupabaseMock({
      tables: baseTables({
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            comanda_id: null,
            guardian_id: null,
            final_amount: 45,
            status: 'pending',
            deleted_at: null,
            original_amount: 45,
          },
        ],
        hub_payments: [],
        hub_product_return_events: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            receivable_line_id: LINE_ID,
            item_id: ITEM_ID,
            lot_id: LOT_ID,
            qty: 2,
            condition: 'sellable',
          },
        ],
        hub_stock_movements: [
          {
            id: '99999999-9999-4999-8999-999999999903',
            clinic_id: TEST_CLINIC_ID,
            item_id: ITEM_ID,
            lot_id: LOT_ID,
            movement_type: 'sale_out',
            qty: 2,
            reference_type: 'hub_receivable_line',
            reference_id: LINE_ID,
          },
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002',
            clinic_id: TEST_CLINIC_ID,
            item_id: ITEM_ID,
            lot_id: LOT_ID,
            movement_type: 'adjustment_in',
            qty: 2,
            reference_type: RECEIVABLE_PRODUCT_RESTOCK_REF,
            reference_id: LINE_ID,
          },
        ],
      }),
    });

    const second = await request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/cancel`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Cancelamento após devolução já registrada',
      confirm_stock_return: true,
      stock_return_condition: 'sellable',
    });
    expect(second.status).toBe(200);
    expect(second.body.stock_restored ?? 0).toBe(0);
    expect(restockIns()).toHaveLength(1);
    expect(returnEvents()).toHaveLength(1);
  });

  it('7) recebível com múltiplos produtos: quantidades corretas', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_receivable_lines: [
          productLine({ id: LINE_ID, quantity: 2, line_total: 45 }),
          productLine({
            id: LINE_ID_2,
            hub_inventory_item_id: ITEM_ID_2,
            hub_inventory_lot_id: LOT_ID_2,
            quantity: 3,
            line_total: 30,
            description: 'Shampoo',
            unit_cost_amount: 5,
          }),
        ],
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            comanda_id: null,
            guardian_id: null,
            final_amount: 75,
            status: 'paid',
            deleted_at: null,
          },
        ],
        hub_payments: [
          {
            id: PAYMENT_ID,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            amount: 75,
            payment_method: 'pix',
            status: 'posted',
            posting_kind: 'operational',
            cash_session_id: null,
          },
        ],
        hub_stock_movements: [
          {
            id: '99999999-9999-4999-8999-999999999903',
            clinic_id: TEST_CLINIC_ID,
            item_id: ITEM_ID,
            lot_id: LOT_ID,
            movement_type: 'sale_out',
            qty: 2,
            reference_type: 'hub_receivable_line',
            reference_id: LINE_ID,
          },
          {
            id: '99999999-9999-4999-8999-999999999904',
            clinic_id: TEST_CLINIC_ID,
            item_id: ITEM_ID_2,
            lot_id: LOT_ID_2,
            movement_type: 'sale_out',
            qty: 3,
            reference_type: 'hub_receivable_line',
            reference_id: LINE_ID_2,
          },
        ],
      }),
    });

    const res = await request(app).post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Devolução de dois produtos',
      mode: 'refund',
      refund_method: 'pix',
      refund_effective_date: '2026-06-16',
      confirm_stock_return: true,
      stock_return_condition: 'sellable',
    });
    expect(res.status).toBe(200);
    expect(res.body.stock_restored).toBe(2);
    expect(restockIns(LINE_ID)[0].qty).toBe(2);
    expect(restockIns(LINE_ID_2)[0].qty).toBe(3);
    expect(returnEvents()).toHaveLength(2);
  });

  it('9) devolução já registrada impede segunda movimentação', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_product_return_events: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            receivable_line_id: LINE_ID,
            item_id: ITEM_ID,
            lot_id: LOT_ID,
            qty: 2,
            condition: 'sellable',
          },
        ],
        hub_stock_movements: [
          {
            id: '99999999-9999-4999-8999-999999999903',
            clinic_id: TEST_CLINIC_ID,
            item_id: ITEM_ID,
            lot_id: LOT_ID,
            movement_type: 'sale_out',
            qty: 2,
            reference_type: 'hub_receivable_line',
            reference_id: LINE_ID,
          },
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002',
            clinic_id: TEST_CLINIC_ID,
            item_id: ITEM_ID,
            lot_id: LOT_ID,
            movement_type: 'adjustment_in',
            qty: 2,
            reference_type: RECEIVABLE_PRODUCT_RESTOCK_REF,
            reference_id: LINE_ID,
          },
        ],
      }),
    });

    const res = await request(app).post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Tentativa de reentrada duplicada',
      mode: 'refund',
      refund_method: 'pix',
      refund_effective_date: '2026-06-16',
      confirm_stock_return: true,
      stock_return_condition: 'sellable',
    });
    expect(res.status).toBe(200);
    expect(res.body.stock_restored ?? 0).toBe(0);
    expect(restockIns()).toHaveLength(1);
    expect(returnEvents()).toHaveLength(1);
  });

  it('payment_reversal: estoque inalterado', async () => {
    const res = await request(app).post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Erro de forma de pagamento',
      mode: 'payment_reversal',
    });
    expect(res.status).toBe(200);
    expect(res.body.stock_restored ?? 0).toBe(0);
    expect(restockIns()).toHaveLength(0);
    expect(returnEvents()).toHaveLength(0);
  });

  it('reembolso em crédito sem tutor falha sem estornar o pagamento', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            comanda_id: null,
            guardian_id: null,
            final_amount: 45,
            original_amount: 45,
            status: 'paid',
            deleted_at: null,
          },
        ],
      }),
    });

    const res = await request(app).post(`/api/hub/finance/payments/${PAYMENT_ID}/reverse`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Devolução sem tutor na venda',
      mode: 'refund',
      refund_method: 'customer_credit',
      refund_effective_date: '2026-06-16',
      confirm_stock_return: true,
      stock_return_condition: 'sellable',
    });
    expect(res.status).toBe(409);
    expect(String(res.body.error ?? '')).toMatch(/sem tutor|crédito/i);
    const pay = getMockSupabaseClient()._state.tables.hub_payments?.find((p) => p.id === PAYMENT_ID);
    expect(pay?.status).toBe('posted');
    expect(restockIns()).toHaveLength(0);
    expect(returnEvents()).toHaveLength(0);
  });

  it('12) remoção de linha de produto preserva reversão da baixa indevida', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            comanda_id: null,
            guardian_id: null,
            final_amount: 45,
            original_amount: 45,
            status: 'pending',
            deleted_at: null,
          },
        ],
        hub_payments: [],
      }),
    });

    const res = await request(app)
      .delete(`/api/hub/finance/receivables/${RECEIVABLE_ID}/product-lines/${LINE_ID}`)
      .query({ clinic_id: TEST_CLINIC_ID });
    expect(res.status).toBe(200);
    const restored = (getMockSupabaseClient()._state.tables.hub_stock_movements ?? []).filter(
      (m) =>
        m.movement_type === 'adjustment_in' &&
        m.reference_type === 'hub_receivable_line_removed' &&
        m.reference_id === LINE_ID,
    );
    expect(restored).toHaveLength(1);
    expect(restored[0].qty).toBe(2);
  });

  it('endpoint product-returns com pagamento posted exige forma/data do reembolso', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_payments: [
          {
            id: PAYMENT_ID,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            amount: 45,
            payment_method: 'pix',
            status: 'posted',
            posting_kind: 'operational',
            cash_session_id: null,
          },
        ],
      }),
    });

    const res = await request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/product-returns`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Tentativa com pagamento ainda ativo',
      stock_return_condition: 'sellable',
      stock_return_lines: [{ line_id: LINE_ID }],
      idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    });
    expect(res.status).toBe(400);
    expect(String(res.body.error ?? '')).toMatch(/forma|data|reembolso|financeiro/i);
    expect(restockIns()).toHaveLength(0);
    expect(returnEvents()).toHaveLength(0);
  });

  it('endpoint product-returns com pagamento posted reembolsa só o item selecionado', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            comanda_id: null,
            guardian_id: null,
            final_amount: 90,
            original_amount: 90,
            net_amount_at_sale: 90,
            returned_amount: 0,
            status: 'paid',
            deleted_at: null,
          },
        ],
        hub_receivable_lines: [
          {
            id: LINE_ID,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            line_kind: 'product',
            hub_inventory_item_id: ITEM_ID,
            hub_inventory_lot_id: LOT_ID,
            quantity: 2,
            line_total: 45,
            unit_sale_amount: 22.5,
            description: 'Antipulgas',
          },
          {
            id: LINE_ID_2,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            line_kind: 'product',
            hub_inventory_item_id: ITEM_ID_2,
            hub_inventory_lot_id: LOT_ID_2,
            quantity: 1,
            line_total: 45,
            unit_sale_amount: 45,
            description: 'test',
          },
        ],
        hub_payments: [
          {
            id: PAYMENT_ID,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            amount: 90,
            payment_method: 'pix',
            status: 'posted',
            posting_kind: 'operational',
            cash_session_id: null,
          },
        ],
      }),
    });

    const res = await request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/product-returns`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Cliente devolveu só o antipulgas',
      stock_return_condition: 'sellable',
      stock_return_lines: [{ line_id: LINE_ID }],
      refund_method: 'pix',
      refund_effective_date: '2026-06-16',
      idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    });
    expect(res.status).toBe(200);
    expect(res.body.refund_amount).toBe(45);
    expect(res.body.stock_restored).toBe(1);
    expect(returnEvents()).toHaveLength(1);
    const rec = getMockSupabaseClient()._state.tables.hub_receivables?.find((r) => r.id === RECEIVABLE_ID);
    expect(Number(rec?.final_amount)).toBe(45);
    expect(Number(rec?.returned_amount)).toBe(45);
    const pay = getMockSupabaseClient()._state.tables.hub_payments?.find((p) => p.id === PAYMENT_ID);
    expect(pay?.status).toBe('posted');
  });

  it('endpoint product-returns registra devolução pós-reembolso (sellable)', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            comanda_id: null,
            guardian_id: null,
            final_amount: 45,
            status: 'refunded',
            deleted_at: null,
            original_amount: 45,
            net_amount_at_sale: 45,
            returned_amount: 0,
          },
        ],
        hub_payments: [
          {
            id: PAYMENT_ID,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            amount: 45,
            payment_method: 'pix',
            status: 'reversed',
            posting_kind: 'operational',
            cash_session_id: null,
          },
        ],
      }),
    });

    const res = await request(app).post(`/api/hub/finance/receivables/${RECEIVABLE_ID}/product-returns`).send({
      clinic_id: TEST_CLINIC_ID,
      reason: 'Mercadoria voltou após o reembolso',
      stock_return_condition: 'sellable',
      stock_return_lines: [{ line_id: LINE_ID }],
      idempotency_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    });
    expect(res.status).toBe(200);
    expect(res.body.stock_restored).toBe(1);
    expect(res.body.receivable?.stock_return_status).toBe('returned');
    expect(restockIns()).toHaveLength(1);
    expect(returnEvents()).toHaveLength(1);
  });

  it('detail de recebível estornado sem devolução: stock_return_status pending', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_receivables: [
          {
            id: RECEIVABLE_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            comanda_id: null,
            guardian_id: null,
            final_amount: 45,
            status: 'refunded',
            deleted_at: null,
            original_amount: 45,
          },
        ],
        hub_payments: [],
      }),
    });

    const res = await request(app)
      .get(`/api/hub/finance/receivables/${RECEIVABLE_ID}`)
      .query({ clinic_id: TEST_CLINIC_ID });
    expect(res.status).toBe(200);
    expect(res.body.receivable?.stock_return_status).toBe('pending');
  });

  it('recebível sem produtos no detail: product_returns vazio', async () => {
    configureSupabaseMock({
      tables: baseTables({
        hub_receivable_lines: [
          {
            id: LINE_ID,
            clinic_id: TEST_CLINIC_ID,
            receivable_id: RECEIVABLE_ID,
            line_kind: 'manual',
            quantity: 1,
            line_total: 45,
            description: 'Serviço',
          },
        ],
        hub_stock_movements: [],
      }),
    });

    const res = await request(app)
      .get(`/api/hub/finance/receivables/${RECEIVABLE_ID}`)
      .query({ clinic_id: TEST_CLINIC_ID });
    expect(res.status).toBe(200);
    expect(res.body.receivable?.product_returns ?? []).toEqual([]);
    const productLines = (res.body.receivable?.lines ?? []).filter(
      (l: { line_kind: string }) => l.line_kind === 'product',
    );
    expect(productLines).toHaveLength(0);
  });
});
