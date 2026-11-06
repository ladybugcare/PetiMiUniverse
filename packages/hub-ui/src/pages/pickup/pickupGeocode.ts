/** Geocoding no cliente (Nominatim) — espelha o preview do montador de rotas. */

export type GeocodedCoords = { lat: number; lng: number };

const memoryCache = new Map<string, GeocodedCoords | null>();

function cacheKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Geocodifica um endereço via Nominatim.
 * Cache em memória por endereço; falhas também são cacheadas para não martelar a API.
 */
export async function geocodeAddressClient(
  address: string,
  opts?: { signal?: AbortSignal },
): Promise<GeocodedCoords | null> {
  const trimmed = address.trim();
  if (trimmed.length < 5) return null;

  const key = cacheKey(trimmed);
  if (memoryCache.has(key)) return memoryCache.get(key) ?? null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PetiMiHub/1.0 (monitor)',
      },
      signal: opts?.signal ?? AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      memoryCache.set(key, null);
      return null;
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    const hit = data[0];
    if (!hit) {
      memoryCache.set(key, null);
      return null;
    }
    const coords = { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
      memoryCache.set(key, null);
      return null;
    }
    memoryCache.set(key, coords);
    return coords;
  } catch {
    // não cacheia abort/timeout transitório como null permanente
    if (opts?.signal?.aborted) return null;
    memoryCache.set(key, null);
    return null;
  }
}

/** Espaça requisições ≥ 1,1s (política de uso do Nominatim). */
export function geocodeDelayMs(): number {
  return 1100;
}
