import { apiRequest } from '@petimi/web-core';

const pickupBase = '/api/hub/pickup';

// ─── Tipos base ────────────────────────────────────────────────────────────

export type PickupDirection = 'pickup' | 'delivery' | 'clinic_return' | 'unknown';

export type PickupRouteStatus = 'planned' | 'in_progress' | 'done' | 'cancelled';
export type PickupStopStatus = 'pending' | 'en_route' | 'arrived' | 'in_transit' | 'completed' | 'failed';

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
  /** UUID do atendimento principal (pai) ao qual esta perna pertence. */
  parent_appointment_id?: string | null;
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
  cage_id?: string | null;
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
  vehicle_id?: string | null;
  vehicle_label?: string | null;
  status: PickupRouteStatus;
  notes?: string | null;
  label?: string | null;
  sort_order?: number;
  /** clinic = endereço da clínica/unidade; custom = informado na rota. */
  start_kind?: 'clinic' | 'custom' | null;
  start_address?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  stops_count?: number;
  onboard_count?: number;
  driver?: { id: string; full_name: string } | null;
  created_at: string;
  updated_at: string;
};

export type PickupRoutesResponse = { routes: PickupRoute[] };

export type PickupDriverDayResponse = {
  date: string;
  clinic_id: string;
  drivers: Array<{
    driver: { id: string; full_name: string } | null;
    routes: PickupRoute[];
  }>;
};

// ─── Paradas ──────────────────────────────────────────────────────────────

export type PickupStop = {
  id: string;
  hub_appointment_id?: string | null;
  pet_id?: string | null;
  guardian_id?: string | null;
  direction: 'pickup' | 'delivery' | 'clinic_return';
  address_snapshot?: Record<string, unknown> | null;
  sequence: number;
  cage_id?: string | null;
  status: PickupStopStatus;
  planned_at?: string | null;
  completed_at?: string | null;
  failure_reason?: string | null;
  notes?: string | null;
  updated_at?: string | null;
  pet?: PickupDayBoardPet | null;
  guardian?: PickupGuardian | null;
};

export type PickupStopEvent = {
  id: string;
  clinic_id: string;
  hub_pickup_stop_id: string;
  hub_pickup_route_id?: string | null;
  from_status: PickupStopStatus | string | null;
  to_status: PickupStopStatus | string;
  recorded_at: string;
  actor_staff_id?: string | null;
};

export type PickupRouteDetailResponse = {
  route: PickupRoute & { driver?: { id: string; full_name: string; phone?: string | null } | null };
  stops: PickupStop[];
  events?: PickupStopEvent[];
};

export type SuggestBatchesResponse = {
  capacity: number;
  batches: Array<{ label: string; stop_ids: string[]; pickup_count: number }>;
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

  driverDay(clinicId: string, dateYmd: string, opts?: { unitId?: string }) {
    const q = new URLSearchParams({ clinic_id: clinicId, date: dateYmd });
    if (opts?.unitId) q.set('unit_id', opts.unitId);
    return apiRequest(`${pickupBase}/driver-day?${q}`) as Promise<PickupDriverDayResponse>;
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
    vehicle_id?: string | null;
    vehicle_label?: string | null;
    notes?: string | null;
    label?: string | null;
    sort_order?: number;
    start_kind?: 'clinic' | 'custom';
    start_address?: string | null;
    start_lat?: number | null;
    start_lng?: number | null;
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
      vehicle_id?: string | null;
      vehicle_label?: string | null;
      notes?: string | null;
      label?: string | null;
      sort_order?: number;
      stop_sequence?: string[];
      start_kind?: 'clinic' | 'custom';
      start_address?: string | null;
      start_lat?: number | null;
      start_lng?: number | null;
      unit_id?: string | null;
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
        cage_id?: string | null;
      }>;
    },
  ) {
    return apiRequest(`${pickupBase}/routes/${encodeURIComponent(routeId)}/stops`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ stops: PickupStop[] }>;
  },

  splitRoute(
    routeId: string,
    payload: {
      clinic_id: string;
      after_sequence: number;
      label?: string | null;
      insert_clinic_return?: boolean;
    },
  ) {
    return apiRequest(`${pickupBase}/routes/${encodeURIComponent(routeId)}/split`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ route_a: PickupRoute; route_b: PickupRoute }>;
  },

  addClinicReturn(routeId: string, payload: { clinic_id: string; sequence?: number }) {
    return apiRequest(`${pickupBase}/routes/${encodeURIComponent(routeId)}/clinic-return`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ stops: PickupStop[] }>;
  },

  suggestBatches(payload: {
    clinic_id: string;
    vehicle_id?: string | null;
    capacity?: number;
    stops: Array<{
      hub_appointment_id: string;
      direction: 'pickup' | 'delivery';
      starts_at?: string | null;
      lat?: number | null;
      lng?: number | null;
    }>;
  }) {
    return apiRequest(`${pickupBase}/routes/suggest-batches`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<SuggestBatchesResponse>;
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

  /** Cria ou atualiza uma parada solta (sem rota) para uma perna pickup_route. */
  createLooseStop(payload: {
    clinic_id: string;
    hub_appointment_id: string;
    direction: 'pickup' | 'delivery';
    status: PickupStopStatus;
  }) {
    return apiRequest(`${pickupBase}/stops`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ stop: PickupStop }>;
  },

  /** Rota ativa do dia atribuída ao usuário autenticado (como motorista). */
  myRoute(clinicId: string, dateYmd: string) {
    const q = new URLSearchParams({ clinic_id: clinicId, date: dateYmd });
    return apiRequest(`${pickupBase}/my-route?${q}`) as Promise<{
      route: (PickupRoute & { driver?: { id: string; full_name: string; phone?: string | null } | null }) | null;
      stops?: PickupStop[];
    }>;
  },

  /** Fila de rotas do dia do motorista autenticado. */
  myRoutes(clinicId: string, dateYmd: string) {
    const q = new URLSearchParams({ clinic_id: clinicId, date: dateYmd });
    return apiRequest(`${pickupBase}/my-routes?${q}`) as Promise<{
      routes: PickupRoute[];
      active_route_id: string | null;
    }>;
  },
};
