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

/**
 * Caminho do salão: fila → em serviço → pronto.
 * Encerrar a sessão (custódia) fica na recepção, no leva e traz ou na estadia.
 * `finishing` / `delivered` ficam no enum só para sessões antigas.
 */
export const GROOMING_NEXT_STAGE: Partial<Record<GroomingStage, GroomingStage>> = {
  scheduled: 'queued',
  checked_in: 'queued',
  queued: 'in_service',
  in_service: 'ready',
  finishing: 'ready',
};

/** Espelha `appointmentStatusForGroomingStage` do backend (agenda ↔ estágio). */
export function appointmentStatusForGroomingStage(stage: GroomingStage): string | null {
  switch (stage) {
    case 'scheduled':
      return 'confirmed';
    case 'checked_in':
    case 'queued':
      return 'checked_in';
    case 'in_service':
    case 'finishing':
      return 'in_progress';
    case 'ready':
    case 'delivered':
    case 'closed':
      // Encerrado operacionalmente espelha agenda `done`; `paid` só após quitação no caixa.
      return 'done';
    default:
      return null;
  }
}

/** Espelha `backend/src/modules/hub/groomingStages.ts` — transições válidas para PATCH. */
const ALLOWED_TRANSITIONS: Record<GroomingStage, GroomingStage[]> = {
  scheduled: ['checked_in', 'queued'],
  checked_in: ['queued', 'scheduled'],
  queued: ['in_service', 'checked_in'],
  in_service: ['ready', 'finishing', 'queued'],
  finishing: ['ready', 'in_service'],
  ready: ['closed', 'delivered', 'finishing', 'in_service'],
  delivered: ['closed', 'ready'],
  closed: [],
};

export function canTransitionGroomingStage(from: GroomingStage, to: GroomingStage): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getItemBoardStage(item: {
  grooming_stage?: GroomingStage | string;
  appointment_status?: string | null;
}): GroomingStage {
  if (item.grooming_stage && GROOMING_STAGES.includes(item.grooming_stage as GroomingStage)) {
    return item.grooming_stage as GroomingStage;
  }
  const st = item.appointment_status || 'confirmed';
  if (st === 'pending_confirm' || st === 'confirmed') return 'scheduled';
  if (st === 'checked_in') return 'queued';
  if (st === 'in_progress') return 'in_service';
  if (st === 'done') return 'ready';
  if (st === 'paid') return 'closed';
  return 'scheduled';
}

export type GroomingQuickAction =
  | { type: 'confirm_appointment' }
  | { type: 'check_in' }
  | { type: 'advance' };

type GroomingActionItem = {
  session_id?: string | null;
  appointment_id?: string | null;
  grooming_stage?: GroomingStage | string;
  appointment_status?: string | null;
  appointment_kind?: string | null;
};

/** Encaixe da agenda já chega como `checked_in`, mas ainda sem `hub_grooming_session`. */
export function canOpenGroomingSessionFromAppointment(item: GroomingActionItem): boolean {
  if (item.session_id || !item.appointment_id) return false;
  const stage = getItemBoardStage(item);
  if (stage === 'scheduled' || stage === 'checked_in' || stage === 'queued') return true;
  if (item.appointment_status === 'checked_in' || item.appointment_kind === 'walk_in') return true;
  return false;
}

export function resolveGroomingQuickAction(
  item: GroomingActionItem,
  canWrite: boolean,
): GroomingQuickAction | null {
  if (!canWrite) return null;
  const stage = getItemBoardStage(item);
  if (!item.session_id && item.appointment_id && item.appointment_status === 'pending_confirm') {
    return { type: 'confirm_appointment' };
  }
  if (canOpenGroomingSessionFromAppointment(item)) {
    return { type: 'check_in' };
  }
  if (item.session_id && GROOMING_NEXT_STAGE[stage]) {
    return { type: 'advance' };
  }
  return null;
}

/**
 * Estágio inicial da sessão ao abrir a partir de um slot da agenda.
 * Encaixe já fez check-in na recepção → entra direto em Aguardando.
 */
export function groomingOpenSessionStage(item: GroomingActionItem): GroomingStage | undefined {
  const stage = getItemBoardStage(item);
  // Já está em Aguardando sem sessão: o próximo passo operacional é iniciar.
  if (!item.session_id && stage === 'queued') return 'in_service';
  if (stage === 'checked_in' || item.appointment_status === 'checked_in' || item.appointment_kind === 'walk_in') {
    return 'queued';
  }
  return undefined;
}

export function itemBoardKey(item: { session_id?: string | null; appointment_id?: string | null }): string {
  return item.session_id || item.appointment_id || 'unknown';
}
