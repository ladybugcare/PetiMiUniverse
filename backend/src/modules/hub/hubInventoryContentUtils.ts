/**
 * Helpers de conteúdo por embalagem (ex.: 10 ml por frasco).
 * Compartilhado conceitualmente entre backend e UI.
 */

/** Unidades de estoque que já são unidade de consumo — sem campo de conteúdo. */
export const STOCK_UNITS_THAT_ARE_CONSUMPTION = new Set([
  'ml',
  'litro',
  'l',
  'g',
  'kg',
]);

/** Unidades de estoque que exigem conteúdo (ml) no cadastro. */
export const STOCK_UNITS_REQUIRING_CONTENT = new Set(['frasco', 'ampola']);

export const NEARLY_EMPTY_FRACTION = 0.2;

export function normalizeUnitLabel(unit: string | null | undefined): string {
  return String(unit ?? '')
    .trim()
    .toLowerCase();
}

export function stockUnitRequiresContent(unitLabel: string | null | undefined): boolean {
  return STOCK_UNITS_REQUIRING_CONTENT.has(normalizeUnitLabel(unitLabel));
}

export function stockUnitIsConsumption(unitLabel: string | null | undefined): boolean {
  return STOCK_UNITS_THAT_ARE_CONSUMPTION.has(normalizeUnitLabel(unitLabel));
}

/**
 * Converte quantidade digitada na unidade de conteúdo para a unidade de estoque.
 * Sem contentQty: quantidade já está na unidade de estoque.
 */
export function stockQtyFromConsumption(consumed: number, contentQty: number | null | undefined): number {
  const c = Number(consumed);
  if (!Number.isFinite(c) || c <= 0) return NaN;
  const content = contentQty == null ? null : Number(contentQty);
  if (content == null || !Number.isFinite(content) || content <= 0) {
    return Math.round(c * 10000) / 10000;
  }
  return Math.round((c / content) * 10000) / 10000;
}

/** Lote “quase vazio”: 0 < saldo < 20% de 1 unidade de estoque (só faz sentido com conteúdo). */
export function isNearlyEmptyLotBalance(
  lotQty: number,
  hasContent: boolean,
  fraction: number = NEARLY_EMPTY_FRACTION,
): boolean {
  if (!hasContent) return false;
  const q = Number(lotQty);
  if (!Number.isFinite(q)) return false;
  return q > 0 && q < fraction;
}

/** Travessia do limiar: antes >= 20%, depois < 20% (e ainda > 0). */
export function crossedNearlyEmptyThreshold(
  qtyBefore: number,
  qtyAfter: number,
  hasContent: boolean,
  fraction: number = NEARLY_EMPTY_FRACTION,
): boolean {
  if (!hasContent) return false;
  const before = Number(qtyBefore);
  const after = Number(qtyAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return false;
  return before >= fraction && after > 0 && after < fraction;
}

export function roundStockQty(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}
