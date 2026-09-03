jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);

import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  createEncounterStockOut,
  validateLotStockForOut,
} from '../hubInventoryStockUtils';

const CLINIC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
const LOT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccc0001';

function stockFixture(movements: Record<string, unknown>[] = []) {
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
          expiry_date: '2027-01-01',
          received_at: '2026-01-01',
        },
      ],
      hub_stock_movements: movements,
    },
  });
}

describe('hubInventoryStockUtils', () => {
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
});
