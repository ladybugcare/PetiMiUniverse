jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);

import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  createEncounterStockOut,
  createSaleStockOut,
  validateLotStockForOut,
} from '../hubInventoryStockUtils';

const CLINIC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
const LOT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0001';

function stockFixture(
  movements: Record<string, unknown>[] = [],
  opts?: { expiry_date?: string | null },
) {
  configureSupabaseMock({
    tables: {
      hub_inventory_items: [
        {
          id: ITEM_ID,
          clinic_id: CLINIC_ID,
          name: 'Vacina Raiva',
          sale_amount: 120,
          cost_amount: 16,
          deleted_at: null,
          active: true,
        },
      ],
      hub_inventory_lots: [
        {
          id: LOT_ID,
          clinic_id: CLINIC_ID,
          item_id: ITEM_ID,
          lot_code: 'L001',
          expiry_date: opts?.expiry_date === undefined ? '2027-01-01' : opts.expiry_date,
          received_at: '2026-01-01',
        },
      ],
      hub_stock_movements: movements,
    },
  });
}

function ymdOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('hubInventoryStockUtils', () => {
  it('validateLotStockForOut rejeita lote de outro item', async () => {
    const OTHER_ITEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002';
    stockFixture([
      {
        clinic_id: CLINIC_ID,
        item_id: ITEM_ID,
        lot_id: LOT_ID,
        movement_type: 'purchase_in',
        qty: 5,
      },
    ]);
    const err = await validateLotStockForOut(CLINIC_ID, OTHER_ITEM, LOT_ID, 1);
    expect(err).toMatch(/não pertence/i);
  });

  it('validateLotStockForOut detecta saldo insuficiente', async () => {
    stockFixture([
      {
        clinic_id: CLINIC_ID,
        item_id: ITEM_ID,
        lot_id: LOT_ID,
        movement_type: 'purchase_in',
        qty: 1,
      },
    ]);
    const err = await validateLotStockForOut(CLINIC_ID, ITEM_ID, LOT_ID, 2);
    expect(err).toMatch(/insuficiente/i);
  });

  it('validateLotStockForOut rejeita lote vencido', async () => {
    stockFixture(
      [
        {
          clinic_id: CLINIC_ID,
          item_id: ITEM_ID,
          lot_id: LOT_ID,
          movement_type: 'purchase_in',
          qty: 5,
        },
      ],
      { expiry_date: ymdOffset(-1) },
    );
    const err = await validateLotStockForOut(CLINIC_ID, ITEM_ID, LOT_ID, 1);
    expect(err).toMatch(/lote vencido/i);
  });

  it('validateLotStockForOut aceita validade de hoje', async () => {
    stockFixture(
      [
        {
          clinic_id: CLINIC_ID,
          item_id: ITEM_ID,
          lot_id: LOT_ID,
          movement_type: 'purchase_in',
          qty: 5,
        },
      ],
      { expiry_date: ymdOffset(0) },
    );
    const err = await validateLotStockForOut(CLINIC_ID, ITEM_ID, LOT_ID, 1);
    expect(err).toBeNull();
  });

  it('validateLotStockForOut aceita expiry_date nulo', async () => {
    stockFixture(
      [
        {
          clinic_id: CLINIC_ID,
          item_id: ITEM_ID,
          lot_id: LOT_ID,
          movement_type: 'purchase_in',
          qty: 5,
        },
      ],
      { expiry_date: null },
    );
    const err = await validateLotStockForOut(CLINIC_ID, ITEM_ID, LOT_ID, 1);
    expect(err).toBeNull();
  });

  it('createEncounterStockOut registra encounter_out com colunas corretas', async () => {
    stockFixture([
      {
        clinic_id: CLINIC_ID,
        item_id: ITEM_ID,
        lot_id: LOT_ID,
        movement_type: 'purchase_in',
        qty: 5,
      },
    ]);
    const result = await createEncounterStockOut({
      clinicId: CLINIC_ID,
      itemId: ITEM_ID,
      lotId: LOT_ID,
      qty: 1,
      notes: 'Vacina aplicada: Raiva',
      referenceType: 'vaccination',
      referenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
    });
    expect('id' in result).toBe(true);
    if ('error' in result) return;
    const rows = getMockSupabaseClient()._state.tables.hub_stock_movements ?? [];
    const out = rows.find((r) => r.movement_type === 'encounter_out');
    expect(out).toMatchObject({
      item_id: ITEM_ID,
      lot_id: LOT_ID,
      qty: 1,
      reference_type: 'vaccination',
    });
  });

  it('createSaleStockOut registra sale_out com colunas corretas', async () => {
    stockFixture([
      {
        clinic_id: CLINIC_ID,
        item_id: ITEM_ID,
        lot_id: LOT_ID,
        movement_type: 'purchase_in',
        qty: 5,
      },
    ]);
    const refId = 'dddddddd-dddd-4ddd-8ddd-dddddddd0002';
    const result = await createSaleStockOut({
      clinicId: CLINIC_ID,
      itemId: ITEM_ID,
      lotId: LOT_ID,
      qty: 2,
      notes: 'Venda na comanda',
      referenceType: 'hub_comanda_item',
      referenceId: refId,
    });
    expect('id' in result).toBe(true);
    if ('error' in result) return;
    const rows = getMockSupabaseClient()._state.tables.hub_stock_movements ?? [];
    const out = rows.find((r) => r.movement_type === 'sale_out');
    expect(out).toMatchObject({
      item_id: ITEM_ID,
      lot_id: LOT_ID,
      qty: 2,
      unit_cost: 16,
      reference_type: 'hub_comanda_item',
      reference_id: refId,
    });
  });

  it('createSaleStockOut usa unitCost informado em vez do catálogo', async () => {
    stockFixture([
      {
        clinic_id: CLINIC_ID,
        item_id: ITEM_ID,
        lot_id: LOT_ID,
        movement_type: 'purchase_in',
        qty: 5,
      },
    ]);
    const result = await createSaleStockOut({
      clinicId: CLINIC_ID,
      itemId: ITEM_ID,
      lotId: LOT_ID,
      qty: 1,
      unitCost: 9.5,
      referenceType: 'hub_receivable_line',
      referenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddd0005',
    });
    expect('id' in result).toBe(true);
    if ('error' in result) return;
    const out = (getMockSupabaseClient()._state.tables.hub_stock_movements ?? []).find(
      (r) => r.movement_type === 'sale_out',
    );
    expect(out?.unit_cost).toBe(9.5);
  });

  it('createSaleStockOut é idempotente para a mesma referência', async () => {
    stockFixture([
      {
        clinic_id: CLINIC_ID,
        item_id: ITEM_ID,
        lot_id: LOT_ID,
        movement_type: 'purchase_in',
        qty: 5,
      },
    ]);
    const refId = 'dddddddd-dddd-4ddd-8ddd-dddddddd0003';
    const first = await createSaleStockOut({
      clinicId: CLINIC_ID,
      itemId: ITEM_ID,
      lotId: LOT_ID,
      qty: 1,
      referenceType: 'hub_comanda_item',
      referenceId: refId,
    });
    expect('id' in first).toBe(true);
    const second = await createSaleStockOut({
      clinicId: CLINIC_ID,
      itemId: ITEM_ID,
      lotId: LOT_ID,
      qty: 1,
      referenceType: 'hub_comanda_item',
      referenceId: refId,
    });
    expect('id' in second).toBe(true);
    if ('error' in second || 'error' in first) return;
    expect(second.skipped).toBe(true);
    expect(second.id).toBe(first.id);
    const outs = (getMockSupabaseClient()._state.tables.hub_stock_movements ?? []).filter(
      (r) => r.movement_type === 'sale_out',
    );
    expect(outs).toHaveLength(1);
  });

  it('createSaleStockOut falha com saldo insuficiente', async () => {
    stockFixture([
      {
        clinic_id: CLINIC_ID,
        item_id: ITEM_ID,
        lot_id: LOT_ID,
        movement_type: 'purchase_in',
        qty: 1,
      },
    ]);
    const result = await createSaleStockOut({
      clinicId: CLINIC_ID,
      itemId: ITEM_ID,
      lotId: LOT_ID,
      qty: 3,
      referenceType: 'hub_comanda_item',
      referenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddd0004',
    });
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toMatch(/insuficiente/i);
  });
});
