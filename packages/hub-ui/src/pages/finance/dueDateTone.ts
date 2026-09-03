/** Dias restantes para considerar “muito próximo do vencimento”. */
export const DUE_SOON_DAYS = 3;

export type DueDateTone = 'none' | 'ok' | 'soon' | 'overdue';

export type DueDateToneInfo = {
  tone: DueDateTone;
  /** Dias até o vencimento (negativo = já venceu). Null se sem data. */
  daysUntil: number | null;
  label: string;
};

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Diferença em dias civis: positivo = ainda a vencer; negativo = vencido. */
export function daysUntilDue(dueDate: string | null | undefined, asOf = new Date()): number | null {
  if (!dueDate) return null;
  const due = new Date(`${dueDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date(`${ymdLocal(asOf)}T12:00:00`);
  return Math.floor((due.getTime() - today.getTime()) / 86_400_000);
}

export function resolveDueDateTone(
  dueDate: string | null | undefined,
  opts?: { soonDays?: number; asOf?: Date; status?: string | null },
): DueDateToneInfo {
  const status = opts?.status ?? null;
  if (status === 'paid' || status === 'cancelled' || status === 'refunded') {
    return { tone: 'none', daysUntil: daysUntilDue(dueDate, opts?.asOf), label: '' };
  }

  const daysUntil = daysUntilDue(dueDate, opts?.asOf);
  if (daysUntil == null) {
    return { tone: 'none', daysUntil: null, label: 'Sem vencimento' };
  }

  const soonDays = opts?.soonDays ?? DUE_SOON_DAYS;
  if (daysUntil < 0) {
    const overdue = Math.abs(daysUntil);
    return {
      tone: 'overdue',
      daysUntil,
      label: overdue === 1 ? 'Vencido há 1 dia' : `Vencido há ${overdue} dias`,
    };
  }
  if (daysUntil === 0) {
    return { tone: 'soon', daysUntil, label: 'Vence hoje' };
  }
  if (daysUntil <= soonDays) {
    return {
      tone: 'soon',
      daysUntil,
      label: daysUntil === 1 ? 'Vence amanhã' : `Vence em ${daysUntil} dias`,
    };
  }
  return {
    tone: 'ok',
    daysUntil,
    label: `A vencer · ${daysUntil} dias`,
  };
}

export function formatDueDateShort(dueDate: string | null | undefined): string {
  if (!dueDate) return 'Sem vencimento';
  const [y, m, d] = dueDate.slice(0, 10).split('-');
  if (!y || !m || !d) return dueDate;
  return `venc. ${d}/${m}/${y}`;
}
