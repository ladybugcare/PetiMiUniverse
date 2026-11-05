export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Total líquido do orçamento. Sem desconto, devolve o subtotal como está. */
export function applyQuoteDiscount(
  subtotal: number,
  kind: 'percent' | 'fixed' | null | undefined,
  value: number | null | undefined
): number {
  const v = value ?? 0;
  if (!kind || v <= 0) return subtotal;
  if (kind === 'percent') {
    const pct = Math.min(100, Math.max(0, v));
    return roundMoney2(Math.max(0, subtotal - (subtotal * pct) / 100));
  }
  return roundMoney2(Math.max(0, subtotal - v));
}

/** Valor absoluto do desconto geral, arredondado em centavos. */
export function quoteDiscountAmount(
  subtotal: number,
  kind: 'percent' | 'fixed' | null | undefined,
  value: number | null | undefined
): number {
  return roundMoney2(Math.max(0, subtotal - applyQuoteDiscount(subtotal, kind, value)));
}
