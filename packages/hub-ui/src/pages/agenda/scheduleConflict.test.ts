import { describe, expect, it } from 'vitest';
import {
  buildScheduleOverlapConfirmMessage,
  findLocalScheduleConflict,
  isScheduleConflictMessage,
  type LocalExistingSlot,
} from './scheduleConflict';

function slot(partial: Partial<LocalExistingSlot> & Pick<LocalExistingSlot, 'id' | 'startMs' | 'endMs'>): LocalExistingSlot {
  return {
    staffId: 'staff-1',
    resourceLabel: null,
    status: 'confirmed',
    label: 'Banho · Rex',
    ...partial,
  };
}

describe('isScheduleConflictMessage', () => {
  it('reconhece conflito de profissional e recurso', () => {
    expect(
      isScheduleConflictMessage('Horário em conflito com outro atendimento do mesmo profissional.'),
    ).toBe(true);
    expect(
      isScheduleConflictMessage('Horário em conflito com outro atendimento no mesmo recurso/sala.'),
    ).toBe(true);
    expect(isScheduleConflictMessage('Todos os horários solicitados entram em conflito.')).toBe(true);
  });

  it('ignora outros erros', () => {
    expect(isScheduleConflictMessage('Agendamento não pode ser editado após iniciado.')).toBe(false);
    expect(isScheduleConflictMessage('Selecione o tutor.')).toBe(false);
  });
});

describe('findLocalScheduleConflict', () => {
  const existing = [
    slot({ id: 'a1', startMs: 10, endMs: 20, label: 'Banho · Rex' }),
    slot({ id: 'a2', staffId: 'staff-2', startMs: 30, endMs: 40, label: 'Tosa · Luna' }),
  ];

  it('detecta sobreposição no mesmo profissional', () => {
    const found = findLocalScheduleConflict(
      [{ staffId: 'staff-1', resourceLabel: null, startMs: 15, endMs: 25 }],
      existing,
    );
    expect(found?.conflictingId).toBe('a1');
    expect(found?.reason).toMatch(/profissional/);
  });

  it('não marca horários adjacentes', () => {
    expect(
      findLocalScheduleConflict(
        [{ staffId: 'staff-1', resourceLabel: null, startMs: 20, endMs: 30 }],
        existing,
      ),
    ).toBeNull();
  });

  it('ignora outro profissional no mesmo horário', () => {
    expect(
      findLocalScheduleConflict(
        [{ staffId: 'staff-2', resourceLabel: null, startMs: 10, endMs: 20 }],
        existing,
      ),
    ).toBeNull();
  });

  it('respeita exclusão (edição do próprio agendamento)', () => {
    expect(
      findLocalScheduleConflict(
        [{ staffId: 'staff-1', resourceLabel: null, startMs: 10, endMs: 20 }],
        existing,
        ['a1'],
      ),
    ).toBeNull();
  });

  it('detecta conflito de recurso', () => {
    const found = findLocalScheduleConflict(
      [{ staffId: null, resourceLabel: 'Sala 1', startMs: 10, endMs: 20 }],
      [slot({ id: 'r1', staffId: null, resourceLabel: 'Sala 1', startMs: 12, endMs: 18, label: 'Sala 1' })],
    );
    expect(found?.reason).toMatch(/recurso/);
  });
});

describe('buildScheduleOverlapConfirmMessage', () => {
  it('pede confirmação antes de salvar', () => {
    expect(buildScheduleOverlapConfirmMessage({ detail: 'Banho · Rex' })).toContain(
      'Deseja agendar mesmo assim',
    );
  });
});
