import { describe, expect, it } from 'vitest';
import { isExtraBlockChildHiddenFromGrid } from './extraBlockAgendaUtils';

describe('isExtraBlockChildHiddenFromGrid', () => {
  const parent = {
    id: 'hotel-1',
    parent_appointment_id: null as string | null,
    start: new Date(2026, 5, 1, 14, 0),
  };
  const sameDayChild = {
    id: 'bath-same',
    parent_appointment_id: 'hotel-1',
    start: new Date(2026, 5, 1, 16, 0),
  };
  const checkoutDayChild = {
    id: 'bath-out',
    parent_appointment_id: 'hotel-1',
    start: new Date(2026, 5, 3, 9, 0),
  };

  it('oculta filho no mesmo dia do pai', () => {
    expect(isExtraBlockChildHiddenFromGrid(sameDayChild, [parent, sameDayChild])).toBe(true);
  });

  it('mostra filho em outro dia (banho na saída)', () => {
    expect(isExtraBlockChildHiddenFromGrid(checkoutDayChild, [parent, checkoutDayChild])).toBe(
      false,
    );
  });

  it('mostra filho quando o pai não está no conjunto carregado', () => {
    expect(isExtraBlockChildHiddenFromGrid(checkoutDayChild, [checkoutDayChild])).toBe(false);
  });

  it('não oculta agendamento sem pai', () => {
    expect(isExtraBlockChildHiddenFromGrid(parent, [parent])).toBe(false);
  });
});
