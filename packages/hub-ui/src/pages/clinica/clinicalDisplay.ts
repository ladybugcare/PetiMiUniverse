import type { HubClinicalExamStatus, HubEncounterEvent, HubPrescription, HubPrescriptionItem } from '../../api/hubClinicalApi';

export function formatPrescriptionItemMeta(it: HubPrescriptionItem): string {
  const parts = [
    it.presentation ? `Apresentação: ${it.presentation}` : null,
    it.concentration ? `Concentração: ${it.concentration}` : it.dosage ? `Dose: ${it.dosage}` : null,
    it.quantity ? `Qtd: ${it.quantity}` : null,
    it.posology ? `Posologia: ${it.posology}` : it.frequency ? `Freq: ${it.frequency}` : null,
    it.duration ? `Duração: ${it.duration}` : null,
    it.administration === 'administered_in_clinic' ? 'Clínica' : null,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}

export function formatPrescriptionLine(rx: HubPrescription): string {
  const items = rx.items ?? [];
  if (items.length === 0) return rx.notes?.trim() || 'Prescrição';
  return items
    .map((it) => {
      const parts = [it.medication_name];
      const meta = formatPrescriptionItemMeta(it);
      if (meta !== '—') parts.push(meta);
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

const EXAM_STATUS_LABELS: Record<HubClinicalExamStatus, string> = {
  requested: 'Solicitado',
  collected: 'Coletado',
  sent: 'Enviado ao laboratório',
  result_received: 'Resultado recebido',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

export function formatHubClinicalExamStatus(status: HubClinicalExamStatus): string {
  return EXAM_STATUS_LABELS[status] ?? status;
}

export function formatHubComandaStatus(status: string): string {
  if (status === 'aberta') return 'Aberta';
  if (status === 'fechada') return 'Fechada';
  if (status === 'cancelada') return 'Cancelada';
  return status;
}
