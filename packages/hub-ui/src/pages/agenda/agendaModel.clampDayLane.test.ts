import { describe, expect, it } from 'vitest';
import { clampAppointmentToDayLane, startOfDay } from './agendaModel';

describe('clampAppointmentToDayLane', () => {
  const dayStart = startOfDay(new Date(2026, 10, 18));
  dayStart.setHours(7, 0, 0, 0);
  const dayMinutes = 13 * 60; // 07:00–20:00

  it('mantém atendimento dentro do dia', () => {
    const start = new Date(2026, 10, 18, 9, 0);
    const end = new Date(2026, 10, 18, 10, 30);
    expect(clampAppointmentToDayLane(start, end, dayStart, dayMinutes)).toEqual({
      startMins: 120,
      endMins: 210,
    });
  });

  it('corta hospedagem overnight no fim da grade', () => {
    const start = new Date(2026, 10, 18, 18, 0);
    const end = new Date(2026, 10, 19, 12, 0);
    const clamped = clampAppointmentToDayLane(start, end, dayStart, dayMinutes);
    expect(clamped).toEqual({
      startMins: 11 * 60,
      endMins: dayMinutes,
    });
  });

  it('retorna null quando o intervalo fica fora da grade', () => {
    const start = new Date(2026, 10, 18, 5, 0);
    const end = new Date(2026, 10, 18, 6, 0);
    expect(clampAppointmentToDayLane(start, end, dayStart, dayMinutes)).toBeNull();
  });
});
