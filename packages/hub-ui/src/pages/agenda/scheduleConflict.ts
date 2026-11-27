import type { AgendaAppointment } from './agendaModel';

export const SCHEDULE_OVERLAP_CONFIRM_TITLE = 'Horário em conflito';
export const SCHEDULE_OVERLAP_CONFIRM_TEXT = 'Agendar mesmo assim';
export const SCHEDULE_OVERLAP_SERIES_CONFIRM_TEXT = 'Criar só as livres';
export const SCHEDULE_OVERLAP_CANCEL_TEXT = 'Voltar e ajustar';
export const SCHEDULE_OVERLAP_ALL_DATES_MESSAGE =
  'Todos os horários solicitados entram em conflito.';

export type LocalScheduleWindow = {
  staffId: string | null;
  resourceLabel: string | null;
  resourceId?: string | null;
  startMs: number;
  endMs: number;
};

export type LocalExistingSlot = {
  id: string;
  staffId: string | null;
  resourceLabel: string | null;
  resourceId?: string | null;
  resourceReleased?: boolean;
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

/** Série: todas as datas conflitam — não oferecer «Criar só as livres». */
export function isSeriesAllDatesConflictMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    /todos os horários solicitados entram em conflito/i.test(message) ||
    /nenhum agendamento criado/i.test(message)
  );
}

/** Exclui o próprio bloco, pai, filhos e irmãos da mesma visita (espelha o backend). */
export function collectRelatedScheduleExcludeIds(
  appointmentId: string | null | undefined,
  existing: Array<Pick<AgendaAppointment, 'id' | 'parent_appointment_id' | 'visit_group_id'>>,
): string[] {
  if (!appointmentId) return [];
  const ids = new Set<string>([appointmentId]);
  const self = existing.find((a) => a.id === appointmentId);
  const parentId = self?.parent_appointment_id ?? null;
  if (parentId) ids.add(parentId);
  const visitGroupId = self?.visit_group_id ?? null;

  for (const a of existing) {
    if (a.parent_appointment_id === appointmentId) ids.add(a.id);
    if (parentId && a.parent_appointment_id === parentId) ids.add(a.id);
    if (parentId && a.id === parentId) ids.add(a.id);
    if (visitGroupId && a.visit_group_id === visitGroupId) ids.add(a.id);
  }
  return [...ids];
}

export function agendaAppointmentToConflictSlot(a: AgendaAppointment): LocalExistingSlot {
  const resource = normalizeResource(a.resourceLabel);
  const parts = [
    a.displayServiceLabel || a.serviceName,
    a.petName,
    a.professionalName,
    resource,
  ].filter((x) => Boolean(x) && x !== '—');
  return {
    id: a.id,
    staffId: a.professionalId,
    resourceLabel: normalizeResource(a.resourceLabel),
    resourceId: a.hubResourceId ?? null,
    resourceReleased: Boolean(a.resourceReleasedAt),
    unitId: a.unitId ?? null,
    startMs: a.start.getTime(),
    endMs: a.end.getTime(),
    status: a.status,
    label: parts.join(' · ') || 'outro atendimento',
  };
}

function windowsShareConflict(
  a: LocalScheduleWindow,
  b: Pick<LocalScheduleWindow, 'staffId' | 'resourceLabel' | 'resourceId' | 'startMs' | 'endMs'> & {
    resourceReleased?: boolean;
  },
): 'staff' | 'resource' | null {
  if (!intervalsOverlap(a.startMs, a.endMs, b.startMs, b.endMs)) return null;
  const staffId = a.staffId || null;
  const staffConflict = Boolean(staffId && b.staffId && staffId === b.staffId);
  if (staffConflict) return 'staff';
  if (b.resourceReleased) return null;
  const resource = normalizeResource(a.resourceLabel);
  const otherResource = normalizeResource(b.resourceLabel);
  const resourceConflict = (() => {
    if (a.resourceId && b.resourceId) return a.resourceId === b.resourceId;
    return Boolean(resource && otherResource && resource === otherResource);
  })();
  return resourceConflict ? 'resource' : null;
}

function conflictReason(kind: 'staff' | 'resource'): string {
  return kind === 'staff'
    ? 'Horário em conflito com outro atendimento do mesmo profissional.'
    : 'Horário em conflito com outro atendimento no mesmo recurso/sala.';
}

/** Conflito entre blocos da mesma visita (ex.: Banho e Consulta com mesma Ana). */
export function findLocalWindowsMutualConflict(
  windows: LocalScheduleWindow[],
): LocalScheduleConflict | null {
  for (let i = 0; i < windows.length; i++) {
    const a = windows[i]!;
    for (let j = i + 1; j < windows.length; j++) {
      const b = windows[j]!;
      const kind = windowsShareConflict(a, b);
      if (!kind) continue;
      const resource = normalizeResource(b.resourceLabel) || normalizeResource(a.resourceLabel);
      return {
        reason: conflictReason(kind),
        label: resource
          ? `outro bloco desta visita · ${resource}`
          : 'outro bloco desta visita',
        conflictingId: `mutual:${i}:${j}`,
      };
    }
  }
  return null;
}

export function findLocalScheduleConflict(
  windows: LocalScheduleWindow[],
  existing: LocalExistingSlot[],
  excludeIds: Iterable<string> = [],
): LocalScheduleConflict | null {
  const mutual = findLocalWindowsMutualConflict(windows);
  if (mutual) return mutual;

  const exclude = new Set(excludeIds);
  const active = existing.filter(
    (row) => row.status !== 'cancelled' && row.status !== 'no_show' && !exclude.has(row.id),
  );

  for (const window of windows) {
    const resource = normalizeResource(window.resourceLabel);
    for (const row of active) {
      const kind = windowsShareConflict(window, row);
      if (!kind) continue;
      const rowResource = normalizeResource(row.resourceLabel);
      const labelWithResource =
        kind === 'resource' && rowResource && !row.label.includes(rowResource)
          ? `${row.label} · ${rowResource}`
          : row.label;
      return {
        reason: conflictReason(kind),
        label: labelWithResource,
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
    ? ' Deseja criar apenas as datas sem conflito?'
    : ' Deseja agendar mesmo assim?';
  if (/deseja /i.test(head)) return head;
  return `${head}${head.endsWith('.') ? '' : '.'}${ask}`;
}
