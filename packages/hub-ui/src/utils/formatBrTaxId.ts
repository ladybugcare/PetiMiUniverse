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
