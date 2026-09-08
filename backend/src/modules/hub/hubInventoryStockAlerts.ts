import { supabaseAdmin } from '../../config/supabase.js';
import { notifyHubStockAlert, notifyHubStockExpiryAlert, notifyHubNearlyEmptyLot } from './hubNotifyEvents.js';
import { crossedNearlyEmptyThreshold, roundStockQty } from './hubInventoryContentUtils.js';

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

/**
 * Avisa quando o último recipiente do lote fica com menos de 20% do conteúdo.
 * Só dispara na travessia do limiar (antes ≥ 0,20 → depois < 0,20).
 */
export async function notifyNearlyEmptyLotIfCrossed(opts: {
  clinicId: string;
  itemId: string;
  lotId: string;
  lotQtyBefore: number;
  lotQtyAfter: number;
  contentQty?: number | null;
  contentUnit?: string | null;
  itemName?: string | null;
  unitLabel?: string | null;
  lotCode?: string | null;
}): Promise<void> {
  try {
    let contentQty = opts.contentQty ?? null;
    let contentUnit = opts.contentUnit ?? null;
    let itemName = opts.itemName ?? null;
    let unitLabel = opts.unitLabel ?? null;
    let lotCode = opts.lotCode ?? null;

    if (contentQty == null || itemName == null || unitLabel == null) {
      const { data } = await supabaseAdmin
        .from('hub_inventory_items')
        .select('name, unit_label, content_qty, content_unit')
        .eq('id', opts.itemId)
        .maybeSingle();
      itemName = itemName ?? ((data?.name as string | null) ?? null);
      unitLabel = unitLabel ?? ((data?.unit_label as string | null) ?? null);
      contentQty = contentQty ?? (data?.content_qty != null ? Number(data.content_qty) : null);
      contentUnit = contentUnit ?? ((data?.content_unit as string | null) ?? null);
    }

    if (lotCode == null) {
      const { data: lot } = await supabaseAdmin
        .from('hub_inventory_lots')
        .select('lot_code')
        .eq('id', opts.lotId)
        .maybeSingle();
      lotCode = (lot?.lot_code as string | null) ?? null;
    }

    const hasContent = contentQty != null && Number(contentQty) > 0;
    if (!crossedNearlyEmptyThreshold(opts.lotQtyBefore, opts.lotQtyAfter, hasContent)) {
      return;
    }

    const remainingStock = roundStockQty(opts.lotQtyAfter);
    const remainingContent =
      hasContent && contentQty ? roundStockQty(remainingStock * Number(contentQty)) : null;

    await notifyHubNearlyEmptyLot({
      clinicId: opts.clinicId,
      itemId: opts.itemId,
      lotId: opts.lotId,
      itemName: String(itemName || 'Item'),
      lotCode,
      remainingStock,
      unitLabel: unitLabel || 'un.',
      remainingContent,
      contentUnit: contentUnit || null,
    });
  } catch (e) {
    console.error('notifyNearlyEmptyLotIfCrossed', opts.lotId, e);
  }
}

function policyToDays(policy: string): number | null {
  if (policy === 'd30') return 30;
  if (policy === 'd60') return 60;
  if (policy === 'd90') return 90;
  return null;
}

/**
 * Na entrada de lote, avisa se a validade está dentro da policy do item.
 */
export async function notifyExpiryAlertIfNeeded(opts: {
  clinicId: string;
  itemId: string;
  itemName: string;
  expiryAlertPolicy: string;
  lotId: string;
  lotCode?: string | null;
  expiryDate?: string | null;
}): Promise<void> {
  try {
    const days = policyToDays(opts.expiryAlertPolicy);
    if (days == null || !opts.expiryDate) return;

    const today = new Date().toISOString().slice(0, 10);
    const t0 = Date.parse(`${today}T12:00:00Z`);
    const t1 = Date.parse(`${opts.expiryDate}T12:00:00Z`);
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) return;
    const daysUntil = Math.round((t1 - t0) / 86400000);
    if (daysUntil < 0 || daysUntil > days) return;

    await notifyHubStockExpiryAlert({
      clinicId: opts.clinicId,
      itemId: opts.itemId,
      itemName: opts.itemName,
      lotId: opts.lotId,
      lotCode: opts.lotCode ?? null,
      expiryDate: opts.expiryDate,
      daysUntil,
    });
  } catch (e) {
    console.error('notifyExpiryAlertIfNeeded', opts.itemId, e);
  }
}
