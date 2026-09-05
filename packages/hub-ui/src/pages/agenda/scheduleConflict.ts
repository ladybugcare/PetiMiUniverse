import type { AgendaAppointment } from './agendaModel';

export const SCHEDULE_OVERLAP_CONFIRM_TITLE = 'Horário em conflito';
export const SCHEDULE_OVERLAP_CONFIRM_TEXT = 'Agendar mesmo assim';
export const SCHEDULE_OVERLAP_CANCEL_TEXT = 'Voltar e ajustar';

export type LocalScheduleWindow = {
  staffId: string | null;
  resourceLabel: string | null;
  startMs: number;
  endMs: number;
};

export type LocalExistingSlot = {
  id: string;
  staffId: string | null;
  resourceLabel: string | null;
  unitId?: string | null;
  startMs: number;
  endMs: number;
  status: string;
  label: string;
};

export type LocalScheduleConflict = {
  reason: string;
  label: string;
  conflictingId: string;
};

function normalizeResource(label: string | null | undefined): string | null {
  const t = (label ?? '').trim();
  if (!t || t === '—') return null;
  return t;
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** Mensagens 409 de conflito de agenda (staff/recurso/série). */
export function isScheduleConflictMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return /conflito/i.test(message);
}

export function agendaAppointmentToConflictSlot(a: AgendaAppointment): LocalExistingSlot {
  const parts = [a.displayServiceLabel || a.serviceName, a.petName, a.professionalName].filter(
    (x) => Boolean(x) && x !== '—',
  );
  return {
    id: a.id,
    staffId: a.professionalId,
    resourceLabel: normalizeResource(a.resourceLabel),
    unitId: a.unitId ?? null,
    startMs: a.start.getTime(),
    endMs: a.end.getTime(),
    status: a.status,
    label: parts.join(' · ') || 'outro atendimento',
  };
}

export function findLocalScheduleConflict(
  windows: LocalScheduleWindow[],
  existing: LocalExistingSlot[],
  excludeIds: Iterable<string> = [],
): LocalScheduleConflict | null {
  const exclude = new Set(excludeIds);
  const active = existing.filter((row) => row.status !== 'cancelled' && !exclude.has(row.id));

  for (const window of windows) {
    const staffId = window.staffId || null;
    const resource = normalizeResource(window.resourceLabel);
    for (const row of active) {
      if (!intervalsOverlap(window.startMs, window.endMs, row.startMs, row.endMs)) continue;
      const staffConflict = Boolean(staffId && row.staffId && staffId === row.staffId);
      const resourceConflict = Boolean(
        resource && row.resourceLabel && resource === row.resourceLabel,
      );
      if (!staffConflict && !resourceConflict) continue;
      return {
        reason: staffConflict
          ? 'Horário em conflito com outro atendimento do mesmo profissional.'
          : 'Horário em conflito com outro atendimento no mesmo recurso/sala.',
        label: row.label,
        conflictingId: row.id,
      };
    }
  }
  return null;
}

export function buildScheduleOverlapConfirmMessage(opts?: {
  detail?: string | null;
  reason?: string | null;
  isSeries?: boolean;
}): string {
  const detail = opts?.detail?.trim();
  const reason = opts?.reason?.trim();
  const head = detail
    ? `Este horário entra em conflito com «${detail}».`
    : reason && isScheduleConflictMessage(reason)
      ? reason.replace(/\s+$/, '')
      : 'Este horário entra em conflito com outro atendimento do mesmo profissional ou recurso.';
  const ask = opts?.isSeries
    ? ' Deseja criar todos os horários mesmo assim?'
    : ' Deseja agendar mesmo assim?';
  if (/deseja /i.test(head)) return head;
  return `${head}${head.endsWith('.') ? '' : '.'}${ask}`;
}
