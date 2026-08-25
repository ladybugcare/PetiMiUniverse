import {
  partitionStopsIntoBatches,
  timeBucketKey,
  windowBucketMs,
  type SuggestBatchStopInput,
} from '../hubPickupSuggestBatches';

function stop(
  id: string,
  direction: 'pickup' | 'delivery',
  startsAt: string | null,
): SuggestBatchStopInput {
  return { hub_appointment_id: id, direction, starts_at: startsAt };
}

describe('hubPickupSuggestBatches', () => {
  describe('windowBucketMs', () => {
    it('usa 1 minuto quando window_minutes = 0', () => {
      expect(windowBucketMs(0)).toBe(60_000);
    });
    it('converte 15 e 30 min', () => {
      expect(windowBucketMs(15)).toBe(15 * 60_000);
      expect(windowBucketMs(30)).toBe(30 * 60_000);
    });
  });

  describe('timeBucketKey', () => {
    it('agrupa o mesmo minuto quando window = 0', () => {
      const a = Date.parse('2026-08-25T12:00:10-03:00');
      const b = Date.parse('2026-08-25T12:00:50-03:00');
      expect(timeBucketKey(a, 0)).toBe(timeBucketKey(b, 0));
    });
    it('separa minutos diferentes quando window = 0', () => {
      const a = Date.parse('2026-08-25T12:00:00-03:00');
      const b = Date.parse('2026-08-25T12:01:00-03:00');
      expect(timeBucketKey(a, 0)).not.toBe(timeBucketKey(b, 0));
    });
    it('agrupa 15 min', () => {
      const a = Date.parse('2026-08-25T12:00:00-03:00');
      const b = Date.parse('2026-08-25T12:14:00-03:00');
      const c = Date.parse('2026-08-25T12:15:00-03:00');
      expect(timeBucketKey(a, 15)).toBe(timeBucketKey(b, 15));
      expect(timeBucketKey(a, 15)).not.toBe(timeBucketKey(c, 15));
    });
  });

  describe('partitionStopsIntoBatches', () => {
    it('mistura pickup e delivery na mesma janela e conta ambos na capacidade', () => {
      const batches = partitionStopsIntoBatches(
        [
          stop('p1', 'pickup', '2026-08-25T09:00:00-03:00'),
          stop('d1', 'delivery', '2026-08-25T09:00:00-03:00'),
          stop('p2', 'pickup', '2026-08-25T09:00:00-03:00'),
        ],
        { capacity: 2, window_minutes: 0 },
      );
      expect(batches).toHaveLength(2);
      expect(batches[0].pet_count).toBe(2);
      expect(batches[0].pickup_count).toBe(1);
      // Ordenado por starts_at e depois id: d1 < p1 < p2
      expect(batches[0].stop_ids).toEqual(['d1', 'p1']);
      expect(batches[1].stop_ids).toEqual(['p2']);
      expect(batches[1].pet_count).toBe(1);
    });

    it('quebra por janela de 30 min mesmo com capacidade sobrando', () => {
      const batches = partitionStopsIntoBatches(
        [
          stop('a', 'pickup', '2026-08-25T09:00:00-03:00'),
          stop('b', 'delivery', '2026-08-25T09:20:00-03:00'),
          stop('c', 'pickup', '2026-08-25T09:35:00-03:00'),
        ],
        { capacity: 10, window_minutes: 30 },
      );
      // 09:00 and 09:20 same 30-min bucket; 09:35 next
      expect(batches).toHaveLength(2);
      expect(batches[0].stop_ids).toEqual(['a', 'b']);
      expect(batches[1].stop_ids).toEqual(['c']);
    });

    it('overflow de capacidade no mesmo horário gera lotes com mesmo rótulo de hora', () => {
      const batches = partitionStopsIntoBatches(
        [
          stop('a', 'pickup', '2026-08-25T10:00:00-03:00'),
          stop('b', 'pickup', '2026-08-25T10:00:00-03:00'),
          stop('c', 'pickup', '2026-08-25T10:00:00-03:00'),
        ],
        { capacity: 2, window_minutes: 0 },
      );
      expect(batches).toHaveLength(2);
      expect(batches[0].label).toContain('Lote 1');
      expect(batches[1].label).toContain('Lote 2');
      expect(batches[0].label.split(' · ')[1]).toBe(batches[1].label.split(' · ')[1]);
    });

    it('stops sem starts_at vão para o fim e compartilham bucket sem horário', () => {
      const batches = partitionStopsIntoBatches(
        [
          stop('late', 'pickup', null),
          stop('early', 'delivery', '2026-08-25T08:00:00-03:00'),
          stop('also-late', 'pickup', null),
        ],
        { capacity: 10, window_minutes: 15 },
      );
      expect(batches).toHaveLength(2);
      expect(batches[0].stop_ids).toEqual(['early']);
      expect(batches[1].stop_ids).toEqual(['also-late', 'late']);
      expect(batches[1].label).toContain('sem horário');
    });

    it('janela 15 min agrupa 09:00–09:14', () => {
      const batches = partitionStopsIntoBatches(
        [
          stop('a', 'pickup', '2026-08-25T09:00:00-03:00'),
          stop('b', 'delivery', '2026-08-25T09:14:00-03:00'),
          stop('c', 'pickup', '2026-08-25T09:15:00-03:00'),
        ],
        { capacity: 10, window_minutes: 15 },
      );
      expect(batches).toHaveLength(2);
      expect(batches[0].stop_ids).toEqual(['a', 'b']);
      expect(batches[1].stop_ids).toEqual(['c']);
    });
  });
});
