export const INVENTORY_ITEM_AUDIT_FIELDS = [
  'cost_amount',
  'sale_amount',
  'min_stock_qty',
  'active',
  'name',
  'deleted_at',
] as const;

export type InventoryItemAuditField = (typeof INVENTORY_ITEM_AUDIT_FIELDS)[number];

function auditJsonValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v;
  if (v === null) return null;
  return v;
}

function valuesEqualForAudit(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-9;
  }
  return String(a ?? '') === String(b ?? '');
}

/** Monta linhas de auditoria (uma por campo alterado). */
export function buildInventoryItemChangeRows(params: {
  clinicId: string;
  itemId: string;
  actorUserId: string | null;
  before: Record<string, unknown>;
  afterPatch: Record<string, unknown>;
}): Array<{
  clinic_id: string;
  item_id: string;
  field: InventoryItemAuditField;
  old_value: unknown;
  new_value: unknown;
  actor_user_id: string | null;
}> {
  const rows: Array<{
    clinic_id: string;
    item_id: string;
    field: InventoryItemAuditField;
    old_value: unknown;
    new_value: unknown;
    actor_user_id: string | null;
  }> = [];
  for (const field of INVENTORY_ITEM_AUDIT_FIELDS) {
    if (!(field in params.afterPatch)) continue;
    const oldVal = params.before[field];
    const newVal = params.afterPatch[field];
    if (valuesEqualForAudit(oldVal, newVal)) continue;
    rows.push({
      clinic_id: params.clinicId,
      item_id: params.itemId,
      field,
      old_value: auditJsonValue(oldVal),
      new_value: auditJsonValue(newVal),
      actor_user_id: params.actorUserId,
    });
  }
  return rows;
}
