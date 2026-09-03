import {
  filterEndingSoonSeries,
  groupFutureAppointmentsBySeries,
  isSeriesEndingSoon,
  type SeriesAgg,
} from '../hubSeriesEndingSoonService';

const now = new Date('2026-09-03T12:00:00.000Z');

function agg(partial: Partial<SeriesAgg> & Pick<SeriesAgg, 'series_id' | 'remaining_count' | 'last_starts_at'>): SeriesAgg {
  return {
    sample_appointment_id: 'appt-1',
    pet_id: null,
    guardian_id: null,
    title: null,
    ...partial,
  };
}

describe('hubSeriesEndingSoonService', () => {
  it('série com 2 futuros entra', () => {
    expect(isSeriesEndingSoon(2, '2026-10-01T15:00:00.000Z', now, 2, 7)).toBe(true);
  });

  it('série com 5 futuros e última daqui a 30 dias não entra', () => {
    expect(isSeriesEndingSoon(5, '2026-10-03T15:00:00.000Z', now, 2, 7)).toBe(false);
  });

  it('série com última ocorrência em ≤7 dias entra mesmo com remaining > 2', () => {
    expect(isSeriesEndingSoon(5, '2026-09-08T15:00:00.000Z', now, 2, 7)).toBe(true);
  });

  it('sem ocorrências futuras não alerta', () => {
    expect(isSeriesEndingSoon(0, '2026-09-04T15:00:00.000Z', now, 2, 7)).toBe(false);
  });

  it('agrupa e escolhe o último slot como amostra', () => {
    const groups = groupFutureAppointmentsBySeries([
      {
        id: 'a1',
        series_id: 's1',
        starts_at: '2026-09-10T10:00:00.000Z',
        pet_id: 'p1',
        guardian_id: 'g1',
        title: 'primeiro',
      },
      {
        id: 'a2',
        series_id: 's1',
        starts_at: '2026-09-17T10:00:00.000Z',
        pet_id: 'p1',
        guardian_id: 'g1',
        title: 'último',
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.remaining_count).toBe(2);
    expect(groups[0]?.sample_appointment_id).toBe('a2');
    expect(groups[0]?.title).toBe('último');
  });

  it('filtra só as que estão acabando', () => {
    const ending = filterEndingSoonSeries(
      [
        agg({ series_id: 'soon-count', remaining_count: 2, last_starts_at: '2026-10-01T10:00:00.000Z' }),
        agg({ series_id: 'far', remaining_count: 5, last_starts_at: '2026-10-03T10:00:00.000Z' }),
        agg({ series_id: 'soon-date', remaining_count: 4, last_starts_at: '2026-09-06T10:00:00.000Z' }),
      ],
      now,
      2,
      7
    );
    expect(ending.map((s) => s.series_id)).toEqual(['soon-date', 'soon-count']);
  });
});
