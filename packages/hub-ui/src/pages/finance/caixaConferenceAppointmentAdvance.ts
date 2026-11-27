/**
 * Avanço de status de agendamento no painel de conferência do Caixa.
 * `done` só é aceito pelo backend a partir de checked_in / in_progress.
 */

import type { HubAppointmentStatus } from '../../api/hubAgendaApi';
import { hubAgendaApi } from '../../api/hubAgendaApi';

export const APPOINTMENT_STATUS_LABEL_PT: Record<string, string> = {
  pending_confirm: 'A confirmar',
  confirmed: 'Confirmado',
  checked_in: 'Aguardando',
  in_progress: 'Em atendimento',
  done: 'Finalizado',
  paid: 'Pago',
  cancelled: 'Cancelado',
  no_show: 'Falta',
};

export function appointmentStatusLabelPt(status: string | null | undefined): string {
  const s = String(status ?? '');
  return APPOINTMENT_STATUS_LABEL_PT[s] ?? (s || '—');
}

/** Passos de PATCH até `done` a partir do status atual. */
export function appointmentStepsToDone(
  currentStatus: string | null | undefined,
): HubAppointmentStatus[] {
  const st = String(currentStatus ?? '');
  if (st === 'done' || st === 'paid') return [];
  if (st === 'checked_in' || st === 'in_progress') return ['done'];
  if (st === 'confirmed' || st === 'pending_confirm') return ['checked_in', 'done'];
  // Desconhecido: tenta a cadeia segura (check-in → done).
  return ['checked_in', 'done'];
}

export function isAppointmentDoneBlockedError(error: unknown): boolean {
  const msg = String((error as Error)?.message ?? error ?? '');
  return /Finalizado a partir de Aguardando ou Em atendimento/i.test(msg);
}

/**
 * Conclui o agendamento para o caixa: se necessário, faz check-in antes do done.
 * Se `currentStatus` for omitido, tenta done e, no erro de transição, faz check-in → done.
 */
export async function concludeAppointmentForCaixa(opts: {
  appointmentId: string;
  clinicId: string;
  currentStatus?: string | null;
}): Promise<{ finalStatus: 'done'; stepsApplied: HubAppointmentStatus[] }> {
  const { appointmentId, clinicId } = opts;
  const stepsApplied: HubAppointmentStatus[] = [];

  if (opts.currentStatus != null && opts.currentStatus !== '') {
    const steps = appointmentStepsToDone(opts.currentStatus);
    for (const status of steps) {
      await hubAgendaApi.patch(appointmentId, { clinic_id: clinicId, status });
      stepsApplied.push(status);
    }
    return { finalStatus: 'done', stepsApplied };
  }

  try {
    await hubAgendaApi.patch(appointmentId, { clinic_id: clinicId, status: 'done' });
    return { finalStatus: 'done', stepsApplied: ['done'] };
  } catch (e) {
    if (!isAppointmentDoneBlockedError(e)) throw e;
  }

  await hubAgendaApi.patch(appointmentId, { clinic_id: clinicId, status: 'checked_in' });
  stepsApplied.push('checked_in');
  await hubAgendaApi.patch(appointmentId, { clinic_id: clinicId, status: 'done' });
  stepsApplied.push('done');
  return { finalStatus: 'done', stepsApplied };
}
