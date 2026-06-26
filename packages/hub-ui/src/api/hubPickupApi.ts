import { apiRequest } from '@petimi/web-core';

const pickupBase = '/api/hub/pickup';

// ─── Tipos base ────────────────────────────────────────────────────────────

export type PickupDirection = 'pickup' | 'delivery' | 'unknown';

export type PickupRouteStatus = 'planned' | 'in_progress' | 'done' | 'cancelled';
export type PickupStopStatus = 'pending' | 'en_route' | 'arrived' | 'completed' | 'failed';

export type PickupDayBoardPet = {
  id: string;
  name: string;
  species?: string | null;
  breed?: string | null;
  size_tier?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
};

export type PickupGuardian = {
  id: string;
  full_name: string;
  phone?: string | null;
};

// ─── Day-board ────────────────────────────────────────────────────────────

export type PickupDayBoardItem = {
  appointment_id: string;
  appointment_kind: 'pickup_route';
  direction: PickupDirection;
  starts_at: string;
  ends_at: string;
  status: string;
  notes?: string | null;
  resource_label?: string | null;
  service_type?: { id: string; name: string; service_group: string } | null;
  pet?: PickupDayBoardPet | null;
  guardian?: PickupGuardian | null;
  /** Endereço formatado do tutor (rua, bairro, cidade, estado). */
  address?: string | null;
  unit_id?: string | null;
  hub_staff_member_id?: string | null;
  // Campos de rota (null quando perna ainda solta / sem hub_pickup_stops)
  stop_id?: string | null;
  route_id?: string | null;
  sequence?: number | null;
  stop_status?: PickupStopStatus | null;
  planned_at?: string | null;
  completed_at?: string | null;
  failure_reason?: string | null;
};

export type PickupDayBoardResponse = {
  items: PickupDayBoardItem[];
  date: string;
  clinic_id: string;
};

// ─── Rotas ────────────────────────────────────────────────────────────────

export type PickupRoute = {
  id: string;
  clinic_id: string;
  unit_id?: string | null;
  route_date: string;
  driver_staff_id?: string | null;
  vehicle_label?: string | null;
  status: PickupRouteStatus;
  notes?: string | null;
  stops_count?: number;
  driver?: { id: string; full_name: string } | null;
  created_at: string;
  updated_at: string;
};

export type PickupRoutesResponse = { routes: PickupRoute[] };

// ─── Paradas ──────────────────────────────────────────────────────────────

export type PickupStop = {
  id: string;
  hub_appointment_id?: string | null;
  pet_id?: string | null;
  guardian_id?: string | null;
  direction: 'pickup' | 'delivery';
  address_snapshot?: Record<string, unknown> | null;
  sequence: number;
  status: PickupStopStatus;
  planned_at?: string | null;
  completed_at?: string | null;
  failure_reason?: string | null;
  notes?: string | null;
  pet?: PickupDayBoardPet | null;
  guardian?: PickupGuardian | null;
};

export type PickupRouteDetailResponse = {
  route: PickupRoute & { driver?: { id: string; full_name: string; phone?: string | null } | null };
  stops: PickupStop[];
};

// ─── API client ───────────────────────────────────────────────────────────

export const hubPickupApi = {
  dayBoard(
    clinicId: string,
    range: { dateYmd: string; from: string; to: string },
    opts?: { unitId?: string; direction?: 'pickup' | 'delivery' | 'all' },
  ) {
    const q = new URLSearchParams({
      clinic_id: clinicId,
      date: range.dateYmd,
      from: range.from,
      to: range.to,
    });
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    if (opts?.direction && opts.direction !== 'all') q.set('direction', opts.direction);
    return apiRequest(`${pickupBase}/day-board?${q}`) as Promise<PickupDayBoardResponse>;
  },

  listRoutes(clinicId: string, opts?: { date?: string; unitId?: string; status?: PickupRouteStatus }) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.date) q.set('date', opts.date);
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    if (opts?.status) q.set('status', opts.status);
    return apiRequest(`${pickupBase}/routes?${q}`) as Promise<PickupRoutesResponse>;
  },

  createRoute(payload: {
    clinic_id: string;
    unit_id?: string | null;
    route_date: string;
    driver_staff_id?: string | null;
    vehicle_label?: string | null;
    notes?: string | null;
  }) {
    return apiRequest(`${pickupBase}/routes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ route: PickupRoute }>;
  },

  getRoute(routeId: string, clinicId: string) {
    return apiRequest(
      `${pickupBase}/routes/${encodeURIComponent(routeId)}?clinic_id=${encodeURIComponent(clinicId)}`,
    ) as Promise<PickupRouteDetailResponse>;
  },

  patchRoute(
    routeId: string,
    payload: {
      clinic_id: string;
      status?: PickupRouteStatus;
      driver_staff_id?: string | null;
      vehicle_label?: string | null;
      notes?: string | null;
      stop_sequence?: string[];
    },
  ) {
    return apiRequest(`${pickupBase}/routes/${encodeURIComponent(routeId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ route: PickupRoute }>;
  },

  addStops(
    routeId: string,
    payload: {
      clinic_id: string;
      stops: Array<{
        hub_appointment_id: string;
        direction: 'pickup' | 'delivery';
        sequence?: number;
        planned_at?: string | null;
      }>;
    },
  ) {
    return apiRequest(`${pickupBase}/routes/${encodeURIComponent(routeId)}/stops`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ stops: PickupStop[] }>;
  },

  patchStop(
    stopId: string,
    payload: {
      clinic_id: string;
      status?: PickupStopStatus;
      completed_at?: string | null;
      failure_reason?: string | null;
      notes?: string | null;
      planned_at?: string | null;
      sequence?: number;
    },
  ) {
    return apiRequest(`${pickupBase}/stops/${encodeURIComponent(stopId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ stop: PickupStop }>;
  },
};
