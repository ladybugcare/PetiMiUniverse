import { describe, expect, it } from 'vitest';
import type { BoardingDayBoardItem } from '../../api/hubBoardingApi';
import { pickFeaturedBoardingItem, resolveBoardingFloorAction } from './BoardingFloorView';

function item(
  partial: Partial<BoardingDayBoardItem> & { boarding_stage: string; starts_at: string },
): BoardingDayBoardItem {
  return {
    kind: 'reservation',
    mode: 'hotel',
    ends_at: partial.ends_at ?? partial.starts_at,
    pet: { id: 'p1', name: 'Thor' },
    ...partial,
  };
}

describe('pickFeaturedBoardingItem', () => {
  it('prioriza pet hospedado em atraso', () => {
    const featured = pickFeaturedBoardingItem([
      item({ boarding_stage: 'reserved', starts_at: '2026-09-08T08:00:00', pet: { id: 'p0', name: 'Bob' } }),
      item({
        boarding_stage: 'checked_in',
        starts_at: '2026-09-07T10:00:00',
        ends_at: '2026-09-08T18:00:00',
        pet: { id: 'p2', name: 'Luna' },
      }),
      item({
        boarding_stage: 'checked_in',
        starts_at: '2026-09-06T10:00:00',
        ends_at: '2026-09-08T12:00:00',
        is_late: true,
        pet: { id: 'p3', name: 'Mia' },
      }),
    ]);
    expect(featured?.pet?.name).toBe('Mia');
  });

  it('senão pega o próximo previsto', () => {
    const featured = pickFeaturedBoardingItem([
      item({ boarding_stage: 'checked_out', starts_at: '2026-09-08T08:00:00', pet: { id: 'p0', name: 'Saído' } }),
      item({ boarding_stage: 'reserved', starts_at: '2026-09-08T11:00:00', pet: { id: 'p2', name: 'Bob' } }),
      item({ boarding_stage: 'reserved', starts_at: '2026-09-08T09:30:00', pet: { id: 'p3', name: 'Nina' } }),
    ]);
    expect(featured?.pet?.name).toBe('Nina');
  });

  it('retorna null se só saídas', () => {
    expect(
      pickFeaturedBoardingItem([
        item({ boarding_stage: 'checked_out', starts_at: '2026-09-08T08:00:00' }),
        item({ boarding_stage: 'cancelled', starts_at: '2026-09-08T09:00:00' }),
      ]),
    ).toBeNull();
  });
});

describe('resolveBoardingFloorAction', () => {
  it('oferece check-in no previsto e check-out no hospedado', () => {
    expect(resolveBoardingFloorAction(item({ boarding_stage: 'reserved', starts_at: '2026-09-08T10:00:00' }), true)).toBe(
      'check_in',
    );
    expect(
      resolveBoardingFloorAction(item({ boarding_stage: 'checked_in', starts_at: '2026-09-08T10:00:00' }), true),
    ).toBe('check_out');
    expect(
      resolveBoardingFloorAction(item({ boarding_stage: 'checked_out', starts_at: '2026-09-08T10:00:00' }), true),
    ).toBeNull();
    expect(resolveBoardingFloorAction(item({ boarding_stage: 'reserved', starts_at: '2026-09-08T10:00:00' }), false)).toBeNull();
  });
});
