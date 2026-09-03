"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertClinicInventoryItem = assertClinicInventoryItem;
exports.assertClinicInventoryLot = assertClinicInventoryLot;
exports.validateLotStockForOut = validateLotStockForOut;
exports.createEncounterStockOut = createEncounterStockOut;
exports.createSaleStockOut = createSaleStockOut;
const supabase_js_1 = require("../../config/supabase.js");
const hubInventoryController_js_1 = require("./hubInventoryController.js");
const hubInventoryStockAlerts_js_1 = require("./hubInventoryStockAlerts.js");
async function assertClinicInventoryItem(clinicId, itemId) {
    const { data, error } = await supabase_js_1.supabaseAdmin
        .from('hub_inventory_items')
        .select('id, clinic_id, name, sale_amount, cost_amount, deleted_at, active')
        .eq('id', itemId)
        .maybeSingle();
    if (error || !data || data.clinic_id !== clinicId || data.deleted_at)
        return null;
    return data;
}
async function assertClinicInventoryLot(clinicId, lotId) {
    const { data, error } = await supabase_js_1.supabaseAdmin
        .from('hub_inventory_lots')
        .select('id, clinic_id, item_id, lot_code, expiry_date')
        .eq('id', lotId)
        .maybeSingle();
    if (error || !data || data.clinic_id !== clinicId)
        return null;
    return data;
}
/** Valida saldo disponível no lote antes de uma saída. */
async function validateLotStockForOut(clinicId, itemId, lotId, qty, precomputedBalances) {
    const lot = await assertClinicInventoryLot(clinicId, lotId);
    if (!lot)
        return 'Lote inválido para esta clínica.';
    if (lot.item_id !== itemId)
        return 'Lote não pertence ao item de estoque selecionado.';
    const { byLot } = precomputedBalances ?? (await (0, hubInventoryController_js_1.computeBalances)(clinicId));
    const available = byLot.get(lotId) ?? 0;
    if (available < qty) {
        return `Quantidade insuficiente no lote (disponível: ${available}).`;
    }
    return null;
}
async function createStockOutMovement(movementType, params) {
    const qty = params.qty ?? 1;
    const { data: existing } = await supabase_js_1.supabaseAdmin
        .from('hub_stock_movements')
        .select('id')
        .eq('clinic_id', params.clinicId)
        .eq('movement_type', movementType)
        .eq('reference_type', params.referenceType)
        .eq('reference_id', params.referenceId)
        .limit(1)
        .maybeSingle();
    if (existing?.id) {
        return { id: existing.id, skipped: true };
    }
    const balances = await (0, hubInventoryController_js_1.computeBalances)(params.clinicId);
    const qtyBefore = balances.byItem.get(params.itemId) ?? 0;
    const stockErr = await validateLotStockForOut(params.clinicId, params.itemId, params.lotId, qty, balances);
    if (stockErr)
        return { error: stockErr };
    const { data: mov, error: movErr } = await supabase_js_1.supabaseAdmin
        .from('hub_stock_movements')
        .insert({
        clinic_id: params.clinicId,
        item_id: params.itemId,
        lot_id: params.lotId,
        movement_type: movementType,
        qty,
        notes: params.notes ?? null,
        reference_type: params.referenceType,
        reference_id: params.referenceId,
        created_by: params.createdBy ?? null,
    })
        .select('id')
        .single();
    if (movErr || !mov) {
        return { error: movErr?.message || 'Erro ao registrar baixa de estoque.' };
    }
    void (0, hubInventoryStockAlerts_js_1.notifyLowStockIfCrossed)({
        clinicId: params.clinicId,
        itemId: params.itemId,
        qtyBefore,
        qtyAfter: qtyBefore - qty,
    });
    return { id: mov.id };
}
/** Registra saída de estoque vinculada a atendimento/vacinação. */
async function createEncounterStockOut(params) {
    return createStockOutMovement('encounter_out', params);
}
/** Registra saída de estoque por venda (comanda / recebível). */
async function createSaleStockOut(params) {
    return createStockOutMovement('sale_out', params);
}
