import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('../../../config/supabase', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import { fetchHubPetsMapByIds } from '../hubDayBoardPets';

describe('fetchHubPetsMapByIds', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('inclui pet falecido e arquivado no mapa (enrich de day board)', async () => {
    const rows = [
      {
        id: 'pet-alive',
        name: 'Luna',
        deleted_at: null,
        deceased_at: null,
        death_invalidated_at: null,
      },
      {
        id: 'pet-dead',
        name: 'Amora',
        deleted_at: '2026-11-27T18:44:01.000Z',
        deceased_at: '2026-11-27T18:43:00.000Z',
        death_invalidated_at: null,
      },
    ];

    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    });

    const map = await fetchHubPetsMapByIds(['pet-alive', 'pet-dead']);
    expect(map.size).toBe(2);
    expect(map.get('pet-dead')?.name).toBe('Amora');
    expect(map.get('pet-dead')?.deceased_at).toBeTruthy();
    expect(map.get('pet-dead')?.deleted_at).toBeTruthy();
    expect(map.get('pet-alive')?.name).toBe('Luna');
  });
});
