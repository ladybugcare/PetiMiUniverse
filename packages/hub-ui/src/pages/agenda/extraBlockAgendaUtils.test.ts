import { describe, expect, it } from 'vitest';
import type { AgendaAppointment, AgendaStatus } from './agendaModel';
import {
  excludeLockedAgendaExtraBlocks,
  findExtraBlockChildren,
  isExtraBlockChildHiddenFromGrid,
} from './extraBlockAgendaUtils';

function miniAppt(
  partial: Partial<AgendaAppointment> &
    Pick<AgendaAppointment, 'id' | 'start' | 'end' | 'status'>,
): AgendaAppointment {
  return {
    serviceName: 'Serviço',
    group: 'banho_tosa',
    agendaColor: null,
    professionalId: null,
    professionalName: '—',
    resourceLabel: '—',
    unitName: 'Unidade',
    petName: 'Pipoca',
    guardianName: 'Tutor',
    petId: 'pet-1',
    guardianId: 'gu-1',
    appointment_kind: 'standard',
    ...partial,
  };
}

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

describe('excludeLockedAgendaExtraBlocks / findExtraBlockChildren (edit)', () => {
  const parent = miniAppt({
    id: 'parent-1',
    start: new Date(2026, 5, 1, 10, 0),
    end: new Date(2026, 5, 1, 11, 0),
    status: 'confirmed',
  });
  const openChild = miniAppt({
    id: 'child-open',
    parent_appointment_id: 'parent-1',
    start: new Date(2026, 5, 1, 11, 0),
    end: new Date(2026, 5, 1, 12, 0),
    status: 'confirmed',
  });
  const paidChild = miniAppt({
    id: 'child-paid',
    parent_appointment_id: 'parent-1',
    start: new Date(2026, 5, 1, 12, 0),
    end: new Date(2026, 5, 1, 13, 0),
    status: 'paid',
  });

  it('findExtraBlockChildren inclui filhos pagos (lista bruta)', () => {
    const found = findExtraBlockChildren(parent, [parent, openChild, paidChild]);
    expect(found.map((a) => a.id)).toEqual(['child-open', 'child-paid']);
  });

  it('excludeLockedAgendaExtraBlocks remove pago/finalizado/cancelado/falta', () => {
    const locked: AgendaStatus[] = ['done', 'cancelled', 'paid', 'no_show'];
    const children = locked.map((status, i) =>
      miniAppt({
        id: `locked-${status}`,
        parent_appointment_id: 'parent-1',
        start: new Date(2026, 5, 1, 11 + i, 0),
        end: new Date(2026, 5, 1, 12 + i, 0),
        status,
      }),
    );
    const filtered = excludeLockedAgendaExtraBlocks([openChild, ...children]);
    expect(filtered.map((a) => a.id)).toEqual(['child-open']);
  });

  it('edit path: filho paid no mesmo dia não entra nos extras', () => {
    const forEdit = excludeLockedAgendaExtraBlocks(
      findExtraBlockChildren(parent, [parent, openChild, paidChild]),
    );
    expect(forEdit.map((a) => a.id)).toEqual(['child-open']);
  });
});
