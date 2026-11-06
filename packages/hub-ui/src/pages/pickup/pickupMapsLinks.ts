/** Pontos para montar links do Google Maps (direções). */
export type MapPoint = {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
};

/** Google Maps Directions URL: até 10 waypoints intermediários (além de origem e destino). */
export const GOOGLE_MAPS_MAX_WAYPOINTS = 10;

export type GoogleMapsDirectionsResult = {
  url: string;
  truncated: boolean;
};

/** Converte ponto em query do Maps: "lat,lng" ou texto do endereço. */
export function pointToMapsQuery(p: MapPoint): string | null {
  const lat = typeof p.lat === 'number' && Number.isFinite(p.lat) ? p.lat : null;
  const lng = typeof p.lng === 'number' && Number.isFinite(p.lng) ? p.lng : null;
  if (lat != null && lng != null) {
    return `${lat},${lng}`;
  }
  const addr = String(p.address ?? '').trim();
  return addr.length > 0 ? addr : null;
}

export function isValidMapPoint(p: MapPoint): boolean {
  return pointToMapsQuery(p) != null;
}

/**
 * Monta URL de direções multi-parada.
 * origin = primeiro ponto válido; destination = último; waypoints = meio (máx. 9 se truncar
 * para caber no limite de 10 intermediários — usamos máx. 9 intermediários + último destino
 * quando há mais de 11 pontos no total).
 *
 * Regra: se points válidos = N
 * - N < 2 → null
 * - N === 2 → origin + destination
 * - 3 ≤ N ≤ 12 → origin + (N-2) waypoints + destination (N-2 ≤ 10)
 * - N > 12 → origin + primeiros 9 intermediários + último como destination (truncated)
 */
export function buildGoogleMapsDirectionsUrl(
  points: MapPoint[],
): GoogleMapsDirectionsResult | null {
  const queries = points.map(pointToMapsQuery).filter((q): q is string => q != null);
  if (queries.length < 2) return null;

  const origin = queries[0];
  const destination = queries[queries.length - 1];
  const middle = queries.slice(1, -1);

  const maxMiddle = GOOGLE_MAPS_MAX_WAYPOINTS;
  let waypoints = middle;
  let truncated = false;
  if (middle.length > maxMiddle) {
    // Mantém o destino final; fica com os primeiros maxMiddle intermediários
    waypoints = middle.slice(0, maxMiddle);
    truncated = true;
  }

  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('origin', origin);
  params.set('destination', destination);
  params.set('travelmode', 'driving');
  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.join('|'));
  }

  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    truncated,
  };
}

/** Link para um único destino (próxima parada). */
export function buildGoogleMapsSingleStopUrl(point: MapPoint): string | null {
  const q = pointToMapsQuery(point);
  if (!q) return null;
  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('destination', q);
  params.set('travelmode', 'driving');
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Google Maps para 1 destino ou rota multi-parada.
 * Útil quando a saída da clínica não tem coords, mas há ao menos uma parada.
 */
export function buildGoogleMapsRouteOrStopUrl(
  points: MapPoint[],
): GoogleMapsDirectionsResult | null {
  const valid = points.filter(isValidMapPoint);
  if (valid.length >= 2) return buildGoogleMapsDirectionsUrl(valid);
  if (valid.length === 1) {
    const url = buildGoogleMapsSingleStopUrl(valid[0]);
    return url ? { url, truncated: false } : null;
  }
  return null;
}

/** Waze — navegação até um destino (app ou web). */
export function buildWazeUrl(point: MapPoint): string | null {
  const lat = typeof point.lat === 'number' && Number.isFinite(point.lat) ? point.lat : null;
  const lng = typeof point.lng === 'number' && Number.isFinite(point.lng) ? point.lng : null;
  if (lat != null && lng != null) {
    return `https://waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`;
  }
  const addr = String(point.address ?? '').trim();
  if (!addr) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`;
}

/** Apple Maps — navegação até um destino. */
export function buildAppleMapsUrl(point: MapPoint): string | null {
  const q = pointToMapsQuery(point);
  if (!q) return null;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(q)}&dirflg=d`;
}

export type ExternalMapsLinks = {
  google: string | null;
  waze: string | null;
  apple: string | null;
};

/** Pacote de links de navegação para uma parada. */
export function buildExternalMapsLinks(point: MapPoint): ExternalMapsLinks {
  return {
    google: buildGoogleMapsSingleStopUrl(point),
    waze: buildWazeUrl(point),
    apple: buildAppleMapsUrl(point),
  };
}

function readCoord(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return null;
}

/** Extrai ponto de um stop com address_snapshot (lat/lng e/ou campos de endereço). */
export function stopToMapPoint(stop: {
  address_snapshot?: Record<string, unknown> | null;
}): MapPoint {
  const snap = stop.address_snapshot ?? null;
  const lat =
    readCoord(snap?.lat) ??
    readCoord(snap?.latitude) ??
    null;
  const lng =
    readCoord(snap?.lng) ??
    readCoord(snap?.lon) ??
    readCoord(snap?.longitude) ??
    null;

  const street = snap?.street == null ? '' : String(snap.street).trim();
  const streetNumber = snap?.street_number == null ? '' : String(snap.street_number).trim();
  const streetLine =
    street && streetNumber
      ? `${street}, ${streetNumber}`
      : street || (snap?.address_street == null ? '' : String(snap.address_street).trim());

  const address =
    [
      snap?.address,
      streetLine || null,
      snap?.address_neighborhood,
      snap?.district,
      snap?.address_city,
      snap?.city,
      snap?.state,
    ]
      .map((x) => (x == null ? '' : String(x).trim()))
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(', ') || null;
  return { lat, lng, address };
}

export function openGoogleMapsUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
