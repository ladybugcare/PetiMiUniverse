import {
  addMsToIso,
  resolveSeriesScopedSchedulePatch,
  scheduleDeltaMs,
  shiftTimestampToDate,
} from '../hubSeriesSchedulePatch';

describe('shiftTimestampToDate', () => {
  it('preserva wall-clock de São Paulo e troca o dia civil', () => {
    // 19:30Z = 16:30 BRT → 16/dez 16:30 BRT = 16/dez 19:30Z
    expect(shiftTimestampToDate('2025-12-09T19:30:00.000Z', '2025-12-16')).toBe(
      '2025-12-16T19:30:00.000Z',
    );
  });

  it('noite em BRT não cai no dia civil anterior (regressão P0-02)', () => {
    // 22:00 BRT em 9/dez = 10/dez 01:00Z
    const eveningSp = '2025-12-10T01:00:00.000Z';
    // Aplicar a 16/dez deve permanecer 22:00 BRT do dia 16 (= 17/dez 01:00Z)
    expect(shiftTimestampToDate(eveningSp, '2025-12-16')).toBe('2025-12-17T01:00:00.000Z');
  });

  it('manhã cedo em BRT permanece no mesmo dia civil', () => {
    // 07:00 BRT = 10:00Z
    expect(shiftTimestampToDate('2025-12-09T10:00:00.000Z', '2025-12-16')).toBe(
      '2025-12-16T10:00:00.000Z',
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

  it('future com horário noturno BRT mantém dia civil da ocorrência', () => {
    const eveningPatchStarts = '2025-12-10T01:00:00.000Z'; // 22:00 BRT do dia 9
    const eveningPatchEnds = '2025-12-10T02:00:00.000Z'; // 23:00 BRT
    const onFuture = resolveSeriesScopedSchedulePatch({
      scope: 'future',
      targetId: 'bath-3',
      anchorId,
      appointmentKind: 'standard',
      rowStartsAt: '2025-12-16T13:00:00.000Z',
      rowEndsAt: '2025-12-16T14:00:00.000Z',
      rowOccurrenceDate: '2025-12-16',
      patchStartsAt: eveningPatchStarts,
      patchEndsAt: eveningPatchEnds,
      anchorOldStartsAt,
      anchorOldEndsAt,
    });
    expect(onFuture).toEqual({
      starts_at: '2025-12-17T01:00:00.000Z',
      ends_at: '2025-12-17T02:00:00.000Z',
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
