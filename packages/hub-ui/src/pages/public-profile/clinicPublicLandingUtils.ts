import type { HubClinicPublicLandingData, HubPublicBusinessHours, HubPublicDayHours } from './clinicPublicProfileTypes';

export const PUBLIC_OFFER_FEATURED_LIMIT = 4;

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function daySignature(d: HubPublicDayHours | undefined): string {
  if (!d || d.closed) return 'closed';
  return `open:${d.open || ''}-${d.close || ''}`;
}

function formatDayRange(start: number, end: number): string {
  if (start === end) return DAY_LABELS[start];
  if (start === 1 && end === 5) return 'Seg a sex';
  if (start === 0 && end === 6) return 'Todos os dias';
  if (start === 1 && end === 6) return 'Seg a sáb';
  return `${DAY_SHORT[start]} a ${DAY_SHORT[end]}`;
}

function formatHoursValue(d: HubPublicDayHours | undefined, sig: string): string {
  if (!d || d.closed || sig === 'closed') return 'Fechado';
  if (d.open && d.close) return `${d.open} – ${d.close}`;
  return '—';
}

/** Agrupa dias consecutivos com o mesmo horário. */
export function groupHours(hours: HubPublicBusinessHours): Array<{ day: string; value: string }> {
  const rows: Array<{ day: string; value: string }> = [];
  let i = 0;
  while (i < 7) {
    const key = String(i) as keyof HubPublicBusinessHours;
    const sig = daySignature(hours[key]);
    let j = i;
    while (j + 1 < 7) {
      const nextKey = String(j + 1) as keyof HubPublicBusinessHours;
      if (daySignature(hours[nextKey]) !== sig) break;
      j += 1;
    }
    rows.push({
      day: formatDayRange(i, j),
      value: formatHoursValue(hours[key], sig),
    });
    i = j + 1;
  }
  return rows;
}

function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function getOpenStatus(
  hours: HubPublicBusinessHours,
  now = new Date(),
): { open: boolean; label: string } | null {
  if (!Object.keys(hours).length) return null;
  const key = String(now.getDay()) as keyof HubPublicBusinessHours;
  const d = hours[key];
  if (!d) return null;
  if (d.closed || !d.open || !d.close) {
    return { open: false, label: 'Fechado agora' };
  }
  const openM = parseHm(d.open);
  const closeM = parseHm(d.close);
  if (openM == null || closeM == null) return null;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= openM && mins < closeM) {
    return { open: true, label: `Aberto agora · fecha às ${d.close}` };
  }
  if (mins < openM) {
    return { open: false, label: `Abre hoje às ${d.open}` };
  }
  return { open: false, label: 'Fechado agora' };
}

export function addressQuery(data: HubClinicPublicLandingData): string | null {
  const a = data.profile.address;
  if (a) {
    const parts = [a.line, a.city, a.state].filter((x) => x && String(x).trim());
    if (parts.length) return parts.join(', ');
  }
  const u = data.units[0];
  if (!u) return null;
  const up = [u.address, u.city, u.state].filter((x) => x && String(x).trim());
  return up.length ? up.join(', ') : null;
}

export function formatAddressDisplay(
  address: { line: string | null; city: string | null; state: string | null } | null | undefined,
): string | null {
  if (!address) return null;
  const parts = [address.line, address.city, address.state].filter((x) => x && String(x).trim());
  return parts.length ? parts.join(' · ') : null;
}

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function buildServiceInquiryMessage(clinicName: string, offerTitle: string): string {
  const clinic = clinicName.trim() || 'clínica';
  const offer = offerTitle.trim() || 'seus serviços';
  return `Oi! Vi a página da ${clinic} e quero saber mais sobre ${offer}.`;
}

export function splitFeaturedOffers<T>(items: T[], limit = PUBLIC_OFFER_FEATURED_LIMIT): {
  featured: T[];
  more: T[];
} {
  if (items.length <= limit) {
    return { featured: items, more: [] };
  }
  return {
    featured: items.slice(0, limit),
    more: items.slice(limit),
  };
}
