"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INVENTORY_ITEM_AUDIT_FIELDS = void 0;
exports.buildInventoryItemChangeRows = buildInventoryItemChangeRows;
exports.INVENTORY_ITEM_AUDIT_FIELDS = [
    'cost_amount',
    'sale_amount',
    'min_stock_qty',
    'active',
    'name',
    'deleted_at',
];
function auditJsonValue(v) {
    if (v === undefined)
        return null;
    if (typeof v === 'number' && Number.isFinite(v))
        return v;
    if (typeof v === 'boolean')
        return v;
    if (v === null)
        return null;
    return v;
}
function valuesEqualForAudit(a, b) {
    if (a === b)
        return true;
    if (a == null && b == null)
        return true;
    if (typeof a === 'number' && typeof b === 'number') {
        return Math.abs(a - b) < 1e-9;
    }
    return String(a ?? '') === String(b ?? '');
}
/** Monta linhas de auditoria (uma por campo alterado). */
function buildInventoryItemChangeRows(params) {
    const rows = [];
    for (const field of exports.INVENTORY_ITEM_AUDIT_FIELDS) {
        if (!(field in params.afterPatch))
            continue;
        const oldVal = params.before[field];
        const newVal = params.afterPatch[field];
        if (valuesEqualForAudit(oldVal, newVal))
            continue;
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
