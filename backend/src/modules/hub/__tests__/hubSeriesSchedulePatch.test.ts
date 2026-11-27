import {
  addMsToIso,
  resolveSeriesScopedSchedulePatch,
  scheduleDeltaMs,
  shiftTimestampToDate,
} from '../hubSeriesSchedulePatch';

describe('shiftTimestampToDate', () => {
  it('preserva a hora UTC e troca o dia', () => {
    expect(shiftTimestampToDate('2025-12-09T19:30:00.000Z', '2025-12-16')).toBe(
      '2025-12-16T19:30:00.000Z',
    );
  });
});

describe('scheduleDeltaMs / addMsToIso', () => {
  it('calcula e aplica delta', () => {
    const delta = scheduleDeltaMs('2025-12-09T13:00:00.000Z', '2025-12-09T19:30:00.000Z');
    expect(delta).toBe(6.5 * 60 * 60 * 1000);
    expect(addMsToIso('2025-12-16T12:00:00.000Z', delta)).toBe('2025-12-16T18:30:00.000Z');
  });
});

describe('resolveSeriesScopedSchedulePatch', () => {
  const anchorId = 'bath-2';
  const anchorOldStartsAt = '2025-12-09T13:00:00.000Z';
  const anchorOldEndsAt = '2025-12-09T14:00:00.000Z';
  const patchStartsAt = '2025-12-09T19:30:00.000Z';
  const patchEndsAt = '2025-12-09T20:30:00.000Z';

  it('scope this usa valores absolutos', () => {
    const r = resolveSeriesScopedSchedulePatch({
      scope: 'this',
      targetId: anchorId,
      anchorId,
      appointmentKind: 'grooming',
      rowStartsAt: anchorOldStartsAt,
      rowEndsAt: anchorOldEndsAt,
      rowOccurrenceDate: '2025-12-09',
      patchStartsAt,
      patchEndsAt,
      anchorOldStartsAt,
      anchorOldEndsAt,
    });
    expect(r).toEqual({ starts_at: patchStartsAt, ends_at: patchEndsAt });
  });

  it('future na âncora usa absolutos; nas demais preserva a data', () => {
    const onAnchor = resolveSeriesScopedSchedulePatch({
      scope: 'future',
      targetId: anchorId,
      anchorId,
      appointmentKind: 'grooming',
      rowStartsAt: anchorOldStartsAt,
      rowEndsAt: anchorOldEndsAt,
      rowOccurrenceDate: '2025-12-09',
      patchStartsAt,
      patchEndsAt,
      anchorOldStartsAt,
      anchorOldEndsAt,
    });
    expect(onAnchor).toEqual({ starts_at: patchStartsAt, ends_at: patchEndsAt });

    const onFuture = resolveSeriesScopedSchedulePatch({
      scope: 'future',
      targetId: 'bath-3',
      anchorId,
      appointmentKind: 'grooming',
      rowStartsAt: '2025-12-16T13:00:00.000Z',
      rowEndsAt: '2025-12-16T14:00:00.000Z',
      rowOccurrenceDate: '2025-12-16',
      patchStartsAt,
      patchEndsAt,
      anchorOldStartsAt,
      anchorOldEndsAt,
    });
    expect(onFuture).toEqual({
      starts_at: '2025-12-16T19:30:00.000Z',
      ends_at: '2025-12-16T20:30:00.000Z',
    });

    const onLater = resolveSeriesScopedSchedulePatch({
      scope: 'future',
      targetId: 'bath-4',
      anchorId,
      appointmentKind: 'grooming',
      rowStartsAt: '2025-12-23T13:00:00.000Z',
      rowEndsAt: '2025-12-23T14:00:00.000Z',
      rowOccurrenceDate: '2025-12-23',
      patchStartsAt,
      patchEndsAt,
      anchorOldStartsAt,
      anchorOldEndsAt,
    });
    expect(onLater).toEqual({
      starts_at: '2025-12-23T19:30:00.000Z',
      ends_at: '2025-12-23T20:30:00.000Z',
    });
  });

  it('não colapsa várias ocorrências no mesmo instante (regressão staging)', () => {
    const dates = ['2025-12-09', '2025-12-16', '2025-12-23', '2025-12-30'];
    const starts = dates.map((d, i) => {
      const id = i === 0 ? anchorId : `occ-${d}`;
      return resolveSeriesScopedSchedulePatch({
        scope: 'future',
        targetId: id,
        anchorId,
        appointmentKind: 'grooming',
        rowStartsAt: `${d}T13:00:00.000Z`,
        rowEndsAt: `${d}T14:00:00.000Z`,
        rowOccurrenceDate: d,
        patchStartsAt,
        patchEndsAt,
        anchorOldStartsAt,
        anchorOldEndsAt,
      })!.starts_at;
    });
    expect(new Set(starts).size).toBe(dates.length);
    expect(starts[0]).toBe(patchStartsAt);
    expect(starts[1]).toBe('2025-12-16T19:30:00.000Z');
  });

  it('pernas pickup_route deslocam pelo mesmo delta do âncora', () => {
    const leg = resolveSeriesScopedSchedulePatch({
      scope: 'future',
      targetId: 'leg-return-16',
      anchorId,
      appointmentKind: 'pickup_route',
      rowStartsAt: '2025-12-16T14:15:00.000Z',
      rowEndsAt: '2025-12-16T14:45:00.000Z',
      rowOccurrenceDate: '2025-12-16',
      patchStartsAt,
      patchEndsAt,
      anchorOldStartsAt,
      anchorOldEndsAt,
    });
    // +6h30: 14:15 → 20:45
    expect(leg).toEqual({
      starts_at: '2025-12-16T20:45:00.000Z',
      ends_at: '2025-12-16T21:15:00.000Z',
    });
  });

  it('sem patch de horário retorna null', () => {
    expect(
      resolveSeriesScopedSchedulePatch({
        scope: 'future',
        targetId: 'bath-3',
        anchorId,
        appointmentKind: 'grooming',
        rowStartsAt: '2025-12-16T13:00:00.000Z',
        rowEndsAt: '2025-12-16T14:00:00.000Z',
        anchorOldStartsAt,
        anchorOldEndsAt,
      }),
    ).toBeNull();
  });
});
