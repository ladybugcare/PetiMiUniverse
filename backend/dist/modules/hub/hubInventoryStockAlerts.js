"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyLowStockIfCrossed = notifyLowStockIfCrossed;
const supabase_js_1 = require("../../config/supabase.js");
const hubNotifyEvents_js_1 = require("./hubNotifyEvents.js");
/**
 * Avisa o estoque quando uma saída derruba o item abaixo do mínimo.
 * Dispara só na travessia da linha, para o aviso não repetir a cada baixa.
 */
async function notifyLowStockIfCrossed(opts) {
    try {
        let itemName = opts.itemName ?? null;
        let minQty = opts.minQty ?? null;
        if (itemName == null || minQty == null) {
            const { data } = await supabase_js_1.supabaseAdmin
                .from('hub_inventory_items')
                .select('name, min_stock_qty')
                .eq('id', opts.itemId)
                .maybeSingle();
            itemName = itemName ?? (data?.name ?? null);
            minQty = minQty ?? Number(data?.min_stock_qty ?? 0);
        }
        const min = Number(minQty ?? 0);
        if (min <= 0)
            return;
        if (opts.qtyBefore < min || opts.qtyAfter >= min)
            return;
        await (0, hubNotifyEvents_js_1.notifyHubStockAlert)({
            clinicId: opts.clinicId,
            itemId: opts.itemId,
            itemName: String(itemName || 'Item'),
            qtyOnHand: opts.qtyAfter,
            minQty: min,
        });
    }
    catch (e) {
        console.error('notifyLowStockIfCrossed', opts.itemId, e);
    }
}
