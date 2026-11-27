import { describe, expect, it } from 'vitest';
import {
  PET_OPEN_CLINICAL_CODE,
  PET_OPEN_CLINICAL_MSG,
  pickOpenClinicalPresence,
} from '../hubClinicalOpenPresence';

describe('hubClinicalOpenPresence', () => {
  it('mensagens e código em pt-BR', () => {
    expect(PET_OPEN_CLINICAL_CODE).toBe('PET_OPEN_CLINICAL_PRESENCE');
    expect(PET_OPEN_CLINICAL_MSG).toMatch(/atendimento ou encaixe clínico em aberto/i);
  });

  it('prioriza encounter aberto', () => {
    const hit = pickOpenClinicalPresence({
      encounters: [{ id: 'e1', status: 'in_progress' }],
      appointments: [{ id: 'a1', status: 'checked_in', appointment_kind: 'clinical_walk_in' }],
    });
    expect(hit).toEqual({ kind: 'encounter', id: 'e1', status: 'in_progress' });
  });

  it('detecta encaixe clínico checked_in', () => {
    const hit = pickOpenClinicalPresence({
      encounters: [],
      appointments: [{ id: 'a1', status: 'checked_in', appointment_kind: 'clinical_walk_in' }],
    });
    expect(hit).toEqual({ kind: 'appointment', id: 'a1', status: 'checked_in' });
  });

  it('ignora B&T walk_in e agendamento só confirmed', () => {
    expect(
      pickOpenClinicalPresence({
        encounters: [],
        appointments: [
          { id: 'bt', status: 'checked_in', appointment_kind: 'walk_in' },
          { id: 'fut', status: 'confirmed', appointment_kind: 'standard' },
        ],
      }),
    ).toBeNull();
  });

  it('respeita excludeAppointmentId / excludeEncounterId', () => {
    expect(
      pickOpenClinicalPresence({
        encounters: [{ id: 'e1', status: 'waiting' }],
        appointments: [],
        excludeEncounterId: 'e1',
      }),
    ).toBeNull();

    expect(
      pickOpenClinicalPresence({
        encounters: [],
        appointments: [{ id: 'a1', status: 'in_progress', appointment_kind: 'clinical_emergency' }],
        excludeAppointmentId: 'a1',
      }),
    ).toBeNull();
  });

  it('aceita standard checked_in (consulta clínica na fila)', () => {
    const hit = pickOpenClinicalPresence({
      encounters: [],
      appointments: [{ id: 'a2', status: 'checked_in', appointment_kind: 'standard' }],
    });
    expect(hit?.id).toBe('a2');
  });
});
