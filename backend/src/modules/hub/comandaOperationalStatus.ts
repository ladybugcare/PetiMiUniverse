/**
 * Critério de “operação concluída” para conferência do caixa (listagem leve + detalhe).
 * Espelha isOperationalCompleteForComanda sem I/O — usado no enrich=light em lote.
 */

import { isGroomingServiceOperationallyDone } from './groomingStages';

export type ComandaOperationalOriginSnapshot = {
  originType: string;
  originId?: string | null;
  /** Status do agendamento (quando origin=appointment). */
  appointmentStatus?: string | null;
  /** Encounter clínico aberto ligado ao appointment. */
  hasOpenEncounter?: boolean;
  groomingStage?: string | null;
  encounterStatus?: string | null;
  boardingStatus?: string | null;
};

const CANCELLED_ORIGIN_STATUSES = new Set(['cancelled', 'no_show']);

/** Origem operacional cancelada ou com falta: a comanda não deveria seguir para cobrança. */
export function isComandaOriginCancelled(input: ComandaOperationalOriginSnapshot): boolean {
  const ot = String(input.originType ?? '');
  if (!input.originId) return false;
  if (ot === 'appointment') return CANCELLED_ORIGIN_STATUSES.has(String(input.appointmentStatus ?? ''));
  if (ot === 'encounter') return CANCELLED_ORIGIN_STATUSES.has(String(input.encounterStatus ?? ''));
  if (ot === 'boarding_reservation') return CANCELLED_ORIGIN_STATUSES.has(String(input.boardingStatus ?? ''));
  if (ot === 'grooming_session') return CANCELLED_ORIGIN_STATUSES.has(String(input.groomingStage ?? ''));
  return false;
}

export function classifyComandaOperationalComplete(
  input: ComandaOperationalOriginSnapshot,
): boolean {
  const ot = String(input.originType ?? '');
  const oid = input.originId ? String(input.originId) : '';
  if (!oid) return true;
  if (ot === 'quote' || ot === 'manual' || ot === 'package' || ot === 'series_invoice') return true;

  if (ot === 'appointment') {
    if (input.hasOpenEncounter) return false;
    const st = String(input.appointmentStatus ?? '');
    return st === 'done' || st === 'paid';
  }
  if (ot === 'grooming_session') {
    return isGroomingServiceOperationallyDone(String(input.groomingStage ?? ''));
  }
  if (ot === 'encounter') {
    return String(input.encounterStatus ?? '') === 'completed';
  }
  if (ot === 'boarding_reservation') {
    return String(input.boardingStatus ?? '') === 'checked_out';
  }
  return true;
}
