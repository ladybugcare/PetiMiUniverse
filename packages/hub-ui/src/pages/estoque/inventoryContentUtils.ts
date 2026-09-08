/** Unidades de estoque que já são unidade de consumo — sem campo de conteúdo. */
const STOCK_UNITS_THAT_ARE_CONSUMPTION = new Set(['ml', 'litro', 'l', 'g', 'kg']);

/** Unidades de estoque que exigem conteúdo no cadastro. */
const STOCK_UNITS_REQUIRING_CONTENT = new Set(['frasco', 'ampola']);

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

export function stockUnitShowsContentFields(unitLabel: string | null | undefined): boolean {
  const u = normalizeUnitLabel(unitLabel);
  if (!u) return false;
  return !STOCK_UNITS_THAT_ARE_CONSUMPTION.has(u);
}

/** Converte quantidade na unidade de conteúdo para a unidade de estoque. */
export function stockQtyFromConsumption(consumed: number, contentQty: number | null | undefined): number {
  const c = Number(consumed);
  if (!Number.isFinite(c) || c <= 0) return NaN;
  const content = contentQty == null ? null : Number(contentQty);
  if (content == null || !Number.isFinite(content) || content <= 0) {
    return Math.round(c * 10000) / 10000;
  }
  return Math.round((c / content) * 10000) / 10000;
}

export function formatStockQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(n);
}
