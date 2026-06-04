/** Utilitários de calendário para HubDateField (pt-BR, semana começando no domingo). */

export function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayYmd(): string {
  return formatYmd(new Date());
}

export function parseIsoYmd(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export type CalendarCell = {
  iso: string;
  day: number;
  inMonth: boolean;
};

/** Grelha 6×7 com domingo como primeira coluna. */
export function getMonthGrid(viewYear: number, viewMonth0: number): CalendarCell[] {
  const first = new Date(viewYear, viewMonth0, 1);
  const startDow = first.getDay();
  const start = new Date(viewYear, viewMonth0, 1 - startDow);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      iso: formatYmd(d),
      day: d.getDate(),
      inMonth: d.getMonth() === viewMonth0,
    });
  }
  return cells;
}

export const WEEKDAY_LABELS_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;

export function formatMonthYearPt(viewYear: number, viewMonth0: number): string {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(viewYear, viewMonth0, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}
