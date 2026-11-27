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
