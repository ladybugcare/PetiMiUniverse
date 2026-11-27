/** Normaliza quantidade de produto: rejeita lixo, respeita fracionável e teto do lote. */
export function normalizeProductQtyInput(
  raw: string,
  maxOnHand: number,
  allowFractional: boolean,
): { quantity: string; capped: boolean; invalid: boolean } {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { quantity: '', capped: false, invalid: true };
  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return { quantity: trimmed, capped: false, invalid: true };
  }
  let n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return { quantity: trimmed, capped: false, invalid: true };
  if (!allowFractional) {
    if (!Number.isInteger(n)) {
      return { quantity: trimmed, capped: false, invalid: true };
    }
  } else {
    n = Math.round(n * 100) / 100;
  }
  const capped = maxOnHand > 0 && n > maxOnHand;
  const final = capped ? maxOnHand : n;
  return { quantity: String(final), capped, invalid: false };
}
