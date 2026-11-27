import {
  canTransitionToNoShow,
  mergeExplicitAndImpliedAppointmentIds,
} from '../hubNoShowUtils';

describe('hubNoShowUtils', () => {
  test('aceita transição a partir dos status elegíveis', () => {
    expect(canTransitionToNoShow('pending_confirm')).toBe(true);
    expect(canTransitionToNoShow('confirmed')).toBe(true);
    expect(canTransitionToNoShow('checked_in')).toBe(true);
    expect(canTransitionToNoShow('in_progress')).toBe(true);
  });

  test('bloqueia done, paid, cancelled e no_show', () => {
    expect(canTransitionToNoShow('done')).toBe(false);
    expect(canTransitionToNoShow('paid')).toBe(false);
    expect(canTransitionToNoShow('cancelled')).toBe(false);
    expect(canTransitionToNoShow('no_show')).toBe(false);
  });

  test('merge explícito + implícito não duplica id', () => {
    const merged = mergeExplicitAndImpliedAppointmentIds(
      ['a', 'b'],
      ['b', 'c', 'a'],
    );
    expect(merged.explicit.sort()).toEqual(['a', 'b']);
    expect(merged.impliedOnly).toEqual(['c']);
  });
});
