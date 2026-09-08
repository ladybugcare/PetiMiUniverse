export const SURGERY_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

function localYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function scheduledYmd(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return localYmd(d);
}

/** Cirurgia ainda agendada para um dia depois de hoje. */
export function isSurgeryScheduledInFuture(surgery: {
  status?: string | null;
  scheduled_at?: string | null;
}): boolean {
  if (surgery.status && surgery.status !== 'scheduled') return false;
  const day = scheduledYmd(surgery.scheduled_at);
  return Boolean(day && day > localYmd());
}

export function futureSurgeryStartCopy(scheduledLabel: string): { title: string; message: string } {
  return {
    title: 'Esta cirurgia não é hoje',
    message: `O procedimento está marcado para ${scheduledLabel}. Se continuar, o horário na agenda passa para agora e o pet entra na sua fila de hoje.`,
  };
}
