import { describe, expect, it } from 'vitest';
import {
  agendaAppointmentEditBlockReason,
  canEditAgendaAppointment,
  type AgendaStatus,
} from './agendaModel';

function appt(status: AgendaStatus, start: Date) {
  return { status, start };
}

describe('canEditAgendaAppointment / agendaAppointmentEditBlockReason', () => {
  const past = new Date('2020-01-01T10:00:00');
  const future = new Date('2099-01-01T10:00:00');

  it('permite remarcar no passado se ainda estiver aberto', () => {
    expect(canEditAgendaAppointment(appt('confirmed', past), { canWrite: true })).toBe(true);
    expect(canEditAgendaAppointment(appt('pending_confirm', past), { canWrite: true })).toBe(true);
    expect(canEditAgendaAppointment(appt('checked_in', past), { canWrite: true })).toBe(true);
    expect(canEditAgendaAppointment(appt('in_progress', past), { canWrite: true })).toBe(true);
    expect(agendaAppointmentEditBlockReason(appt('confirmed', past), { canWrite: true })).toBeNull();
  });

  it('permite remarcar no futuro se estiver aberto', () => {
    expect(canEditAgendaAppointment(appt('confirmed', future), { canWrite: true })).toBe(true);
    expect(canEditAgendaAppointment(appt('checked_in', future), { canWrite: true })).toBe(true);
  });

  it('bloqueia statuses encerrados com motivo legível', () => {
    for (const status of ['done', 'cancelled', 'paid', 'no_show'] as AgendaStatus[]) {
      expect(canEditAgendaAppointment(appt(status, future), { canWrite: true })).toBe(false);
      const reason = agendaAppointmentEditBlockReason(appt(status, future), { canWrite: true });
      expect(reason).toMatch(/Não é possível remarcar/);
    }
  });

  it('bloqueia sem permissão de escrita', () => {
    expect(canEditAgendaAppointment(appt('confirmed', future), { canWrite: false })).toBe(false);
    expect(agendaAppointmentEditBlockReason(appt('confirmed', future), { canWrite: false })).toMatch(
      /permissão/,
    );
  });
});
