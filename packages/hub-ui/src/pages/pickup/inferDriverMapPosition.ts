import { stopToMapPoint } from './pickupMapsLinks';

export type InferStopStatus =
  | 'pending'
  | 'en_route'
  | 'arrived'
  | 'in_transit'
  | 'completed'
  | 'failed'
  | string;

export type InferStopDirection = 'pickup' | 'delivery' | 'clinic_return' | string;

export type InferMapStop = {
  id: string;
  sequence: number;
  status: InferStopStatus;
  direction: InferStopDirection;
  address_snapshot?: Record<string, unknown> | null;
  pet?: { name?: string | null } | null;
};

export type InferMapRoute = {
  status?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  start_address?: string | null;
};

export type InferredDriverMode =
  | 'not_started'
  | 'en_route'
  | 'at_stop'
  | 'in_transit'
  | 'returning'
  | 'done';

export type InferredDriverMapPosition = {
  lat: number;
  lng: number;
  label: string;
  mode: InferredDriverMode;
  activeStopId: string | null;
  destinationStopId?: string | null;
};

const DONE = new Set(['completed', 'failed']);

function isFiniteCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function startPoint(route: InferMapRoute): { lat: number; lng: number } | null {
  if (isFiniteCoord(route.start_lat) && isFiniteCoord(route.start_lng)) {
    return { lat: route.start_lat, lng: route.start_lng };
  }
  return null;
}

function stopCoords(
  stop: InferMapStop,
  route: InferMapRoute,
): { lat: number; lng: number } | null {
  const p = stopToMapPoint(stop);
  if (isFiniteCoord(p.lat) && isFiniteCoord(p.lng)) {
    return { lat: p.lat, lng: p.lng };
  }
  // clinic_return (e snapshots sem geocode): fallback para saída da rota
  if (stop.direction === 'clinic_return') {
    return startPoint(route);
  }
  return null;
}

function stopLabel(stop: InferMapStop): string {
  if (stop.direction === 'clinic_return') return 'retorno à clínica';
  const pet = stop.pet?.name?.trim();
  if (pet) return pet;
  if (stop.direction === 'delivery') return 'entrega';
  if (stop.direction === 'pickup') return 'coleta';
  return 'parada';
}

function lastConfirmedCoords(
  ordered: InferMapStop[],
  activeIndex: number,
  route: InferMapRoute,
): { lat: number; lng: number } | null {
  for (let i = activeIndex - 1; i >= 0; i--) {
    const s = ordered[i];
    if (DONE.has(s.status) || s.status === 'arrived' || s.status === 'in_transit') {
      const c = stopCoords(s, route);
      if (c) return c;
    }
  }
  return startPoint(route);
}

/**
 * Infere a última posição conhecida do motorista a partir dos status das paradas (sem GPS).
 */
export function inferDriverMapPosition(
  route: InferMapRoute,
  stops: InferMapStop[],
): InferredDriverMapPosition | null {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const start = startPoint(route);

  if (ordered.length === 0) {
    if (!start) return null;
    return {
      lat: start.lat,
      lng: start.lng,
      label: 'Ainda não saiu',
      mode: 'not_started',
      activeStopId: null,
    };
  }

  const activeIndex = ordered.findIndex((s) => !DONE.has(s.status));
  const allDone = activeIndex < 0;

  if (allDone || route.status === 'done') {
    const last = [...ordered].reverse().find((s) => s.status === 'completed') ?? ordered[ordered.length - 1];
    const c = stopCoords(last, route) ?? start;
    if (!c) return null;
    return {
      lat: c.lat,
      lng: c.lng,
      label: 'Rota concluída',
      mode: 'done',
      activeStopId: null,
    };
  }

  const active = ordered[activeIndex];
  const nextPending = ordered.slice(activeIndex + 1).find((s) => !DONE.has(s.status)) ?? null;

  if (active.status === 'pending' && activeIndex === 0 && (route.status === 'planned' || !route.status)) {
    if (!start) return null;
    return {
      lat: start.lat,
      lng: start.lng,
      label: 'Ainda não saiu',
      mode: 'not_started',
      activeStopId: active.id,
      destinationStopId: active.id,
    };
  }

  if (active.status === 'pending') {
    const c = lastConfirmedCoords(ordered, activeIndex, route) ?? start;
    if (!c) return null;
    return {
      lat: c.lat,
      lng: c.lng,
      label: `Próximo: ${stopLabel(active)}`,
      mode: 'en_route',
      activeStopId: active.id,
      destinationStopId: active.id,
    };
  }

  if (active.status === 'en_route') {
    const c = lastConfirmedCoords(ordered, activeIndex, route) ?? start;
    if (!c) return null;
    const isReturn = active.direction === 'clinic_return';
    return {
      lat: c.lat,
      lng: c.lng,
      label: isReturn ? 'A caminho do retorno à clínica' : `A caminho de ${stopLabel(active)}`,
      mode: isReturn ? 'returning' : 'en_route',
      activeStopId: active.id,
      destinationStopId: active.id,
    };
  }

  if (active.status === 'arrived') {
    const c = stopCoords(active, route);
    if (!c) return null;
    const isReturn = active.direction === 'clinic_return';
    return {
      lat: c.lat,
      lng: c.lng,
      label: isReturn ? 'Na clínica' : `No endereço · ${stopLabel(active)}`,
      mode: isReturn ? 'returning' : 'at_stop',
      activeStopId: active.id,
    };
  }

  if (active.status === 'in_transit') {
    const c = stopCoords(active, route) ?? lastConfirmedCoords(ordered, activeIndex, route);
    if (!c) return null;
    const dest = nextPending;
    const destLabel = dest
      ? dest.direction === 'clinic_return'
        ? 'retorno à clínica'
        : stopLabel(dest)
      : 'próximo ponto';
    return {
      lat: c.lat,
      lng: c.lng,
      label: `Pet a bordo → ${destLabel}`,
      mode: 'in_transit',
      activeStopId: active.id,
      destinationStopId: dest?.id ?? null,
    };
  }

  // failed na ativa (não deveria ser ativa) ou status desconhecido
  const fallback = stopCoords(active, route) ?? lastConfirmedCoords(ordered, activeIndex, route) ?? start;
  if (!fallback) return null;
  return {
    lat: fallback.lat,
    lng: fallback.lng,
    label: `Parada ativa · ${stopLabel(active)}`,
    mode: 'en_route',
    activeStopId: active.id,
  };
}
