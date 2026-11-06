import { useEffect, useMemo, useRef, useState } from 'react';
import type { PickupStop } from '../../api/hubPickupApi';
import { geocodeAddressClient, geocodeDelayMs, type GeocodedCoords } from './pickupGeocode';
import { stopToMapPoint } from './pickupMapsLinks';

/**
 * Geocodifica paradas sem lat/lng no snapshot (comum em rotas antigas / geocode falho).
 * Usado no monitor para plotar endereços e inferir a posição do motorista.
 */
export function usePickupStopCoords(stops: PickupStop[]): Map<string, GeocodedCoords> {
  const [coordsByStopId, setCoordsByStopId] = useState<Map<string, GeocodedCoords>>(() => new Map());
  const attemptedRef = useRef<Set<string>>(new Set());

  const missing = useMemo(() => {
    const out: Array<{ id: string; address: string }> = [];
    for (const s of stops) {
      if (s.direction === 'clinic_return') continue;
      const p = stopToMapPoint(s);
      if (p.lat != null && p.lng != null) continue;
      if (!p.address || p.address.trim().length < 5) continue;
      out.push({ id: s.id, address: p.address });
    }
    return out;
  }, [stops]);

  useEffect(() => {
    const pending = missing.filter((m) => !attemptedRef.current.has(m.id));
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      for (let i = 0; i < pending.length; i++) {
        if (cancelled) break;
        const item = pending[i];
        attemptedRef.current.add(item.id);
        const coords = await geocodeAddressClient(item.address);
        if (cancelled) break;
        if (coords) {
          setCoordsByStopId((prev) => {
            const next = new Map(prev);
            next.set(item.id, coords);
            return next;
          });
        }
        if (i < pending.length - 1) {
          await new Promise<void>((r) => setTimeout(r, geocodeDelayMs()));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [missing]);

  return useMemo(() => {
    const merged = new Map(coordsByStopId);
    for (const s of stops) {
      if (merged.has(s.id)) continue;
      const p = stopToMapPoint(s);
      if (p.lat != null && p.lng != null) {
        merged.set(s.id, { lat: p.lat, lng: p.lng });
      }
    }
    return merged;
  }, [stops, coordsByStopId]);
}

/** Mescla lat/lng geocodificados no address_snapshot (sem mutar o original). */
export function withStopCoords(
  stop: PickupStop,
  coordsByStopId: Map<string, GeocodedCoords>,
): PickupStop {
  const existing = stopToMapPoint(stop);
  if (existing.lat != null && existing.lng != null) return stop;
  const coords = coordsByStopId.get(stop.id);
  if (!coords) return stop;
  return {
    ...stop,
    address_snapshot: {
      ...(stop.address_snapshot ?? {}),
      lat: coords.lat,
      lng: coords.lng,
    },
  };
}
