/** Converte ISO date (YYYY-MM-DD) para dd/mm/yyyy */
export function isoDateToBr(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** dd/mm/aaaa → YYYY-MM-DD ou '' se inválido */
export function brDateToIso(br: string): string | undefined {
  const t = br.trim();
  if (!t) return undefined;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

export function formatGuardianAddress(g: {
  street?: string | null;
  street_number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  complement?: string | null;
}): string {
  const parts: string[] = [];
  if (g.street) {
    parts.push([g.street, g.street_number].filter(Boolean).join(', '));
  }
  if (g.district) parts.push(g.district);
  if (g.city || g.state) parts.push([g.city, g.state].filter(Boolean).join(' / '));
  if (g.postal_code) parts.push(`CEP ${g.postal_code}`);
  if (g.complement) parts.push(g.complement);
  return parts.join(' · ') || '—';
}
