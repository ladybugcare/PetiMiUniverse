/** Normaliza EAN para só dígitos. */
export function normalizeEanDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

function checksumEan13Body(body12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(body12[i]!, 10);
    if (Number.isNaN(n)) return -1;
    sum += i % 2 === 0 ? n : n * 3;
  }
  return (10 - (sum % 10)) % 10;
}

function checksumEan8Body(body7: string): number {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const n = parseInt(body7[i]!, 10);
    if (Number.isNaN(n)) return -1;
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEanChecksum(digits: string): boolean {
  if (digits.length === 13) {
    const check = parseInt(digits[12]!, 10);
    if (Number.isNaN(check)) return false;
    return checksumEan13Body(digits.slice(0, 12)) === check;
  }
  if (digits.length === 8) {
    const check = parseInt(digits[7]!, 10);
    if (Number.isNaN(check)) return false;
    return checksumEan8Body(digits.slice(0, 7)) === check;
  }
  return false;
}

/** Valida e devolve só dígitos, ou null se vazio. Lança mensagem amigável se inválido. */
export function parseOptionalEan(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const d = normalizeEanDigits(String(raw));
  if (d.length !== 8 && d.length !== 13) {
    throw new Error('EAN deve ter 8 ou 13 dígitos');
  }
  if (!isValidEanChecksum(d)) {
    throw new Error('EAN inválido (dígito de controlo)');
  }
  return d;
}
