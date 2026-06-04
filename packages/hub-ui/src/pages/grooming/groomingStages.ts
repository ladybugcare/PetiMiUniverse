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

export const GROOMING_NEXT_STAGE: Partial<Record<GroomingStage, GroomingStage>> = {
  scheduled: 'checked_in',
  checked_in: 'queued',
  queued: 'in_service',
  in_service: 'finishing',
  finishing: 'ready',
  ready: 'delivered',
  delivered: 'closed',
};

export const GROOMING_BOARD_COLUMNS: { id: string; title: string; stages: GroomingStage[] }[] = [
  { id: 'confirmed', title: 'Confirmados', stages: ['scheduled', 'checked_in'] },
  { id: 'queued', title: 'Aguardando', stages: ['queued'] },
  { id: 'service', title: 'Em atendimento', stages: ['in_service'] },
  { id: 'finishing', title: 'Finalização', stages: ['finishing', 'ready'] },
  { id: 'done', title: 'Finalizados', stages: ['delivered', 'closed'] },
];

/** Espelha `backend/src/modules/hub/groomingStages.ts` — transições válidas para DnD e PATCH. */
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

/** Primeiro estágio da coluna de destino alcançável num único passo a partir do atual. */
export function pickDropTargetStage(
  current: GroomingStage,
  columnStages: GroomingStage[],
): GroomingStage | null {
  for (const s of columnStages) {
    if (canTransitionGroomingStage(current, s)) return s;
  }
  return null;
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
  if (st === 'in_progress') return 'checked_in';
  if (st === 'done') return 'ready';
  if (st === 'paid') return 'closed';
  return 'scheduled';
}

export function itemBoardKey(item: { session_id?: string | null; appointment_id?: string | null }): string {
  return item.session_id || item.appointment_id || 'unknown';
}
