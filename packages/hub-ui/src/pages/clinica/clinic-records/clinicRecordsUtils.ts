import type {
  HubClinicalExamStatus,
  HubEncounterStatus,
  HubEncounterType,
  HubSpecialistReferralStatus,
} from '../../../api/hubClinicalApi';

export type ClinicRecordsTabId = 'casos' | 'timeline' | 'prescricoes' | 'vacinas' | 'exames' | 'flags';

export const CLINIC_RECORDS_TABS: Array<{ id: ClinicRecordsTabId; label: string }> = [
  { id: 'casos', label: 'Casos clínicos' },
  { id: 'timeline', label: 'Linha do tempo' },
  { id: 'prescricoes', label: 'Prescrições e receitas' },
  { id: 'vacinas', label: 'Vacinas' },
  { id: 'exames', label: 'Exames e encaminhamentos' },
  { id: 'flags', label: 'Alertas' },
];

const ENCOUNTER_STATUS_LABEL: Record<HubEncounterStatus, string> = {
  waiting: 'Aguardando',
  in_progress: 'Em atendimento',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
};

const ENCOUNTER_TYPE_LABEL: Record<HubEncounterType, string> = {
  consultation: 'Consulta',
  return: 'Retorno',
  emergency: 'Emergência',
  procedure: 'Procedimento',
};

export function encounterStatusLabel(status: string): string {
  return ENCOUNTER_STATUS_LABEL[status as HubEncounterStatus] ?? status;
}

export function encounterTypeLabel(type: string): string {
  return ENCOUNTER_TYPE_LABEL[type as HubEncounterType] ?? type;
}

export function formatRecordDate(value?: string | null): string {
  if (!value) return '—';
  const iso = value.includes('T') ? value : `${value}T12:00:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('pt-BR');
}

export function formatRecordDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return formatRecordDate(value);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function vaccineSourceLabel(source?: string | null): string {
  return source === 'external' ? 'Externa' : 'Na clínica';
}

export function examLabKindLabel(kind?: string | null): string {
  return kind === 'external' ? 'Laboratório externo' : 'Laboratório interno';
}

export function examStatusTone(status: HubClinicalExamStatus | string): string {
  if (status === 'completed' || status === 'result_received') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'collected' || status === 'sent') return 'in_progress';
  return 'waiting';
}

export function referralStatusLabel(status: HubSpecialistReferralStatus | string): string {
  if (status === 'draft') return 'Rascunho';
  if (status === 'issued') return 'Emitido';
  if (status === 'cancelled') return 'Cancelado';
  return 'Ativo';
}

export function referralPriorityLabel(priority?: string | null): string {
  return priority === 'urgent' ? 'Urgente' : 'Rotina';
}
