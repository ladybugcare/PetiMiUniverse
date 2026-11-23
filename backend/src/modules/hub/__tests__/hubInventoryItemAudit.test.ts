import { buildInventoryItemChangeRows } from '../hubInventoryItemAudit';

const CLINIC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
const ACTOR = 'cccccccc-cccc-4ccc-8ccc-cccccccc0001';

describe('buildInventoryItemChangeRows', () => {
  it('gera uma linha por campo auditado alterado', () => {
    const rows = buildInventoryItemChangeRows({
      clinicId: CLINIC_ID,
      itemId: ITEM_ID,
      actorUserId: ACTOR,
      before: {
        cost_amount: 10,
        sale_amount: 20,
        min_stock_qty: 2,
        active: true,
        name: 'Ração',
        deleted_at: null,
      },
      afterPatch: {
        cost_amount: 12,
        sale_amount: 20,
        name: 'Ração Premium',
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.field).sort()).toEqual(['cost_amount', 'name']);
    expect(rows.find((r) => r.field === 'cost_amount')).toMatchObject({
      old_value: 10,
      new_value: 12,
      actor_user_id: ACTOR,
    });
    expect(rows.find((r) => r.field === 'name')).toMatchObject({
      old_value: 'Ração',
      new_value: 'Ração Premium',
    });
  });

  it('ignora campos sem mudança e não auditados', () => {
    const rows = buildInventoryItemChangeRows({
      clinicId: CLINIC_ID,
      itemId: ITEM_ID,
      actorUserId: null,
      before: { cost_amount: 10, description: 'a' },
      afterPatch: { cost_amount: 10, description: 'b', unit_label: 'un' },
    });
    expect(rows).toEqual([]);
  });

  it('registra soft-delete via deleted_at', () => {
    const iso = '2026-03-01T12:00:00.000Z';
    const rows = buildInventoryItemChangeRows({
      clinicId: CLINIC_ID,
      itemId: ITEM_ID,
      actorUserId: ACTOR,
      before: { deleted_at: null },
      afterPatch: { deleted_at: iso },
    });
    expect(rows).toEqual([
      {
        clinic_id: CLINIC_ID,
        item_id: ITEM_ID,
        field: 'deleted_at',
        old_value: null,
        new_value: iso,
        actor_user_id: ACTOR,
      },
    ]);
  });
});
