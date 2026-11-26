import { describe, expect, it } from 'vitest';
import { isExtraBlockChildHiddenFromGrid } from './extraBlockAgendaUtils';

describe('isExtraBlockChildHiddenFromGrid', () => {
  const hotelParent = {
    id: 'hotel-1',
    parent_appointment_id: null as string | null,
    start: new Date(2026, 5, 1, 14, 0),
    appointment_kind: 'hotel_stay',
  };
  const standardParent = {
    id: 'banho-1',
    parent_appointment_id: null as string | null,
    start: new Date(2026, 5, 1, 10, 0),
    appointment_kind: 'standard',
  };
  const sameDayHotelChild = {
    id: 'bath-same',
    parent_appointment_id: 'hotel-1',
    start: new Date(2026, 5, 1, 16, 0),
  };
  const checkoutDayChild = {
    id: 'bath-out',
    parent_appointment_id: 'hotel-1',
    start: new Date(2026, 5, 3, 9, 0),
  };
  const sameDayConsulta = {
    id: 'consulta-1',
    parent_appointment_id: 'banho-1',
    start: new Date(2026, 5, 1, 11, 0),
  };

  it('oculta filho de hotel no mesmo dia do pai', () => {
    expect(isExtraBlockChildHiddenFromGrid(sameDayHotelChild, [hotelParent, sameDayHotelChild])).toBe(
      true,
    );
  });

  it('mostra filho de hotel em outro dia (banho na saída)', () => {
    expect(isExtraBlockChildHiddenFromGrid(checkoutDayChild, [hotelParent, checkoutDayChild])).toBe(
      false,
    );
  });

  it('mostra bloco extra standard no mesmo dia (Banho + Consulta)', () => {
    expect(isExtraBlockChildHiddenFromGrid(sameDayConsulta, [standardParent, sameDayConsulta])).toBe(
      false,
    );
  });

  it('mostra filho quando o pai não está no conjunto carregado', () => {
    expect(isExtraBlockChildHiddenFromGrid(checkoutDayChild, [checkoutDayChild])).toBe(false);
  });

  it('não oculta agendamento sem pai', () => {
    expect(isExtraBlockChildHiddenFromGrid(hotelParent, [hotelParent])).toBe(false);
  });
});
