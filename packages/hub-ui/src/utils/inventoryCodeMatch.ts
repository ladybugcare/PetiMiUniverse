import type { HubInventoryItem, HubInventoryLotRow } from '../api/hubInventoryApi';
import { isLotExpired } from './inventoryLotExpiry';

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

export function normalizeInventoryCode(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Casa EAN (≥8 dígitos) ou store_sku / EAN textual exato. */
export function matchInventoryByCode(
  items: HubInventoryItem[],
  code: string,
): HubInventoryItem | null {
  const raw = code.trim();
  if (!raw) return null;
  const norm = normalizeInventoryCode(raw);
  const digits = digitsOnly(raw);
  return (
    items.find((p) => p.ean && digitsOnly(p.ean) === digits && digits.length >= 8) ||
    items.find((p) => p.store_sku && normalizeInventoryCode(p.store_sku) === norm) ||
    items.find((p) => p.ean && normalizeInventoryCode(p.ean) === norm) ||
    null
  );
}

/** Preferência: lote não vencido com qty > 0; senão o primeiro lote válido do item. */
export function pickLotWithStock(
  lots: HubInventoryLotRow[],
  itemId: string,
): HubInventoryLotRow | undefined {
  const sellable = lots.filter((l) => l.item_id === itemId && !isLotExpired(l.expiry_date));
  return sellable.find((l) => Number(l.qty_on_hand ?? 0) > 0) ?? sellable[0];
}
