import { describe, expect, it } from 'vitest';
import { shiftAppointmentToDay } from './agendaModel';

describe('shiftAppointmentToDay', () => {
  it('mantém horário e duração ao mudar o dia', () => {
    const start = new Date(2026, 8, 8, 14, 30, 0, 0);
    const end = new Date(2026, 8, 8, 15, 45, 0, 0);
    const target = new Date(2026, 8, 11, 0, 0, 0, 0);

    const moved = shiftAppointmentToDay(start, end, target);

    expect(moved.start.getFullYear()).toBe(2026);
    expect(moved.start.getMonth()).toBe(8);
    expect(moved.start.getDate()).toBe(11);
    expect(moved.start.getHours()).toBe(14);
    expect(moved.start.getMinutes()).toBe(30);
    expect(moved.end.getHours()).toBe(15);
    expect(moved.end.getMinutes()).toBe(45);
    expect(moved.end.getTime() - moved.start.getTime()).toBe(end.getTime() - start.getTime());
  });

  it('preserva duração de blocos que atravessam a meia-noite', () => {
    const start = new Date(2026, 8, 8, 22, 0, 0, 0);
    const end = new Date(2026, 8, 9, 8, 0, 0, 0);
    const target = new Date(2026, 8, 12);

    const moved = shiftAppointmentToDay(start, end, target);

    expect(moved.start.getDate()).toBe(12);
    expect(moved.start.getHours()).toBe(22);
    expect(moved.end.getDate()).toBe(13);
    expect(moved.end.getHours()).toBe(8);
    expect(moved.end.getTime() - moved.start.getTime()).toBe(10 * 60 * 60_000);
  });

  it('é no-op quando o dia alvo já é o dia do início', () => {
    const start = new Date(2026, 8, 8, 9, 0, 0, 0);
    const end = new Date(2026, 8, 8, 10, 0, 0, 0);

    const moved = shiftAppointmentToDay(start, end, new Date(2026, 8, 8, 18, 0, 0, 0));

    expect(moved.start.getTime()).toBe(start.getTime());
    expect(moved.end.getTime()).toBe(end.getTime());
  });
});
