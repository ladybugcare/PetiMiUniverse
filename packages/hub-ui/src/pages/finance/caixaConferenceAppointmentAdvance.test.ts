import { describe, expect, it } from 'vitest';
import {
  appointmentStepsToDone,
  appointmentStatusLabelPt,
  isAppointmentDoneBlockedError,
} from './caixaConferenceAppointmentAdvance';

describe('appointmentStepsToDone', () => {
  it('já finalizado → sem passos', () => {
    expect(appointmentStepsToDone('done')).toEqual([]);
    expect(appointmentStepsToDone('paid')).toEqual([]);
  });

  it('aguardando / em atendimento → só done', () => {
    expect(appointmentStepsToDone('checked_in')).toEqual(['done']);
    expect(appointmentStepsToDone('in_progress')).toEqual(['done']);
  });

  it('confirmado / a confirmar → check-in depois done', () => {
    expect(appointmentStepsToDone('confirmed')).toEqual(['checked_in', 'done']);
    expect(appointmentStepsToDone('pending_confirm')).toEqual(['checked_in', 'done']);
  });
});

describe('appointmentStatusLabelPt', () => {
  it('traduz status conhecidos', () => {
    expect(appointmentStatusLabelPt('confirmed')).toBe('Confirmado');
    expect(appointmentStatusLabelPt('checked_in')).toBe('Aguardando');
  });
});

describe('isAppointmentDoneBlockedError', () => {
  it('detecta mensagem do backend', () => {
    expect(
      isAppointmentDoneBlockedError(
        new Error('Só é possível marcar Finalizado a partir de Aguardando ou Em atendimento.'),
      ),
    ).toBe(true);
    expect(isAppointmentDoneBlockedError(new Error('outro'))).toBe(false);
  });
});
