import { describe, expect, it } from 'vitest';
import {
  PET_OPEN_GROOMING_CODE,
  PET_OPEN_GROOMING_MSG,
  pickOpenGroomingPresence,
} from '../hubGroomingOpenPresence';

describe('hubGroomingOpenPresence', () => {
  it('mensagens e código em pt-BR', () => {
    expect(PET_OPEN_GROOMING_CODE).toBe('PET_OPEN_GROOMING_PRESENCE');
    expect(PET_OPEN_GROOMING_MSG).toMatch(/Banho & Tosa em aberto/i);
  });

  it('prioriza sessão aberta', () => {
    const hit = pickOpenGroomingPresence({
      sessions: [{ id: 's1', grooming_stage: 'queued' }],
      appointments: [{ id: 'a1', status: 'checked_in', appointment_kind: 'walk_in' }],
    });
    expect(hit).toEqual({ kind: 'session', id: 's1', status: 'queued' });
  });

  it('detecta walk_in checked_in sem sessão', () => {
    const hit = pickOpenGroomingPresence({
      sessions: [],
      appointments: [{ id: 'a1', status: 'checked_in', appointment_kind: 'walk_in' }],
    });
    expect(hit).toEqual({ kind: 'appointment', id: 'a1', status: 'checked_in' });
  });

  it('ignora clínica e agendamento só confirmed', () => {
    expect(
      pickOpenGroomingPresence({
        sessions: [{ id: 'done', grooming_stage: 'ready' }],
        appointments: [
          { id: 'clin', status: 'checked_in', appointment_kind: 'clinical_walk_in' },
          { id: 'fut', status: 'confirmed', appointment_kind: 'walk_in' },
        ],
      }),
    ).toBeNull();
  });

  it('respeita excludeAppointmentId / excludeSessionId', () => {
    expect(
      pickOpenGroomingPresence({
        sessions: [{ id: 's1', grooming_stage: 'in_service' }],
        appointments: [],
        excludeSessionId: 's1',
      }),
    ).toBeNull();

    expect(
      pickOpenGroomingPresence({
        sessions: [],
        appointments: [{ id: 'a1', status: 'in_progress', appointment_kind: 'walk_in' }],
        excludeAppointmentId: 'a1',
      }),
    ).toBeNull();
  });

  it('detecta finishing como aberto', () => {
    const hit = pickOpenGroomingPresence({
      sessions: [{ id: 's2', grooming_stage: 'finishing' }],
      appointments: [],
    });
    expect(hit?.id).toBe('s2');
  });
});
