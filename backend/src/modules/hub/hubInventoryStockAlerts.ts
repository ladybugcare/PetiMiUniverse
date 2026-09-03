import { supabaseAdmin } from '../../config/supabase.js';
import { notifyHubStockAlert } from './hubNotifyEvents.js';

/**
 * Avisa o estoque quando uma saída derruba o item abaixo do mínimo.
 * Dispara só na travessia da linha, para o aviso não repetir a cada baixa.
 */
export async function notifyLowStockIfCrossed(opts: {
  clinicId: string;
  itemId: string;
  qtyBefore: number;
  qtyAfter: number;
  itemName?: string | null;
  minQty?: number | null;
}): Promise<void> {
  try {
    let itemName = opts.itemName ?? null;
    let minQty = opts.minQty ?? null;

    if (itemName == null || minQty == null) {
      const { data } = await supabaseAdmin
        .from('hub_inventory_items')
        .select('name, min_stock_qty')
        .eq('id', opts.itemId)
        .maybeSingle();
      itemName = itemName ?? ((data?.name as string | null) ?? null);
      minQty = minQty ?? Number(data?.min_stock_qty ?? 0);
    }

    const min = Number(minQty ?? 0);
    if (min <= 0) return;
    if (opts.qtyBefore < min || opts.qtyAfter >= min) return;

    await notifyHubStockAlert({
      clinicId: opts.clinicId,
      itemId: opts.itemId,
      itemName: String(itemName || 'Item'),
      qtyOnHand: opts.qtyAfter,
      minQty: min,
    });
  } catch (e) {
    console.error('notifyLowStockIfCrossed', opts.itemId, e);
  }
}
