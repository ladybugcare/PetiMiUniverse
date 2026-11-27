import { describe, expect, it } from 'vitest';
import {
  dayBoardPrimaryActionLabel,
  formatCockpitDayLabel,
  formatCockpitShortDate,
  isDayBoardHospitalization,
  isDayBoardSurgery,
  isFinalOperationalStatus,
  isSurgeryPendingDestination,
  itemOperationalStatus,
  resolveDayBoardPrimaryAction,
} from './vetCockpitUtils';

describe('formatCockpitDayLabel', () => {
  const now = new Date(2026, 8, 3);

  it('usa singular e Hoje no dia corrente', () => {
    expect(formatCockpitDayLabel(new Date(2026, 8, 3), 1, now)).toBe('Hoje · 1 atendimento');
  });

  it('usa plural no dia corrente', () => {
    expect(formatCockpitDayLabel(new Date(2026, 8, 3), 3, now)).toBe('Hoje · 3 atendimentos');
  });

  it('mostra a data quando o cursor não é hoje', () => {
    const label = formatCockpitDayLabel(new Date(2026, 8, 2), 2, now);
    expect(label).toMatch(/2 atendimentos$/);
    expect(label).not.toMatch(/^Hoje/);
  });
});

describe('isFinalOperationalStatus', () => {
  it('marca finalizado, concluído e cancelado como encerrados', () => {
    expect(isFinalOperationalStatus('completed')).toBe(true);
    expect(isFinalOperationalStatus('done')).toBe(true);
    expect(isFinalOperationalStatus('cancelled')).toBe(true);
  });

  it('mantém status em andamento abertos', () => {
    expect(isFinalOperationalStatus('in_progress')).toBe(false);
    expect(isFinalOperationalStatus('awaiting_exams')).toBe(false);
    expect(isFinalOperationalStatus('waiting')).toBe(false);
  });
});

describe('isDayBoardSurgery', () => {
  it('reconhece item com ficha cirúrgica', () => {
    expect(isDayBoardSurgery({ kind: 'appointment_slot', surgery_id: 's1' })).toBe(true);
  });

  it('reconhece slot do grupo cirurgia', () => {
    expect(
      isDayBoardSurgery({
        kind: 'appointment_slot',
        service_type: { id: 't1', name: 'Castração', service_group: 'cirurgia' },
      }),
    ).toBe(true);
  });

  it('não marca consulta comum', () => {
    expect(
      isDayBoardSurgery({
        kind: 'encounter',
        service_type: { id: 't2', name: 'Consulta', service_group: 'clinica' },
      }),
    ).toBe(false);
  });
});

describe('isDayBoardHospitalization', () => {
  it('reconhece slot do grupo internação', () => {
    expect(
      isDayBoardHospitalization({
        kind: 'appointment_slot',
        service_type: { id: 't1', name: 'Internação — diária', service_group: 'internacao' },
      }),
    ).toBe(true);
  });

  it('não marca consulta ou cirurgia', () => {
    expect(
      isDayBoardHospitalization({
        kind: 'appointment_slot',
        service_type: { id: 't2', name: 'Consulta', service_group: 'clinica' },
      }),
    ).toBe(false);
    expect(
      isDayBoardHospitalization({
        kind: 'appointment_slot',
        surgery_id: 's1',
        service_type: { id: 't3', name: 'Castração', service_group: 'cirurgia' },
      }),
    ).toBe(false);
  });
});

describe('resolveDayBoardPrimaryAction', () => {
  it('prioriza ficha de cirurgia quando há surgery_id', () => {
    expect(
      resolveDayBoardPrimaryAction({
        kind: 'appointment_slot',
        appointment_id: 'a1',
        surgery_id: 's1',
        service_type: { id: 't1', name: 'Castração', service_group: 'cirurgia' },
      }),
    ).toEqual({ kind: 'open_surgery', surgeryId: 's1' });
  });

  it('abre modal de cirurgia quando só há slot do grupo', () => {
    expect(
      resolveDayBoardPrimaryAction({
        kind: 'appointment_slot',
        appointment_id: 'a1',
        service_type: { id: 't1', name: 'Castração', service_group: 'cirurgia' },
      }),
    ).toEqual({ kind: 'start_surgery_from_appointment' });
  });

  it('internação sem encounter pede admissão', () => {
    const action = resolveDayBoardPrimaryAction({
      kind: 'appointment_slot',
      appointment_id: 'a1',
      service_type: { id: 't1', name: 'Internação — diária', service_group: 'internacao' },
    });
    expect(action).toEqual({ kind: 'admit_hospitalization' });
    expect(dayBoardPrimaryActionLabel(action)).toBe('Internar');
  });

  it('consulta usa iniciar consulta', () => {
    const action = resolveDayBoardPrimaryAction({
      kind: 'appointment_slot',
      appointment_id: 'a1',
      service_type: { id: 't1', name: 'Consulta', service_group: 'clinica' },
    });
    expect(action).toEqual({ kind: 'start_consultation' });
    expect(dayBoardPrimaryActionLabel(action)).toBe('Iniciar consulta');
  });
});

describe('formatCockpitShortDate', () => {
  it('formata ISO em pt-BR', () => {
    expect(formatCockpitShortDate('2026-09-03T12:00:00.000Z')).toMatch(/\d{2}\/\d{2}/);
  });

  it('devolve traço sem data', () => {
    expect(formatCockpitShortDate(null)).toBe('—');
  });
});

describe('isSurgeryPendingDestination', () => {
  it('detecta cirurgia concluída sem alta', () => {
    expect(
      isSurgeryPendingDestination({
        kind: 'encounter',
        surgery_id: 's1',
        surgery_status: 'completed',
        surgery_discharge_at: null,
        status: 'in_progress',
      }),
    ).toBe(true);
  });

  it('não marca com alta, em andamento ou sem ficha', () => {
    expect(
      isSurgeryPendingDestination({
        kind: 'encounter',
        surgery_id: 's1',
        surgery_status: 'completed',
        surgery_discharge_at: '2026-11-27T18:00:00.000Z',
      }),
    ).toBe(false);
    expect(
      isSurgeryPendingDestination({
        kind: 'encounter',
        surgery_id: 's1',
        surgery_status: 'in_progress',
      }),
    ).toBe(false);
    expect(isSurgeryPendingDestination({ kind: 'appointment_slot' })).toBe(false);
  });
});

describe('itemOperationalStatus com cirurgia concluída', () => {
  it('preferência completed quando surgery_status é completed', () => {
    expect(
      itemOperationalStatus({
        kind: 'encounter',
        status: 'in_progress',
        surgery_id: 's1',
        surgery_status: 'completed',
      }),
    ).toBe('completed');
  });
});
