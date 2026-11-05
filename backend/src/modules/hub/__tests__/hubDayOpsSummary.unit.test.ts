import { dayBoundsFromYmdSaoPaulo } from '../boardingOperational';

describe('day-ops-summary helpers', () => {
  it('dayBoundsFromYmdSaoPaulo cobre o dia civil de Brasília', () => {
    const { from, to } = dayBoundsFromYmdSaoPaulo('2026-10-08');
    // Início 00:00 -03 → 03:00Z do mesmo dia; fim 23:59:59.999 -03 → 02:59:59.999Z do dia seguinte
    expect(from).toBe('2026-10-08T03:00:00.000Z');
    expect(to).toBe('2026-10-09T02:59:59.999Z');
    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
  });
});
