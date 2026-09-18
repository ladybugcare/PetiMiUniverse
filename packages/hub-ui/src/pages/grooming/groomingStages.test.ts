import { describe, expect, it } from 'vitest';
import {
  appointmentStatusForGroomingStage,
  canOpenGroomingSessionFromAppointment,
  getItemBoardStage,
  groomingOpenSessionStage,
  resolveGroomingQuickAction,
} from './groomingStages';

describe('getItemBoardStage', () => {
  it('mapeia status de encaixe (checked_in) para o estágio de check-in', () => {
    expect(getItemBoardStage({ appointment_status: 'checked_in' })).toBe('checked_in');
  });
});

describe('appointmentStatusForGroomingStage', () => {
  it('fila (queued) espelha agenda checked_in, não in_progress', () => {
    expect(appointmentStatusForGroomingStage('queued')).toBe('checked_in');
    expect(appointmentStatusForGroomingStage('checked_in')).toBe('checked_in');
    expect(appointmentStatusForGroomingStage('in_service')).toBe('in_progress');
  });
});

describe('resolveGroomingQuickAction', () => {
  it('oferece check-in para agendamento confirmado sem sessão', () => {
    const action = resolveGroomingQuickAction(
      {
        appointment_id: 'a1',
        appointment_status: 'confirmed',
        grooming_stage: 'scheduled',
      },
      true,
    );
    expect(action).toEqual({ type: 'check_in' });
  });

  it('oferece abrir sessão para encaixe já em checked_in sem sessão', () => {
    const item = {
      appointment_id: 'a2',
      appointment_kind: 'walk_in',
      appointment_status: 'checked_in',
      grooming_stage: 'checked_in',
    };
    expect(canOpenGroomingSessionFromAppointment(item)).toBe(true);
    expect(resolveGroomingQuickAction(item, true)).toEqual({ type: 'check_in' });
    expect(groomingOpenSessionStage(item)).toBe('queued');
  });

  it('no kanban, encaixe em Aguardando sem sessão inicia o atendimento', () => {
    const item = {
      appointment_id: 'a2b',
      appointment_kind: 'walk_in',
      appointment_status: 'checked_in',
      grooming_stage: 'queued',
    };
    expect(canOpenGroomingSessionFromAppointment(item)).toBe(true);
    expect(resolveGroomingQuickAction(item, true)).toEqual({ type: 'check_in' });
    expect(groomingOpenSessionStage(item)).toBe('in_service');
  });

  it('não oferece ação se não houver permissão de escrita', () => {
    expect(
      resolveGroomingQuickAction(
        {
          appointment_id: 'a3',
          appointment_status: 'checked_in',
          grooming_stage: 'checked_in',
        },
        false,
      ),
    ).toBeNull();
  });

  it('avança quando já existe sessão na fila', () => {
    expect(
      resolveGroomingQuickAction(
        {
          session_id: 's1',
          appointment_id: 'a4',
          grooming_stage: 'queued',
        },
        true,
      ),
    ).toEqual({ type: 'advance' });
  });
});
