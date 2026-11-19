import { describe, expect, it } from 'vitest';
import { layoutDayLaneAppointments } from './agendaModel';

function appt(id: string, startH: number, startM: number, endH: number, endM: number) {
  return {
    id,
    start: new Date(2026, 10, 18, startH, startM),
    end: new Date(2026, 10, 18, endH, endM),
  };
}

describe('layoutDayLaneAppointments', () => {
  it('coloca eventos sem sobreposição em colunas únicas', () => {
    const layout = layoutDayLaneAppointments([
      appt('a', 9, 0, 10, 0),
      appt('b', 10, 0, 11, 0),
    ]);

    expect(layout.get('a')).toEqual({ column: 0, columnCount: 1 });
    expect(layout.get('b')).toEqual({ column: 0, columnCount: 1 });
  });

  it('coloca dois eventos sobrepostos lado a lado', () => {
    const layout = layoutDayLaneAppointments([
      appt('a', 9, 0, 10, 0),
      appt('b', 9, 30, 10, 30),
    ]);

    expect(layout.get('a')).toEqual({ column: 0, columnCount: 2 });
    expect(layout.get('b')).toEqual({ column: 1, columnCount: 2 });
  });

  it('reusa coluna quando o horário fica livre de novo', () => {
    const layout = layoutDayLaneAppointments([
      appt('a', 9, 0, 10, 0),
      appt('b', 9, 30, 10, 30),
      appt('c', 10, 0, 11, 0),
    ]);

    expect(layout.get('a')?.column).toBe(0);
    expect(layout.get('b')?.column).toBe(1);
    expect(layout.get('c')?.column).toBe(0);
    expect(layout.get('a')?.columnCount).toBe(2);
    expect(layout.get('b')?.columnCount).toBe(2);
    expect(layout.get('c')?.columnCount).toBe(2);
  });

  it('respeita bounds do dia ao empacotar overnight', () => {
    const dayStart = new Date(2026, 10, 18, 7, 0);
    const overnight = {
      id: 'hotel',
      start: new Date(2026, 10, 18, 18, 0),
      end: new Date(2026, 10, 19, 12, 0),
    };
    const other = appt('other', 18, 30, 19, 0);

    const layout = layoutDayLaneAppointments([overnight, other], {
      dayStart,
      dayMinutes: 13 * 60,
    });

    expect(layout.get('hotel')).toEqual({ column: 0, columnCount: 2 });
    expect(layout.get('other')).toEqual({ column: 1, columnCount: 2 });
  });
});
