/** Limiar (px²) para considerar que o pointer virou arraste. */
export const AGENDA_DRAG_THRESHOLD_PX = 6;

export type AgendaDropHit =
  | { kind: 'lane'; colKey: string; el: HTMLElement }
  | { kind: 'cal'; ymd: string; colKey?: string; el: HTMLElement };

/** Resolve o alvo de drop sob o cursor (`data-agenda-drop`). */
export function hitTestAgendaDrop(clientX: number, clientY: number): AgendaDropHit | null {
  if (typeof document === 'undefined') return null;
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    if (!(node instanceof Element)) continue;
    const host = node.closest('[data-agenda-drop]');
    if (!(host instanceof HTMLElement)) continue;
    const raw = host.getAttribute('data-agenda-drop');
    if (!raw) continue;
    if (raw.startsWith('lane:')) {
      return { kind: 'lane', colKey: raw.slice('lane:'.length), el: host };
    }
    if (raw.startsWith('cal:')) {
      const rest = raw.slice('cal:'.length);
      const parts = rest.split(':');
      const ymd = parts[0] ?? '';
      const colKey = parts.length > 1 ? parts.slice(1).join(':') : undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
      return { kind: 'cal', ymd, colKey, el: host };
    }
  }
  return null;
}

export function minutesFromLanePointer(
  clientY: number,
  laneEl: HTMLElement,
  pxPerMin: number,
  dayMinutes: number,
): number {
  const lane = laneEl.getBoundingClientRect();
  let minutesFromStart = (clientY - lane.top) / pxPerMin;
  minutesFromStart = Math.max(0, Math.min(minutesFromStart, dayMinutes - 15));
  return Math.round(minutesFromStart / 15) * 15;
}
