import { describe, expect, it } from 'vitest';
import {
  formatCockpitDayLabel,
  formatCockpitShortDate,
  isDayBoardSurgery,
  isFinalOperationalStatus,
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

describe('formatCockpitShortDate', () => {
  it('formata ISO em pt-BR', () => {
    expect(formatCockpitShortDate('2026-09-03T12:00:00.000Z')).toMatch(/\d{2}\/\d{2}/);
  });

  it('devolve traço sem data', () => {
    expect(formatCockpitShortDate(null)).toBe('—');
  });
});
