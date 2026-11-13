import { useEffect, useState } from 'react';
import { apiRequest, getStoredClinicId } from '@petimi/web-core';

export function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYmdLocal(iso: string | null | undefined): Date {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateLongPt(dateYmd: string): string {
  const d = parseYmdLocal(dateYmd);
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function formatGeneratedAtPt(d = new Date()): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeHm(isoOrDate?: string | Date | null): string {
  if (!isoOrDate) return '—';
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Nome da clínica para cabeçalho de impressão. */
export function useHubClinicDisplayName(): string {
  const clinicId = getStoredClinicId();
  const [name, setName] = useState('Clínica');

  useEffect(() => {
    if (!clinicId) {
      setName('Clínica');
      return;
    }
    let cancelled = false;
    void (apiRequest(`/clinics/${encodeURIComponent(clinicId)}`) as Promise<{
      clinic?: { name?: string | null };
    }>)
      .then((res) => {
        if (cancelled) return;
        const n = res?.clinic?.name?.trim();
        setName(n || 'Clínica');
      })
      .catch(() => {
        if (!cancelled) setName('Clínica');
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  return name;
}

export function formatPickupStopAddress(snap: Record<string, unknown> | null | undefined): string | null {
  if (!snap) return null;
  const parts = [
    snap.address,
    snap.address_street,
    snap.street,
    snap.address_neighborhood,
    snap.district,
    snap.address_city,
    snap.city,
  ]
    .map((x) => (x == null ? '' : String(x).trim()))
    .filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length ? unique.join(', ') : null;
}
