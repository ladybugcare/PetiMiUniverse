import { describe, expect, it } from 'vitest';
import {
  AGENDA_STRUCTURAL_EDIT_BLOCK_MESSAGE,
  agendaAppointmentEditBlockReason,
  canEditAgendaAppointment,
  MANUAL_SITUACAO_STATUSES,
  type AgendaStatus,
} from './agendaModel';

function appt(status: AgendaStatus, start: Date) {
  return { status, start };
}

describe('canEditAgendaAppointment / agendaAppointmentEditBlockReason', () => {
  const past = new Date('2020-01-01T10:00:00');
  const future = new Date('2099-01-01T10:00:00');
  const now = new Date('2026-06-15T12:00:00');

  it('bloqueia quando o horário agendado já passou, mesmo confirmado', () => {
    expect(canEditAgendaAppointment(appt('confirmed', past), { canWrite: true, now })).toBe(false);
    expect(canEditAgendaAppointment(appt('pending_confirm', past), { canWrite: true, now })).toBe(false);
    expect(agendaAppointmentEditBlockReason(appt('confirmed', past), { canWrite: true, now })).toBe(
      AGENDA_STRUCTURAL_EDIT_BLOCK_MESSAGE,
    );
  });

  it('bloqueia aguardando / em atendimento (não são editáveis estruturalmente)', () => {
    expect(canEditAgendaAppointment(appt('checked_in', future), { canWrite: true, now })).toBe(false);
    expect(canEditAgendaAppointment(appt('in_progress', future), { canWrite: true, now })).toBe(false);
    expect(agendaAppointmentEditBlockReason(appt('in_progress', future), { canWrite: true, now })).toBe(
      AGENDA_STRUCTURAL_EDIT_BLOCK_MESSAGE,
    );
  });

  it('permite remarcar no futuro se estiver a confirmar ou confirmado', () => {
    expect(canEditAgendaAppointment(appt('confirmed', future), { canWrite: true, now })).toBe(true);
    expect(canEditAgendaAppointment(appt('pending_confirm', future), { canWrite: true, now })).toBe(true);
    expect(agendaAppointmentEditBlockReason(appt('confirmed', future), { canWrite: true, now })).toBeNull();
  });

  it('bloqueia statuses encerrados com motivo legível', () => {
    for (const status of ['done', 'cancelled', 'paid', 'no_show'] as AgendaStatus[]) {
      expect(canEditAgendaAppointment(appt(status, future), { canWrite: true, now })).toBe(false);
      const reason = agendaAppointmentEditBlockReason(appt(status, future), { canWrite: true, now });
      expect(reason).toMatch(/Não é possível remarcar/);
    }
  });

  it('bloqueia sem permissão de escrita', () => {
    expect(canEditAgendaAppointment(appt('confirmed', future), { canWrite: false, now })).toBe(false);
    expect(agendaAppointmentEditBlockReason(appt('confirmed', future), { canWrite: false, now })).toMatch(
      /permissão/,
    );
  });

  it('MANUAL_SITUACAO_STATUSES não inclui Pago nem Finalizado', () => {
    expect(MANUAL_SITUACAO_STATUSES).toEqual([
      'pending_confirm',
      'confirmed',
      'checked_in',
      'in_progress',
    ]);
    expect(MANUAL_SITUACAO_STATUSES).not.toContain('paid');
    expect(MANUAL_SITUACAO_STATUSES).not.toContain('done');
    expect(MANUAL_SITUACAO_STATUSES).not.toContain('cancelled');
    expect(MANUAL_SITUACAO_STATUSES).not.toContain('no_show');
  });
});
