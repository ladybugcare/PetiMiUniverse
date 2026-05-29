import type { HubEncounterEvent, HubPrescription, HubPrescriptionItem } from '../../api/hubClinicalApi';

export function formatPrescriptionLine(rx: HubPrescription): string {
  const items = rx.items ?? [];
  if (items.length === 0) return rx.notes?.trim() || 'Prescrição';
  return items
    .map((it) => {
      const parts = [it.medication_name];
      if (it.dosage) parts.push(it.dosage);
      if (it.frequency) parts.push(it.frequency);
      if (it.duration) parts.push(it.duration);
      return parts.join(' · ');
    })
    .join('; ');
}

export function formatEventTitle(ev: HubEncounterEvent | Record<string, unknown>): string {
  const e = ev as HubEncounterEvent;
  return e.title || String(e.event_type || 'Evento');
}

export function formatEventBody(ev: HubEncounterEvent | Record<string, unknown>): string {
  const e = ev as HubEncounterEvent;
  return e.body || '';
}

export function formatEventAt(ev: HubEncounterEvent | Record<string, unknown>): string {
  const e = ev as HubEncounterEvent;
  const raw = e.event_at || e.created_at;
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function attachmentPublicUrl(storagePath: string): string {
  if (storagePath.startsWith('http')) return storagePath;
  return storagePath;
}

export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
