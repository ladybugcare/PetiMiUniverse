export const GROOMING_STAGES = [
  'scheduled',
  'checked_in',
  'queued',
  'in_service',
  'finishing',
  'ready',
  'delivered',
  'closed',
] as const;

export type GroomingStage = (typeof GROOMING_STAGES)[number];

export const GROOMING_STAGE_LABELS: Record<GroomingStage, string> = {
  scheduled: 'Agendado',
  checked_in: 'Check-in',
  queued: 'Aguardando',
  in_service: 'Em atendimento',
  finishing: 'Finalização',
  ready: 'Pronto',
  delivered: 'Entregue',
  closed: 'Encerrado',
};

/** Próximo estágio na ação rápida «Avançar». */
export const GROOMING_NEXT_STAGE: Partial<Record<GroomingStage, GroomingStage>> = {
  scheduled: 'checked_in',
  checked_in: 'queued',
  queued: 'in_service',
  in_service: 'finishing',
  finishing: 'ready',
  ready: 'delivered',
  delivered: 'closed',
};

const ALLOWED_TRANSITIONS: Record<GroomingStage, GroomingStage[]> = {
  scheduled: ['checked_in'],
  checked_in: ['queued', 'scheduled'],
  queued: ['in_service', 'checked_in'],
  in_service: ['finishing', 'queued'],
  finishing: ['ready', 'in_service'],
  ready: ['delivered', 'finishing'],
  delivered: ['closed', 'ready'],
  closed: [],
};

export function canTransitionGroomingStage(from: GroomingStage, to: GroomingStage): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function appointmentStatusForGroomingStage(stage: GroomingStage): string | null {
  switch (stage) {
    case 'scheduled':
      return 'confirmed';
    case 'checked_in':
    case 'queued':
    case 'in_service':
    case 'finishing':
      return 'in_progress';
    case 'ready':
    case 'delivered':
      return 'done';
    case 'closed':
      return 'paid';
    default:
      return null;
  }
}

export function boardStageFromAppointmentStatus(status: string): GroomingStage {
  if (status === 'pending_confirm' || status === 'confirmed') return 'scheduled';
  if (status === 'checked_in') return 'checked_in';
  if (status === 'in_progress') return 'checked_in';
  if (status === 'done') return 'ready';
  if (status === 'paid') return 'closed';
  return 'scheduled';
}

export const GROOMING_EVENT_TITLES: Record<string, string> = {
  check_in: 'Check-in realizado',
  start: 'Atendimento iniciado',
  pause: 'Atendimento pausado',
  resume: 'Atendimento retomado',
  staff_change: 'Profissional alterado',
  stage_change: 'Estágio atualizado',
  note: 'Observação',
  ready: 'Pet pronto',
  delivered: 'Pet entregue',
  closed: 'Atendimento encerrado',
};
