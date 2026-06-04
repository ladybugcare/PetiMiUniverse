/** Formata CNPJ brasileiro (14 dígitos); devolve o texto original se não couber no padrão. */
export function formatCnpjDisplay(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return '—';
  const d = String(raw).replace(/\D/g, '');
  if (d.length !== 14) return String(raw).trim();
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}
