import { describe, expect, it } from 'vitest';
import type { HubSeriesEndingSoon } from '../../api/hubAgendaApi';
import { buildSeriesRenewalInitial, nextSeriesOccurrenceStart } from './mapHubAgenda';

const series: HubSeriesEndingSoon = {
  series_id: 's1',
  remaining_count: 2,
  last_starts_at: '2026-09-10T13:00:00.000Z',
  kind: 'weekly',
  interval_value: 1,
  days_of_week: [4],
  day_of_month: null,
  until_date: null,
  occurrences: 8,
  sample_appointment_id: 'a1',
  pet_id: 'p1',
  guardian_id: 'g1',
  title: 'Banho',
};

describe('nextSeriesOccurrenceStart', () => {
  it('avança uma semana na série semanal', () => {
    const last = new Date('2026-09-10T13:00:00.000Z');
    expect(nextSeriesOccurrenceStart(last, 'weekly', 1).toISOString()).toBe('2026-09-17T13:00:00.000Z');
  });
});

describe('buildSeriesRenewalInitial', () => {
  it('sugere recorrência da série original e data após o último slot', () => {
    const initial = buildSeriesRenewalInitial(series, null);
    expect(initial.suggest_recurrence).toEqual({
      occurrences: 8,
      kind: 'weekly',
      interval_value: 1,
    });
    expect(initial.starts_at).toBe('2026-09-17T13:00:00.000Z');
    expect(initial.pet_id).toBe('p1');
    expect(initial.guardian_id).toBe('g1');
  });
});
