export type SuggestBatchStopInput = {
  hub_appointment_id: string;
  direction: 'pickup' | 'delivery';
  starts_at?: string | null;
};

export type SuggestBatchWindowMinutes = 0 | 15 | 30;

export type SuggestBatchResult = {
  label: string;
  stop_ids: string[];
  pickup_count: number;
  pet_count: number;
};

const NO_TIME_SENTINEL = Number.POSITIVE_INFINITY;

function parseStartMs(startsAt?: string | null): number {
  if (!startsAt) return NO_TIME_SENTINEL;
  const t = Date.parse(startsAt);
  return Number.isFinite(t) ? t : NO_TIME_SENTINEL;
}

/** Tamanho do bucket em ms. Janela 0 = 1 minuto (horário “exato”). */
export function windowBucketMs(windowMinutes: SuggestBatchWindowMinutes): number {
  if (windowMinutes === 0) return 60_000;
  return windowMinutes * 60_000;
}

export function timeBucketKey(startsAtMs: number, windowMinutes: SuggestBatchWindowMinutes): number {
  if (!Number.isFinite(startsAtMs) || startsAtMs === NO_TIME_SENTINEL) {
    return NO_TIME_SENTINEL;
  }
  const size = windowBucketMs(windowMinutes);
  return Math.floor(startsAtMs / size) * size;
}

function formatBucketLabel(bucketStartMs: number): string {
  if (!Number.isFinite(bucketStartMs) || bucketStartMs === NO_TIME_SENTINEL) {
    return 'sem horário';
  }
  return new Date(bucketStartMs).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  });
}

/**
 * Particiona paradas em lotes por janela de horário e capacidade (1 pet por parada).
 * Coletas e entregas contam igualmente para a capacidade.
 */
export function partitionStopsIntoBatches(
  stops: SuggestBatchStopInput[],
  opts: { capacity: number; window_minutes: SuggestBatchWindowMinutes },
): SuggestBatchResult[] {
  const capacity = Math.max(1, Math.floor(opts.capacity));
  const windowMinutes = opts.window_minutes;

  const ordered = [...stops].sort((a, b) => {
    const ta = parseStartMs(a.starts_at);
    const tb = parseStartMs(b.starts_at);
    if (ta !== tb) return ta - tb;
    return a.hub_appointment_id.localeCompare(b.hub_appointment_id);
  });

  type Acc = {
    stop_ids: string[];
    pickup_count: number;
    pet_count: number;
    bucketKey: number;
  };

  const batches: SuggestBatchResult[] = [];
  let current: Acc | null = null;

  const flush = () => {
    if (!current || current.stop_ids.length === 0) {
      current = null;
      return;
    }
    const n = batches.length + 1;
    const timePart = formatBucketLabel(current.bucketKey);
    batches.push({
      label: `Lote ${n} · ${timePart}`,
      stop_ids: current.stop_ids,
      pickup_count: current.pickup_count,
      pet_count: current.pet_count,
    });
    current = null;
  };

  for (const stop of ordered) {
    const startMs = parseStartMs(stop.starts_at);
    const bucketKey = timeBucketKey(startMs, windowMinutes);

    const needsNewForBucket =
      current != null && current.stop_ids.length > 0 && current.bucketKey !== bucketKey;
    const needsNewForCapacity =
      current != null && current.pet_count >= capacity && current.stop_ids.length > 0;

    if (needsNewForBucket || needsNewForCapacity) {
      flush();
    }

    if (!current) {
      current = {
        stop_ids: [],
        pickup_count: 0,
        pet_count: 0,
        bucketKey,
      };
    }

    current.stop_ids.push(stop.hub_appointment_id);
    current.pet_count += 1;
    if (stop.direction === 'pickup') current.pickup_count += 1;
  }

  flush();
  return batches;
}
