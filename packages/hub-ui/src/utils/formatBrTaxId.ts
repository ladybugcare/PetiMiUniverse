export type BrTaxIdMode = 'auto' | 'cpf' | 'cnpj';

/** Extrai só dígitos (máx. 14 — CNPJ). */
export function digitsOnlyBrTaxId(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 14);
}

/** Formata CPF: 000.000.000-00 */
export function formatBrCpfInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Formata CNPJ: 00.000.000/0000-00 */
export function formatBrCnpjInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Formata CPF/CNPJ para input.
 * Em modo `auto`: até 11 dígitos usa máscara de CPF; a partir do 12º, CNPJ.
 */
export function formatBrTaxIdInput(raw: string, mode: BrTaxIdMode = 'auto'): string {
  if (mode === 'cpf') return formatBrCpfInput(raw);
  if (mode === 'cnpj') return formatBrCnpjInput(raw);
  const d = digitsOnlyBrTaxId(raw);
  if (d.length <= 11) return formatBrCpfInput(d);
  return formatBrCnpjInput(d);
}

/** Normaliza valor vindo da API (com ou sem máscara). */
export function formatBrTaxIdFromApi(raw: string | null | undefined, mode: BrTaxIdMode = 'auto'): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  return formatBrTaxIdInput(s, mode);
}

/** CPF/CNPJ formatado para exibição; fallback quando vazio. */
export function formatBrTaxIdDisplay(
  raw: string | null | undefined,
  fallback = '—',
  mode: BrTaxIdMode = 'auto'
): string {
  return formatBrTaxIdFromApi(raw, mode) || fallback;
}

function allSameDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

export function isValidBrCpf(raw: string | null | undefined): boolean {
  const cpf = digitsOnlyBrTaxId(raw ?? '').slice(0, 11);
  if (cpf.length !== 11) return false;
  if (allSameDigit(cpf)) return false;

  let sum = 0;
  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cpf.substring(i - 1, i), 10) * (11 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(9, 10), 10)) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cpf.substring(i - 1, i), 10) * (12 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === parseInt(cpf.substring(10, 11), 10);
}

export function isValidBrCnpj(raw: string | null | undefined): boolean {
  const cnpj = digitsOnlyBrTaxId(raw ?? '');
  if (cnpj.length !== 14) return false;
  if (allSameDigit(cnpj)) return false;

  let length = cnpj.length - 2;
  let numbers = cnpj.substring(0, length);
  const digits = cnpj.substring(length);
  let sum = 0;
  let pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0), 10)) return false;

  length += 1;
  numbers = cnpj.substring(0, length);
  sum = 0;
  pos = length - 7;
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === parseInt(digits.charAt(1), 10);
}

/** CPF (11) ou CNPJ (14) com dígitos verificadores. */
export function isValidBrTaxId(raw: string | null | undefined): boolean {
  const d = digitsOnlyBrTaxId(raw ?? '');
  if (d.length === 11) return isValidBrCpf(d);
  if (d.length === 14) return isValidBrCnpj(d);
  return false;
}
