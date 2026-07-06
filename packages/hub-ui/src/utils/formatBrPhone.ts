/** Extrai só dígitos (máx. 11 — celular BR com DDD). */
export function digitsOnlyBrPhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 11);
}

/** Formata para exibição: (11) 98888-8888 ou (11) 3456-7890 */
export function formatBrPhoneInput(raw: string): string {
  const d = digitsOnlyBrPhone(raw);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Normaliza valor vindo da API (com ou sem máscara). */
export function formatBrPhoneFromApi(raw: string | null | undefined): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  return formatBrPhoneInput(s);
}

/** Telefone formatado para exibição; fallback quando vazio. */
export function formatBrPhoneDisplay(raw: string | null | undefined, fallback = '—'): string {
  return formatBrPhoneFromApi(raw) || fallback;
}
