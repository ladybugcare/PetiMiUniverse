export function profileDash(value?: string | null): string {
  const t = value?.trim();
  return t || '—';
}

export function formatProfileDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatProfileDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatProfileAddress(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
}): string {
  const line = [parts.address, parts.city, parts.state].map((p) => p?.trim()).filter(Boolean);
  return line.length ? line.join(' · ') : '—';
}
