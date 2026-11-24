/** Finalidades de item de estoque (`hub_inventory_items.sale_purpose`). */
export type InventorySalePurpose = 'SALE' | 'INTERNAL' | 'CLINICAL';

export function normalizeSalePurpose(purpose: string | null | undefined): string {
  return String(purpose ?? '')
    .trim()
    .toUpperCase();
}

export function isClinicalSalePurpose(purpose: string | null | undefined): boolean {
  return normalizeSalePurpose(purpose) === 'CLINICAL';
}

export function filterItemsBySalePurpose<T extends { sale_purpose?: string | null }>(
  items: T[],
  purpose: InventorySalePurpose,
): T[] {
  return items.filter((it) => normalizeSalePurpose(it.sale_purpose) === purpose);
}
