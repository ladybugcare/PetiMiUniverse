import { describe, expect, it } from 'vitest';
import { formatCockpitDayLabel, formatCockpitShortDate } from './vetCockpitUtils';

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

describe('formatCockpitShortDate', () => {
  it('formata ISO em pt-BR', () => {
    expect(formatCockpitShortDate('2026-09-03T12:00:00.000Z')).toMatch(/\d{2}\/\d{2}/);
  });

  it('devolve traço sem data', () => {
    expect(formatCockpitShortDate(null)).toBe('—');
  });
});
