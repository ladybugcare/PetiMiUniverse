import { describe, expect, it } from 'vitest';
import type { GroomingDayBoardItem } from '../../api/hubGroomingApi';
import { pickFeaturedItem } from './GroomingFloorView';

function item(
  partial: Partial<GroomingDayBoardItem> & { grooming_stage: string; starts_at: string },
): GroomingDayBoardItem {
  return {
    kind: 'session',
    ends_at: partial.starts_at,
    pet: { id: 'p1', name: 'Thor' },
    ...partial,
  };
}

describe('pickFeaturedItem', () => {
  it('prioriza pet em atendimento', () => {
    const featured = pickFeaturedItem([
      item({ grooming_stage: 'queued', starts_at: '2026-09-08T10:00:00' }),
      item({ grooming_stage: 'in_service', starts_at: '2026-09-08T11:00:00', pet: { id: 'p2', name: 'Luna' } }),
      item({ grooming_stage: 'ready', starts_at: '2026-09-08T09:00:00' }),
    ]);
    expect(featured?.pet?.name).toBe('Luna');
  });

  it('senão pega o próximo na fila / check-in', () => {
    const featured = pickFeaturedItem([
      item({ grooming_stage: 'scheduled', starts_at: '2026-09-08T10:00:00' }),
      item({ grooming_stage: 'queued', starts_at: '2026-09-08T11:00:00', pet: { id: 'p2', name: 'Bob' } }),
      item({ grooming_stage: 'checked_in', starts_at: '2026-09-08T10:30:00', pet: { id: 'p3', name: 'Mia' } }),
    ]);
    expect(featured?.pet?.name).toBe('Mia');
  });

  it('retorna null se só finalizados', () => {
    expect(
      pickFeaturedItem([
        item({ grooming_stage: 'delivered', starts_at: '2026-09-08T08:00:00' }),
        item({ grooming_stage: 'closed', starts_at: '2026-09-08T09:00:00' }),
      ]),
    ).toBeNull();
  });
});
