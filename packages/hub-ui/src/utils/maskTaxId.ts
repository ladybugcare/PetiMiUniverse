/** Máscara para listagens (LGPD): não expõe CPF completo. */
export function maskTaxIdForList(taxId: string | null | undefined): string {
  const d = (taxId || '').replace(/\D/g, '');
  if (!d) return '—';
  if (d.length <= 2) return '**';
  return `***.***.***-${d.slice(-2)}`;
}
