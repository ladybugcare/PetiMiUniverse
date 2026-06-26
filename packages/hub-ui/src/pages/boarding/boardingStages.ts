export type BoardingMode = 'hotel' | 'daycare' | 'all';

export const BOARDING_STAGES = ['reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show'] as const;
export type BoardingStage = (typeof BOARDING_STAGES)[number];

export const BOARDING_STAGE_LABELS: Record<BoardingStage, string> = {
  reserved: 'Reservado',
  checked_in: 'Hospedado',
  checked_out: 'Check-out',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
};

/**
 * Três colunas operacionais do painel do dia.
 * Fase 1 usa status do agendamento; Fase 2 usa status da reserva.
 */
export const BOARDING_BOARD_COLUMNS: { id: string; title: string; stages: BoardingStage[] }[] = [
  { id: 'expected', title: 'Previstos hoje', stages: ['reserved'] },
  { id: 'hosting', title: 'Hospedados', stages: ['checked_in'] },
  { id: 'departed', title: 'Saídas de hoje', stages: ['checked_out'] },
];

/** Mapeamento de status de agendamento (Fase 1, sem reserva) para coluna. */
export function boardingStageFromAppointmentStatus(status: string | null | undefined): BoardingStage {
  switch (status) {
    case 'in_progress':
      return 'checked_in';
    case 'done':
    case 'paid':
      return 'checked_out';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'reserved';
  }
}

export function getBoardingItemStage(item: {
  boarding_stage?: BoardingStage | string;
  reservation_status?: string | null;
  appointment_status?: string | null;
}): BoardingStage {
  if (item.boarding_stage && BOARDING_STAGES.includes(item.boarding_stage as BoardingStage)) {
    return item.boarding_stage as BoardingStage;
  }
  if (item.reservation_status && BOARDING_STAGES.includes(item.reservation_status as BoardingStage)) {
    return item.reservation_status as BoardingStage;
  }
  return boardingStageFromAppointmentStatus(item.appointment_status);
}

export function boardingItemKey(item: { reservation_id?: string | null; appointment_id?: string | null }): string {
  return item.reservation_id || item.appointment_id || 'unknown';
}
