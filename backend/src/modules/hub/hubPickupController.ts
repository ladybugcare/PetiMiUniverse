import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { fetchHubPetsMapByIds, resolvePrimaryPetIdsByGuardians } from './hubDayBoardPets';
import { syncOpenComandasAfterAppointmentOperationalComplete } from './hubComandasController';

const uuidStr = z.string().uuid();
const UUID_RE = /^[0-9a-f-]{36}$/;

// ─── Schemas compartilhados ────────────────────────────────────────────────

const dayBoardQuerySchema = z
  .object({
    clinic_id: uuidStr,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    unit_id: uuidStr.optional(),
    direction: z.enum(['pickup', 'delivery', 'all']).optional().default('all'),
  })
  .refine((d) => (d.from && d.to) || d.date, { message: 'Informe date ou from e to' });

const ROUTE_STATUSES = ['planned', 'in_progress', 'done', 'cancelled'] as const;
const STOP_STATUSES = ['pending', 'en_route', 'arrived', 'in_transit', 'completed', 'failed'] as const;
const START_KINDS = ['clinic', 'custom'] as const;

const ROUTE_SELECT =
  'id, clinic_id, unit_id, route_date, driver_staff_id, vehicle_id, vehicle_label, status, notes, label, sort_order, start_kind, start_address, start_lat, start_lng, created_at, updated_at';

type RouteRow = {
  id: string;
  status: string;
  sort_order?: number | null;
  created_at?: string;
  label?: string | null;
  vehicle_id?: string | null;
  vehicle_label?: string | null;
  driver_staff_id?: string | null;
  unit_id?: string | null;
  route_date?: string;
  clinic_id?: string;
  start_kind?: string | null;
  start_address?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
};

/** Escolhe a rota ativa do dia: in_progress → primeira planned → última done. */
function pickActiveRoute(routes: RouteRow[]): RouteRow | null {
  if (!routes.length) return null;
  const sorted = [...routes].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  });
  const inProgress = sorted.find((r) => r.status === 'in_progress');
  if (inProgress) return inProgress;
  const planned = sorted.find((r) => r.status === 'planned');
  if (planned) return planned;
  const done = [...sorted].reverse().find((r) => r.status === 'done');
  return done ?? sorted[sorted.length - 1] ?? null;
}

async function resolveDriverStaffIdForUser(
  clinicId: string,
  userId: string,
): Promise<string | null> {
  const { data: clinicUser } = await supabaseAdmin
    .from('clinic_users')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!clinicUser) return null;

  const { data: staffRow } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('clinic_user_id', (clinicUser as { id: string }).id)
    .is('deleted_at', null)
    .maybeSingle();
  return staffRow ? (staffRow as { id: string }).id : null;
}

/** Grava transição de status para o histórico de monitoramento. */
async function recordStopStatusEvent(opts: {
  clinic_id: string;
  hub_pickup_stop_id: string;
  hub_pickup_route_id?: string | null;
  from_status: string | null;
  to_status: string;
  actor_staff_id?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('hub_pickup_stop_events').insert({
    clinic_id: opts.clinic_id,
    hub_pickup_stop_id: opts.hub_pickup_stop_id,
    hub_pickup_route_id: opts.hub_pickup_route_id ?? null,
    from_status: opts.from_status,
    to_status: opts.to_status,
    actor_staff_id: opts.actor_staff_id ?? null,
  });
  if (error) {
    console.error('[hubPickupController] recordStopStatusEvent', error.message);
  }
}

async function resolveActorStaffIdFromRequest(
  req: Request,
  clinicId: string,
): Promise<string | null> {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  if (!userId) return null;
  return resolveDriverStaffIdForUser(clinicId, userId);
}

/** Capacidade efetiva do veículo (soma de caixas ativas ou capacity_animals). */
async function resolveVehicleCapacity(
  clinicId: string,
  vehicleId: string | null | undefined,
): Promise<number | null> {
  if (!vehicleId) return null;
  const { data: veh } = await supabaseAdmin
    .from('hub_pickup_vehicles')
    .select('id, capacity_animals, has_cages')
    .eq('id', vehicleId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!veh) return null;
  const v = veh as { capacity_animals: number; has_cages: boolean };
  if (v.has_cages) {
    const { data: cages } = await supabaseAdmin
      .from('hub_transport_cages')
      .select('capacity')
      .eq('vehicle_id', vehicleId)
      .eq('active', true);
    const sum = ((cages ?? []) as Array<{ capacity: number }>).reduce((s, c) => s + (c.capacity || 0), 0);
    if (sum > 0) return sum;
  }
  return v.capacity_animals ?? null;
}

function formatAddressParts(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
}): string | null {
  const line = String(parts.address ?? '').trim();
  const city = String(parts.city ?? '').trim();
  const state = String(parts.state ?? '').trim();
  const cityState = [city, state].filter(Boolean).join(' - ');
  const full = [line, cityState].filter(Boolean).join(', ');
  return full || null;
}

async function resolveClinicOrUnitAddress(
  clinicId: string,
  unitId?: string | null,
): Promise<{ address: string | null; label: string }> {
  if (unitId) {
    const { data: unit } = await supabaseAdmin
      .from('units')
      .select('name, address, city, state')
      .eq('id', unitId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (unit) {
      const u = unit as { name?: string; address?: string; city?: string; state?: string };
      return {
        address: formatAddressParts(u),
        label: u.name?.trim() ? `Unidade ${u.name.trim()}` : 'Unidade',
      };
    }
  }
  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('name, address, city, state')
    .eq('id', clinicId)
    .maybeSingle();
  const c = (clinic ?? {}) as { name?: string; address?: string; city?: string; state?: string };
  return {
    address: formatAddressParts(c),
    label: c.name?.trim() ? `Clínica ${c.name.trim()}` : 'Clínica',
  };
}

type ResolvedStartLocation = {
  start_kind: 'clinic' | 'custom';
  start_address: string | null;
  start_lat: number | null;
  start_lng: number | null;
};

async function resolveRouteStartLocation(input: {
  clinic_id: string;
  unit_id?: string | null;
  start_kind?: 'clinic' | 'custom' | null;
  start_address?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
}): Promise<{ ok: true; value: ResolvedStartLocation } | { ok: false; error: string }> {
  const kind = input.start_kind === 'custom' ? 'custom' : 'clinic';
  const lat =
    typeof input.start_lat === 'number' && Number.isFinite(input.start_lat) ? input.start_lat : null;
  const lng =
    typeof input.start_lng === 'number' && Number.isFinite(input.start_lng) ? input.start_lng : null;

  if (kind === 'custom') {
    const addr = String(input.start_address ?? '').trim();
    if (addr.length < 3) {
      return { ok: false, error: 'Informe o endereço de saída do motorista.' };
    }
    return {
      ok: true,
      value: { start_kind: 'custom', start_address: addr.slice(0, 500), start_lat: lat, start_lng: lng },
    };
  }

  const resolved = await resolveClinicOrUnitAddress(input.clinic_id, input.unit_id);
  if (!resolved.address) {
    return {
      ok: false,
      error:
        'A clínica/unidade não tem endereço cadastrado. Cadastre o endereço no perfil ou escolha «Outro endereço».',
    };
  }
  return {
    ok: true,
    value: {
      start_kind: 'clinic',
      start_address: resolved.address.slice(0, 500),
      start_lat: lat,
      start_lng: lng,
    },
  };
}

const optionalCoord = z
  .number()
  .finite()
  .min(-90)
  .max(90)
  .optional()
  .nullable();

const optionalLng = z
  .number()
  .finite()
  .min(-180)
  .max(180)
  .optional()
  .nullable();

const VALID_ROUTE_TRANSITIONS: Record<string, string[]> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['done', 'planned'],
  done: [],
  cancelled: [],
};

// Transições base — a validação para 'arrived' é refinada por direction no handler.
const VALID_STOP_TRANSITIONS: Record<string, string[]> = {
  pending: ['en_route', 'failed'],
  en_route: ['arrived', 'failed'],
  // pickup: arrived → in_transit; delivery: arrived → completed (aplicado no handler)
  arrived: ['in_transit', 'completed', 'failed'],
  in_transit: ['completed', 'failed'],
  completed: [],
  failed: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function dayBoundsFromYmdSaoPaulo(dateYmd: string): { from: string; to: string } {
  const from = new Date(`${dateYmd}T00:00:00-03:00`);
  const to = new Date(`${dateYmd}T23:59:59.999-03:00`);
  return { from: from.toISOString(), to: to.toISOString() };
}

function resolveDayBoardRange(query: {
  date?: string;
  from?: string;
  to?: string;
}): { from: string; to: string; dateYmd: string } {
  if (query.from && query.to) {
    const dateYmd = query.date ?? query.from.slice(0, 10);
    return { from: query.from, to: query.to, dateYmd };
  }
  const dateYmd = query.date!;
  const bounds = dayBoundsFromYmdSaoPaulo(dateYmd);
  return { ...bounds, dateYmd };
}

/**
 * Deriva o sentido da parada por heurística de ordem temporal.
 * Usado apenas para pernas que ainda não têm hub_pickup_stops (Fase 1 fallback).
 * Na Fase 2+ a direção vem diretamente de hub_pickup_stops.direction.
 */
function deriveDirections(
  pickupAppts: Array<{ id: string; pet_id: string | null; starts_at: string }>,
  standardAppts: Array<{ pet_id: string | null; starts_at: string }>,
): Map<string, 'pickup' | 'delivery' | 'unknown'> {
  const result = new Map<string, 'pickup' | 'delivery' | 'unknown'>();

  const byPet = new Map<string, Array<{ id: string; starts_at: string }>>();
  for (const a of pickupAppts) {
    const pid = a.pet_id ?? '__no_pet__';
    const list = byPet.get(pid) ?? [];
    list.push({ id: a.id, starts_at: a.starts_at });
    byPet.set(pid, list);
  }

  const standardByPet = new Map<string, string[]>();
  for (const a of standardAppts) {
    const pid = a.pet_id ?? '__no_pet__';
    const list = standardByPet.get(pid) ?? [];
    list.push(a.starts_at);
    standardByPet.set(pid, list);
  }

  for (const [pid, legs] of byPet.entries()) {
    legs.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    if (legs.length >= 2) {
      for (let i = 0; i < legs.length; i++) {
        result.set(legs[i].id, i === 0 ? 'pickup' : 'delivery');
      }
      continue;
    }
    const leg = legs[0];
    const stdTimes = standardByPet.get(pid) ?? [];
    if (stdTimes.length > 0) {
      stdTimes.sort();
      result.set(leg.id, leg.starts_at < stdTimes[0] ? 'pickup' : 'delivery');
    } else {
      result.set(leg.id, 'unknown');
    }
  }

  return result;
}

type GuardianRow = {
  id: string;
  full_name: string;
  phone?: string | null;
  street?: string | null;
  street_number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
};

/**
 * Geocodifica um endereço textual usando Nominatim (OpenStreetMap, gratuito).
 * Retorna null silenciosamente em caso de falha — geocoding não é crítico.
 * Respeita o limite de uso: chamadas devem ser espaçadas ≥ 1 segundo.
 */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PetiMiHub/1.0 (geocoding@petimi.com.br)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    // falha silenciosa — geocoding é enriquecimento opcional
  }
  return null;
}

function formatAddress(gu: GuardianRow | null): string | null {
  if (!gu) return null;
  const parts = [
    gu.street && gu.street_number ? `${gu.street}, ${gu.street_number}` : gu.street,
    gu.district,
    gu.city,
    gu.state,
  ];
  return parts.filter(Boolean).join(', ') || null;
}

// ─── GET /api/hub/pickup/day-board ────────────────────────────────────────

/**
 * Retorna todas as pernas L&T do dia, enriquecidas com:
 * - stop_id, route_id, sequence, direction REAL (quando a perna está em hub_pickup_stops)
 * - direção heurística apenas para pernas ainda soltas (sem parada registrada)
 */
export const getHubPickupDayBoard = async (req: Request, res: Response) => {
  try {
    const parsed = dayBoardQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, unit_id, direction } = parsed.data;
    const { from, to, dateYmd } = resolveDayBoardRange(parsed.data);

    // 1. Pernas L&T do dia
    let pickupQ = supabaseAdmin
      .from('hub_appointments')
      .select(
        'id, clinic_id, unit_id, pet_id, guardian_id, hub_staff_member_id, hub_service_type_id, starts_at, ends_at, status, resource_label, notes, appointment_kind, parent_appointment_id',
      )
      .eq('clinic_id', clinic_id)
      .eq('appointment_kind', 'pickup_route')
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .lt('starts_at', to)
      .gt('ends_at', from)
      .order('starts_at', { ascending: true });

    if (unit_id) pickupQ = pickupQ.eq('unit_id', unit_id);

    const { data: pickupRaw, error: pickupErr } = await pickupQ;
    if (pickupErr) return res.status(500).json({ error: pickupErr.message });

    const pickupAppts = (pickupRaw ?? []) as Array<{
      id: string;
      clinic_id: string;
      unit_id: string | null;
      pet_id: string | null;
      guardian_id: string | null;
      hub_staff_member_id: string | null;
      hub_service_type_id: string;
      starts_at: string;
      ends_at: string;
      status: string;
      resource_label: string | null;
      notes: string | null;
      appointment_kind: string;
    }>;

    if (pickupAppts.length === 0) {
      return res.json({ items: [], date: dateYmd, clinic_id });
    }

    const apptIds = pickupAppts.map((a) => a.id);

    // 2. Paradas já registradas (inclui soltas com hub_pickup_route_id null — ex.: avanço no kanban)
    const { data: stopsRaw } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('id, hub_appointment_id, hub_pickup_route_id, direction, sequence, cage_id, status, planned_at, completed_at, failure_reason, notes')
      .in('hub_appointment_id', apptIds);

    type StopRow = {
      id: string;
      hub_appointment_id: string;
      hub_pickup_route_id: string | null;
      direction: string;
      sequence: number;
      cage_id: string | null;
      status: string;
      planned_at: string | null;
      completed_at: string | null;
      failure_reason: string | null;
      notes: string | null;
    };

    const stopByApptId = new Map<string, StopRow>();
    for (const s of (stopsRaw ?? []) as StopRow[]) {
      const existing = stopByApptId.get(s.hub_appointment_id);
      // Preferir parada vinculada a rota se houver duplicata (solta + rota).
      if (!existing || (s.hub_pickup_route_id && !existing.hub_pickup_route_id)) {
        stopByApptId.set(s.hub_appointment_id, s);
      }
    }

    // 3. Heurística para pernas ainda soltas
    const loosePetIds = [...new Set(
      pickupAppts
        .filter((a) => !stopByApptId.has(a.id))
        .map((a) => a.pet_id)
        .filter(Boolean) as string[],
    )];

    const standardAppts: Array<{ pet_id: string | null; starts_at: string }> = [];
    if (loosePetIds.length > 0) {
      let stdQ = supabaseAdmin
        .from('hub_appointments')
        .select('pet_id, starts_at')
        .eq('clinic_id', clinic_id)
        .eq('appointment_kind', 'standard')
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .in('pet_id', loosePetIds)
        .lt('starts_at', to)
        .gt('ends_at', from);
      if (unit_id) stdQ = stdQ.eq('unit_id', unit_id);
      const { data: stdData } = await stdQ;
      standardAppts.push(...((stdData ?? []) as Array<{ pet_id: string | null; starts_at: string }>));
    }

    const looseAppts = pickupAppts.filter((a) => !stopByApptId.has(a.id));
    const heuristicMap = deriveDirections(looseAppts, standardAppts);

    // 4. Enriquecer com pet, tutor e tipo de serviço
    const petIdSet = new Set(pickupAppts.map((a) => a.pet_id).filter(Boolean) as string[]);
    const guIds = [...new Set(pickupAppts.map((a) => a.guardian_id).filter(Boolean) as string[])];
    const stIds = [...new Set(pickupAppts.map((a) => a.hub_service_type_id).filter(Boolean) as string[])];

    const guardiansMissingPet = pickupAppts
      .filter((a) => !a.pet_id && a.guardian_id)
      .map((a) => a.guardian_id as string);
    const petByGuardian = await resolvePrimaryPetIdsByGuardians(clinic_id, guardiansMissingPet);
    for (const pid of petByGuardian.values()) petIdSet.add(pid);

    const [gusRes, stsRes, petMap] = await Promise.all([
      guIds.length
        ? supabaseAdmin
            .from('hub_guardians')
            .select('id, full_name, phone, street, street_number, district, city, state, postal_code')
            .in('id', guIds)
        : Promise.resolve({ data: [] }),
      stIds.length
        ? supabaseAdmin
            .from('hub_service_types')
            .select('id, name, service_group')
            .in('id', stIds)
        : Promise.resolve({ data: [] }),
      fetchHubPetsMapByIds(petIdSet),
    ]);
    const guMap = new Map(
      ((gusRes.data ?? []) as Array<{ id: string } & Record<string, unknown>>).map((g) => [g.id, g]),
    );
    const stMap = new Map(
      ((stsRes.data ?? []) as Array<{ id: string } & Record<string, unknown>>).map((s) => [s.id, s]),
    );

    // 5. Montar itens
    const items = pickupAppts
      .map((a) => {
        const stop = stopByApptId.get(a.id);
        const itemDirection = stop
          ? (stop.direction as 'pickup' | 'delivery')
          : (heuristicMap.get(a.id) ?? 'unknown');

        const effectivePetId =
          a.pet_id ?? (a.guardian_id ? petByGuardian.get(a.guardian_id) ?? null : null);
        const pet = effectivePetId ? petMap.get(effectivePetId) ?? null : null;
        const gu = (a.guardian_id ? guMap.get(a.guardian_id) ?? null : null) as GuardianRow | null;
        const serviceType = a.hub_service_type_id
          ? (stMap.get(a.hub_service_type_id) as { id: string; name: string; service_group: string } | undefined) ?? null
          : null;

        return {
          appointment_id: a.id,
          appointment_kind: 'pickup_route' as const,
          parent_appointment_id: (a as Record<string, unknown>).parent_appointment_id as string | null ?? null,
          direction: itemDirection,
          starts_at: a.starts_at,
          ends_at: a.ends_at,
          status: stop ? stop.status : a.status,
          notes: stop?.notes ?? a.notes,
          resource_label: a.resource_label,
          // Campos de rota (null quando perna ainda solta)
          stop_id: stop?.id ?? null,
          route_id: stop?.hub_pickup_route_id ?? null,
          sequence: stop?.sequence ?? null,
          cage_id: stop?.cage_id ?? null,
          stop_status: stop?.status ?? null,
          planned_at: stop?.planned_at ?? null,
          completed_at: stop?.completed_at ?? null,
          failure_reason: stop?.failure_reason ?? null,
          service_type: serviceType ? { id: serviceType.id, name: serviceType.name, service_group: serviceType.service_group } : null,
          pet: pet ?? null,
          guardian: gu ? { id: gu.id, full_name: gu.full_name, phone: gu.phone ?? null } : null,
          address: formatAddress(gu),
          unit_id: a.unit_id,
          hub_staff_member_id: a.hub_staff_member_id,
        };
      })
      .filter((item) => {
        if (direction === 'all') return true;
        return item.direction === direction;
      });

    return res.json({ items, date: dateYmd, clinic_id });
  } catch (err) {
    console.error('[hubPickupController] getHubPickupDayBoard', err);
    return res.status(500).json({ error: 'Erro interno ao carregar paradas L&T.' });
  }
};

// ─── POST /api/hub/pickup/routes ──────────────────────────────────────────

const createRouteSchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    route_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
    driver_staff_id: uuidStr.optional().nullable(),
    vehicle_id: uuidStr.optional().nullable(),
    vehicle_label: z.string().max(200).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    label: z.string().trim().max(80).optional().nullable(),
    sort_order: z.number().int().min(0).max(9999).optional(),
    start_kind: z.enum(START_KINDS).optional().default('clinic'),
    start_address: z.string().trim().max(500).optional().nullable(),
    start_lat: optionalCoord,
    start_lng: optionalLng,
  })
  .strict();

export const createHubPickupRoute = async (req: Request, res: Response) => {
  try {
    const parsed = createRouteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const {
      clinic_id,
      vehicle_id,
      start_kind,
      start_address,
      start_lat,
      start_lng,
      unit_id,
      ...rest
    } = parsed.data;

    const startResolved = await resolveRouteStartLocation({
      clinic_id,
      unit_id,
      start_kind,
      start_address,
      start_lat,
      start_lng,
    });
    if (!startResolved.ok) return res.status(400).json({ error: startResolved.error });

    // Auto-preencher vehicle_label com o nome do veículo cadastrado
    let vehicleLabel = rest.vehicle_label ?? null;
    if (vehicle_id) {
      const { data: veh } = await supabaseAdmin
        .from('hub_pickup_vehicles')
        .select('name')
        .eq('id', vehicle_id)
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (veh) vehicleLabel = (veh as { name: string }).name;
    }

    let sortOrder = rest.sort_order;
    if (sortOrder == null && rest.driver_staff_id) {
      const { data: maxRow } = await supabaseAdmin
        .from('hub_pickup_routes')
        .select('sort_order')
        .eq('clinic_id', clinic_id)
        .eq('driver_staff_id', rest.driver_staff_id)
        .eq('route_date', rest.route_date)
        .is('deleted_at', null)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      sortOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
    }

    const { data: created, error: insErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .insert({
        clinic_id,
        unit_id: unit_id ?? null,
        vehicle_id: vehicle_id ?? null,
        ...rest,
        sort_order: sortOrder ?? 0,
        label: rest.label?.trim() || null,
        vehicle_label: vehicleLabel,
        status: 'planned',
        ...startResolved.value,
      })
      .select(ROUTE_SELECT)
      .single();
    if (insErr) return res.status(500).json({ error: insErr.message });

    return res.status(201).json({ route: created });
  } catch (e) {
    console.error('[hubPickupController] createHubPickupRoute', e);
    return res.status(500).json({ error: 'Erro ao criar rota.' });
  }
};

// ─── GET /api/hub/pickup/routes ───────────────────────────────────────────

const listRoutesQuerySchema = z.object({
  clinic_id: uuidStr,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  unit_id: uuidStr.optional(),
  status: z.enum(ROUTE_STATUSES).optional(),
});

export const listHubPickupRoutes = async (req: Request, res: Response) => {
  try {
    const parsed = listRoutesQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, date, unit_id, status } = parsed.data;

    let q = supabaseAdmin
      .from('hub_pickup_routes')
      .select(ROUTE_SELECT)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (date) q = q.eq('route_date', date);
    if (unit_id) q = q.eq('unit_id', unit_id);
    if (status) q = q.eq('status', status);

    const { data: routes, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    // Enriquecer com motorista e contagem de paradas
    const routeIds = (routes ?? []).map((r: Record<string, unknown>) => r.id as string);
    const driverIds = [
      ...new Set(
        (routes ?? [])
          .map((r: Record<string, unknown>) => r.driver_staff_id as string | null)
          .filter(Boolean) as string[],
      ),
    ];

    const [stopsCountRes, driversRes] = await Promise.all([
      routeIds.length
        ? supabaseAdmin
            .from('hub_pickup_stops')
            .select('hub_pickup_route_id, id')
            .in('hub_pickup_route_id', routeIds)
        : Promise.resolve({ data: [] }),
      driverIds.length
        ? supabaseAdmin.from('hub_staff_members').select('id, full_name').in('id', driverIds)
        : Promise.resolve({ data: [] }),
    ]);

    const stopCountByRoute = new Map<string, number>();
    for (const s of (stopsCountRes.data ?? []) as Array<{ hub_pickup_route_id: string }>) {
      stopCountByRoute.set(s.hub_pickup_route_id, (stopCountByRoute.get(s.hub_pickup_route_id) ?? 0) + 1);
    }
    const driverMap = new Map(
      ((driversRes.data ?? []) as Array<{ id: string; full_name: string }>).map((d) => [d.id, d]),
    );

    const enriched = (routes ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      stops_count: stopCountByRoute.get(r.id as string) ?? 0,
      driver: r.driver_staff_id ? (driverMap.get(r.driver_staff_id as string) ?? null) : null,
    }));

    return res.json({ routes: enriched });
  } catch (e) {
    console.error('[hubPickupController] listHubPickupRoutes', e);
    return res.status(500).json({ error: 'Erro ao listar rotas.' });
  }
};

// ─── POST /api/hub/pickup/routes/:id/stops ────────────────────────────────

const addStopsSchema = z
  .object({
    clinic_id: uuidStr,
    stops: z
      .array(
        z.object({
          hub_appointment_id: uuidStr,
          direction: z.enum(['pickup', 'delivery']),
          sequence: z.number().int().min(0).optional(),
          planned_at: z.string().datetime({ offset: true }).optional().nullable(),
          cage_id: uuidStr.optional().nullable(),
        }),
      )
      .min(1),
  })
  .strict();

export const addHubPickupStops = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de rota inválido' });

    const parsed = addStopsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, stops } = parsed.data;

    // Verificar rota existe e pertence à clínica
    const { data: route, error: routeErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .select('id, status, vehicle_id')
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (routeErr) return res.status(500).json({ error: routeErr.message });
    if (!route) return res.status(404).json({ error: 'Rota não encontrada' });
    if ((route as { status: string }).status === 'cancelled') {
      return res.status(422).json({ error: 'Não é possível adicionar paradas a uma rota cancelada.' });
    }

    const capacity = await resolveVehicleCapacity(
      clinic_id,
      (route as { vehicle_id?: string | null }).vehicle_id,
    );
    if (capacity != null) {
      const { data: existingStops } = await supabaseAdmin
        .from('hub_pickup_stops')
        .select('hub_appointment_id, direction, status')
        .eq('hub_pickup_route_id', id);
      const existingRows = (existingStops ?? []) as Array<{
        hub_appointment_id: string | null;
        direction: string;
        status: string;
      }>;
      const keepApptIds = new Set(stops.map((s) => s.hub_appointment_id));
      const remainingExisting = existingRows.filter(
        (s) =>
          s.direction === 'clinic_return' ||
          (s.hub_appointment_id && keepApptIds.has(s.hub_appointment_id)),
      );
      // Novas coletas no payload (substitui o conjunto de appointment stops)
      const projectedFromPayload = stops.filter((s) => s.direction === 'pickup').length;
      const clinicReturns = remainingExisting.filter((s) => s.direction === 'clinic_return').length;
      // Capacidade = coletas projetadas do payload (edição completa da seleção)
      const projected = projectedFromPayload;
      if (projected > capacity) {
        return res.status(400).json({
          error: `Capacidade do veículo excedida: ${projected} coleta(s) para capacidade ${capacity}.`,
          capacity,
          projected,
          clinic_returns: clinicReturns,
        });
      }
    }

    // Verificar que os agendamentos são do tipo pickup_route e da clínica
    const apptIds = stops.map((s) => s.hub_appointment_id);
    const { data: appts, error: apptErr } = await supabaseAdmin
      .from('hub_appointments')
      .select('id, pet_id, guardian_id, clinic_id, appointment_kind')
      .in('id', apptIds)
      .eq('clinic_id', clinic_id)
      .eq('appointment_kind', 'pickup_route')
      .is('deleted_at', null);
    if (apptErr) return res.status(500).json({ error: apptErr.message });

    const validApptIds = new Set(
      ((appts ?? []) as Array<{ id: string; pet_id: string | null; guardian_id: string | null }>).map((a) => a.id),
    );
    const apptMap = new Map(
      ((appts ?? []) as Array<{ id: string; pet_id: string | null; guardian_id: string | null }>).map((a) => [a.id, a]),
    );

    const invalid = apptIds.filter((id) => !validApptIds.has(id));
    if (invalid.length) {
      return res.status(422).json({ error: `Agendamentos inválidos ou não são do tipo pickup_route: ${invalid.join(', ')}` });
    }

    // Stops já em rota: conflita se for OUTRA rota; se for ESTA, atualiza (idempotente na edição).
    const { data: existing } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('id, hub_appointment_id, hub_pickup_route_id, address_snapshot, status')
      .in('hub_appointment_id', apptIds)
      .not('hub_pickup_route_id', 'is', null);

    const alreadyInRoute = (existing ?? []) as Array<{
      id: string;
      hub_appointment_id: string;
      hub_pickup_route_id: string;
      address_snapshot: Record<string, unknown> | null;
      status: string;
    }>;
    const conflicts = alreadyInRoute.filter((s) => s.hub_pickup_route_id !== id);
    if (conflicts.length) {
      return res.status(409).json({
        error: 'Uma ou mais pernas já estão em outra rota ativa.',
        conflicts: conflicts.map((c) => c.hub_appointment_id),
      });
    }

    const onThisRouteMap = new Map(
      alreadyInRoute
        .filter((s) => s.hub_pickup_route_id === id)
        .map((s) => [s.hub_appointment_id, s]),
    );

    // Buscar snapshot de endereço dos tutores (só para pernas novas / soltas)
    const needsGeocodeIds = apptIds.filter((aid) => !onThisRouteMap.has(aid));
    const guardianIds = [
      ...new Set(
        needsGeocodeIds
          .map((aid) => apptMap.get(aid)?.guardian_id)
          .filter(Boolean) as string[],
      ),
    ];
    const guardianMap = new Map<string, Record<string, unknown>>();
    if (guardianIds.length > 0) {
      const { data: guardians } = await supabaseAdmin
        .from('hub_guardians')
        .select('id, street, street_number, district, city, state, postal_code')
        .in('id', guardianIds);
      for (const g of (guardians ?? []) as Array<{ id: string } & Record<string, unknown>>) {
        guardianMap.set(g.id, g);
      }
    }

    type StopInsert = {
      clinic_id: string;
      hub_pickup_route_id: string;
      hub_appointment_id: string;
      pet_id: string | null;
      guardian_id: string | null;
      direction: string;
      address_snapshot: Record<string, unknown> | null;
      sequence: number;
      planned_at: string | null;
      cage_id: string | null;
      status: string;
    };

    const toUpdateOnRoute: Array<StopInsert & { stop_id: string }> = [];
    const toLinkOrInsert: StopInsert[] = [];

    for (let idx = 0; idx < stops.length; idx++) {
      const s = stops[idx];
      const appt = apptMap.get(s.hub_appointment_id)!;
      const onRoute = onThisRouteMap.get(s.hub_appointment_id);

      if (onRoute) {
        // Já está nesta rota: só atualiza ordem / direção / caixa (não reseta status).
        toUpdateOnRoute.push({
          stop_id: onRoute.id,
          clinic_id,
          hub_pickup_route_id: id,
          hub_appointment_id: s.hub_appointment_id,
          pet_id: appt.pet_id ?? null,
          guardian_id: appt.guardian_id ?? null,
          direction: s.direction,
          address_snapshot: onRoute.address_snapshot,
          sequence: s.sequence ?? idx,
          planned_at: s.planned_at ?? null,
          cage_id: s.cage_id ?? null,
          status: onRoute.status,
        });
        continue;
      }

      const gu = (appt.guardian_id ? guardianMap.get(appt.guardian_id) : null) as
        | Record<string, unknown>
        | undefined;

      let addressSnapshot: Record<string, unknown> | null = gu ?? null;

      if (gu) {
        const addrStr = [gu.street, gu.district, gu.city, gu.state, 'Brasil']
          .filter(Boolean)
          .join(', ');
        if (addrStr.length > 10) {
          const coords = await geocodeAddress(addrStr);
          if (coords) {
            addressSnapshot = { ...gu, lat: coords.lat, lng: coords.lng };
          }
          if (idx < stops.length - 1) {
            await new Promise<void>((r) => setTimeout(r, 1100));
          }
        }
      }

      toLinkOrInsert.push({
        clinic_id,
        hub_pickup_route_id: id,
        hub_appointment_id: s.hub_appointment_id,
        pet_id: appt.pet_id ?? null,
        guardian_id: appt.guardian_id ?? null,
        direction: s.direction,
        address_snapshot: addressSnapshot,
        sequence: s.sequence ?? idx,
        planned_at: s.planned_at ?? null,
        cage_id: s.cage_id ?? null,
        status: 'pending',
      });
    }

    const apptIdsToLink = toLinkOrInsert.map((i) => i.hub_appointment_id);
    const looseMap = new Map<string, string>();
    if (apptIdsToLink.length > 0) {
      const { data: existingLoose } = await supabaseAdmin
        .from('hub_pickup_stops')
        .select('id, hub_appointment_id')
        .in('hub_appointment_id', apptIdsToLink)
        .is('hub_pickup_route_id', null);
      for (const s of (existingLoose ?? []) as Array<{ id: string; hub_appointment_id: string }>) {
        looseMap.set(s.hub_appointment_id, s.id);
      }
    }

    const toUpdateLoose = toLinkOrInsert.filter((i) => looseMap.has(i.hub_appointment_id));
    const toInsert = toLinkOrInsert.filter((i) => !looseMap.has(i.hub_appointment_id));

    const created: unknown[] = [];

    for (const upd of toUpdateOnRoute) {
      const { data: updRow, error: updErr } = await supabaseAdmin
        .from('hub_pickup_stops')
        .update({
          direction: upd.direction,
          sequence: upd.sequence,
          cage_id: upd.cage_id,
          planned_at: upd.planned_at,
        })
        .eq('id', upd.stop_id)
        .eq('hub_pickup_route_id', id)
        .select('id, hub_appointment_id, direction, sequence, cage_id, status, planned_at')
        .single();
      if (updErr) return res.status(500).json({ error: updErr.message });
      if (updRow) created.push(updRow);
    }

    for (const upd of toUpdateLoose) {
      const stopId = looseMap.get(upd.hub_appointment_id)!;
      const { data: updRow, error: updErr } = await supabaseAdmin
        .from('hub_pickup_stops')
        .update({
          hub_pickup_route_id: upd.hub_pickup_route_id,
          direction: upd.direction,
          sequence: upd.sequence,
          address_snapshot: upd.address_snapshot,
          planned_at: upd.planned_at,
          cage_id: upd.cage_id,
          status: upd.status,
        })
        .eq('id', stopId)
        .select('id, hub_appointment_id, direction, sequence, cage_id, status, planned_at')
        .single();
      if (updErr) return res.status(500).json({ error: updErr.message });
      if (updRow) created.push(updRow);
    }

    if (toInsert.length > 0) {
      const { data: insRows, error: insErr } = await supabaseAdmin
        .from('hub_pickup_stops')
        .insert(toInsert)
        .select('id, hub_appointment_id, direction, sequence, cage_id, status, planned_at');
      if (insErr) return res.status(500).json({ error: insErr.message });
      for (const row of insRows ?? []) created.push(row);
    }

    // Removidas da seleção na edição: desvincula da rota (vira perna solta de novo).
    const keepApptIds = new Set(apptIds);
    const { data: currentRouteStops, error: curStopsErr } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('id, hub_appointment_id')
      .eq('hub_pickup_route_id', id);
    if (curStopsErr) return res.status(500).json({ error: curStopsErr.message });

    const toDetach = ((currentRouteStops ?? []) as Array<{ id: string; hub_appointment_id: string | null }>).filter(
      (s) => s.hub_appointment_id && !keepApptIds.has(s.hub_appointment_id),
    );
    if (toDetach.length > 0) {
      const { error: detachErr } = await supabaseAdmin
        .from('hub_pickup_stops')
        .update({ hub_pickup_route_id: null })
        .in(
          'id',
          toDetach.map((s) => s.id),
        );
      if (detachErr) return res.status(500).json({ error: detachErr.message });
    }

    return res.status(201).json({ stops: created });
  } catch (e) {
    console.error('[hubPickupController] addHubPickupStops', e);
    return res.status(500).json({ error: 'Erro ao adicionar paradas.' });
  }
};

// ─── PATCH /api/hub/pickup/routes/:id ────────────────────────────────────

const patchRouteSchema = z
  .object({
    clinic_id: uuidStr,
    status: z.enum(ROUTE_STATUSES).optional(),
    driver_staff_id: uuidStr.optional().nullable(),
    vehicle_id: uuidStr.optional().nullable(),
    vehicle_label: z.string().max(200).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    label: z.string().trim().max(80).optional().nullable(),
    sort_order: z.number().int().min(0).max(9999).optional(),
    stop_sequence: z.array(uuidStr).optional(),
    start_kind: z.enum(START_KINDS).optional(),
    start_address: z.string().trim().max(500).optional().nullable(),
    start_lat: optionalCoord,
    start_lng: optionalLng,
    unit_id: uuidStr.optional().nullable(),
  })
  .strict();

export const patchHubPickupRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de rota inválido' });

    const parsed = patchRouteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const {
      clinic_id,
      status: newStatus,
      stop_sequence,
      vehicle_id,
      start_kind,
      start_address,
      start_lat,
      start_lng,
      unit_id,
      ...rest
    } = parsed.data;

    // Auto-preencher vehicle_label com o nome do veículo cadastrado
    if (vehicle_id !== undefined) {
      if (vehicle_id) {
        const { data: veh } = await supabaseAdmin
          .from('hub_pickup_vehicles')
          .select('name')
          .eq('id', vehicle_id)
          .eq('clinic_id', clinic_id)
          .is('deleted_at', null)
          .maybeSingle();
        if (veh && !rest.vehicle_label) {
          rest.vehicle_label = (veh as { name: string }).name;
        }
      }
      (rest as Record<string, unknown>).vehicle_id = vehicle_id;
    }

    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .select('id, status, unit_id, start_kind, start_address, start_lat, start_lng')
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!current) return res.status(404).json({ error: 'Rota não encontrada' });

    if (newStatus) {
      const allowed = VALID_ROUTE_TRANSITIONS[(current as { status: string }).status] ?? [];
      if (!allowed.includes(newStatus)) {
        return res.status(422).json({
          error: `Transição inválida: ${(current as { status: string }).status} → ${newStatus}`,
        });
      }
    }

    const patch: Record<string, unknown> = { ...rest };
    if (newStatus) patch.status = newStatus;
    if (unit_id !== undefined) patch.unit_id = unit_id;

    const wantsStartUpdate =
      start_kind !== undefined ||
      start_address !== undefined ||
      start_lat !== undefined ||
      start_lng !== undefined;
    if (wantsStartUpdate) {
      const cur = current as {
        unit_id?: string | null;
        start_kind?: string | null;
        start_address?: string | null;
        start_lat?: number | null;
        start_lng?: number | null;
      };
      const startResolved = await resolveRouteStartLocation({
        clinic_id,
        unit_id: unit_id !== undefined ? unit_id : cur.unit_id,
        start_kind: (start_kind ?? cur.start_kind ?? 'clinic') as 'clinic' | 'custom',
        start_address: start_address !== undefined ? start_address : cur.start_address,
        start_lat: start_lat !== undefined ? start_lat : cur.start_lat,
        start_lng: start_lng !== undefined ? start_lng : cur.start_lng,
      });
      if (!startResolved.ok) return res.status(400).json({ error: startResolved.error });
      Object.assign(patch, startResolved.value);
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .update(patch)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .select(ROUTE_SELECT)
      .single();
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Reordenar paradas se stop_sequence fornecido
    if (stop_sequence && stop_sequence.length > 0) {
      const sequenceUpdates = stop_sequence.map((stopId, idx) =>
        supabaseAdmin
          .from('hub_pickup_stops')
          .update({ sequence: idx })
          .eq('id', stopId)
          .eq('hub_pickup_route_id', id),
      );
      await Promise.all(sequenceUpdates);
    }

    return res.json({ route: updated });
  } catch (e) {
    console.error('[hubPickupController] patchHubPickupRoute', e);
    return res.status(500).json({ error: 'Erro ao atualizar rota.' });
  }
};

// ─── GET /api/hub/pickup/routes/:id ──────────────────────────────────────

export const getHubPickupRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de rota inválido' });

    const { clinic_id } = req.query as { clinic_id?: string };
    if (!clinic_id || !UUID_RE.test(clinic_id)) {
      return res.status(400).json({ error: 'clinic_id inválido' });
    }

    const { data: route, error: routeErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .select(ROUTE_SELECT)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (routeErr) return res.status(500).json({ error: routeErr.message });
    if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

    const { data: stopsRaw, error: stopsErr } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select(
        'id, hub_appointment_id, pet_id, guardian_id, direction, address_snapshot, sequence, status, planned_at, completed_at, failure_reason, notes, updated_at',
      )
      .eq('hub_pickup_route_id', id)
      .order('sequence', { ascending: true });
    if (stopsErr) return res.status(500).json({ error: stopsErr.message });

    const stops = (stopsRaw ?? []) as Array<{
      id: string;
      hub_appointment_id: string | null;
      pet_id: string | null;
      guardian_id: string | null;
      direction: string;
      address_snapshot: Record<string, unknown> | null;
      sequence: number;
      status: string;
      planned_at: string | null;
      completed_at: string | null;
      failure_reason: string | null;
      notes: string | null;
      updated_at: string;
    }>;

    // Enriquecer com pet e tutor
    const petIdSet = new Set(stops.map((s) => s.pet_id).filter(Boolean) as string[]);
    const guIds = [...new Set(stops.map((s) => s.guardian_id).filter(Boolean) as string[])];

    const guardiansMissingPet = stops
      .filter((s) => !s.pet_id && s.guardian_id)
      .map((s) => s.guardian_id as string);
    const petByGuardian = await resolvePrimaryPetIdsByGuardians(clinic_id, guardiansMissingPet);
    for (const pid of petByGuardian.values()) petIdSet.add(pid);

    const [gusRes, petMap, eventsRes] = await Promise.all([
      guIds.length
        ? supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', guIds)
        : Promise.resolve({ data: [] }),
      fetchHubPetsMapByIds(petIdSet),
      supabaseAdmin
        .from('hub_pickup_stop_events')
        .select(
          'id, clinic_id, hub_pickup_stop_id, hub_pickup_route_id, from_status, to_status, recorded_at, actor_staff_id',
        )
        .eq('hub_pickup_route_id', id)
        .eq('clinic_id', clinic_id)
        .order('recorded_at', { ascending: true }),
    ]);
    if (eventsRes.error) {
      console.error('[hubPickupController] getHubPickupRoute events', eventsRes.error.message);
    }
    const guMap = new Map(
      ((gusRes.data ?? []) as Array<{ id: string; full_name: string; phone?: string | null }>).map((g) => [g.id, g]),
    );

    // Motorista
    const routeRow = route as { driver_staff_id?: string | null } & Record<string, unknown>;
    let driver = null;
    if (routeRow.driver_staff_id) {
      const { data: d } = await supabaseAdmin
        .from('hub_staff_members')
        .select('id, full_name, phone')
        .eq('id', routeRow.driver_staff_id)
        .maybeSingle();
      driver = d;
    }

    const enrichedStops = stops.map((s) => {
      const effectivePetId =
        s.pet_id ?? (s.guardian_id ? petByGuardian.get(s.guardian_id) ?? null : null);
      return {
        ...s,
        pet: effectivePetId ? petMap.get(effectivePetId) ?? null : null,
        guardian: s.guardian_id
          ? { ...guMap.get(s.guardian_id), phone: guMap.get(s.guardian_id)?.phone ?? null }
          : null,
      };
    });

    const events = (eventsRes.data ?? []) as Array<{
      id: string;
      clinic_id: string;
      hub_pickup_stop_id: string;
      hub_pickup_route_id: string | null;
      from_status: string | null;
      to_status: string;
      recorded_at: string;
      actor_staff_id: string | null;
    }>;

    return res.json({ route: { ...route, driver }, stops: enrichedStops, events });
  } catch (e) {
    console.error('[hubPickupController] getHubPickupRoute', e);
    return res.status(500).json({ error: 'Erro ao buscar rota.' });
  }
};

// ─── PATCH /api/hub/pickup/stops/:id ─────────────────────────────────────

const patchStopSchema = z
  .object({
    clinic_id: uuidStr,
    status: z.enum(STOP_STATUSES).optional(),
    completed_at: z.string().datetime({ offset: true }).optional().nullable(),
    failure_reason: z.string().max(1000).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    planned_at: z.string().datetime({ offset: true }).optional().nullable(),
    sequence: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.status === 'failed' && !val.failure_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['failure_reason'],
        message: 'failure_reason é obrigatório quando status é "failed".',
      });
    }
  });

export const patchHubPickupStop = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de parada inválido' });

    const parsed = patchStopSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, status: newStatus, ...rest } = parsed.data;

    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('id, status, direction, hub_appointment_id, hub_pickup_route_id')
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!current) return res.status(404).json({ error: 'Parada não encontrada' });

    const cur = current as {
      status: string;
      direction: string;
      hub_appointment_id: string | null;
      hub_pickup_route_id: string | null;
    };

    if (newStatus) {
      let allowed = VALID_STOP_TRANSITIONS[cur.status] ?? [];
      // Refinar transições de 'arrived' por sentido
      if (cur.status === 'arrived') {
        if (cur.direction === 'pickup') {
          allowed = ['in_transit', 'failed'];
        } else {
          // delivery e clinic_return: arrived → completed
          allowed = ['completed', 'failed'];
        }
      }
      if (!allowed.includes(newStatus)) {
        return res.status(422).json({
          error: `Transição inválida: ${cur.status} → ${newStatus}`,
        });
      }
    }

    const patch: Record<string, unknown> = { ...rest };
    if (newStatus) patch.status = newStatus;
    if (newStatus === 'completed' && !rest.completed_at) {
      patch.completed_at = new Date().toISOString();
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('hub_pickup_stops')
      .update(patch)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .select('id, status, completed_at, failure_reason, notes, sequence, direction, planned_at, updated_at')
      .single();
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    if (newStatus && newStatus !== cur.status) {
      const actorStaffId = await resolveActorStaffIdFromRequest(req, clinic_id);
      await recordStopStatusEvent({
        clinic_id,
        hub_pickup_stop_id: id,
        hub_pickup_route_id: cur.hub_pickup_route_id,
        from_status: cur.status,
        to_status: newStatus,
        actor_staff_id: actorStaffId,
      });
    }

    // Auto planned → in_progress na primeira parada que sai de pending
    if (
      newStatus &&
      cur.status === 'pending' &&
      newStatus !== 'pending' &&
      newStatus !== 'failed' &&
      cur.hub_pickup_route_id
    ) {
      await supabaseAdmin
        .from('hub_pickup_routes')
        .update({ status: 'in_progress' })
        .eq('id', cur.hub_pickup_route_id)
        .eq('clinic_id', clinic_id)
        .eq('status', 'planned');
    }

    // Sincronizar hub_appointments conforme progresso da parada
    if (cur.hub_appointment_id && newStatus) {
      let apptStatus: string | null = null;
      if (newStatus === 'completed') apptStatus = 'done';
      else if (['en_route', 'arrived', 'in_transit'].includes(newStatus)) apptStatus = 'in_progress';

      if (apptStatus) {
        await supabaseAdmin
          .from('hub_appointments')
          .update({ status: apptStatus })
          .eq('id', cur.hub_appointment_id)
          .eq('clinic_id', clinic_id);
      }
      if (newStatus === 'completed') {
        void syncOpenComandasAfterAppointmentOperationalComplete(clinic_id, cur.hub_appointment_id);
      }
    }

    // Auto-concluir rota se todas as paradas estiverem concluídas ou com falha
    if (newStatus && ['completed', 'failed'].includes(newStatus) && cur.hub_pickup_route_id) {
      const { data: remainingStops } = await supabaseAdmin
        .from('hub_pickup_stops')
        .select('status')
        .eq('hub_pickup_route_id', cur.hub_pickup_route_id)
        .not('status', 'in', '("completed","failed")');

      if ((remainingStops ?? []).length === 0) {
        await supabaseAdmin
          .from('hub_pickup_routes')
          .update({ status: 'done' })
          .eq('id', cur.hub_pickup_route_id)
          .eq('clinic_id', clinic_id);
      }
    }

    return res.json({ stop: updated });
  } catch (e) {
    console.error('[hubPickupController] patchHubPickupStop', e);
    return res.status(500).json({ error: 'Erro ao atualizar parada.' });
  }
};

// ─── POST /api/hub/pickup/stops (perna solta) ────────────────────────────

const createLooseStopSchema = z
  .object({
    clinic_id: uuidStr,
    hub_appointment_id: uuidStr,
    direction: z.enum(['pickup', 'delivery']),
    status: z.enum(STOP_STATUSES).default('pending'),
  })
  .strict();

/**
 * Cria (ou atualiza) uma parada solta para uma perna pickup_route sem rota atribuída.
 * Garante no máximo uma parada solta por agendamento (índice uniq_hub_pickup_stops_appointment_loose).
 */
export const createOrUpdateLooseStop = async (req: Request, res: Response) => {
  try {
    const parsed = createLooseStopSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, hub_appointment_id, direction, status } = parsed.data;

    // Verificar que o agendamento pertence à clínica e é pickup_route
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from('hub_appointments')
      .select('id, pet_id, guardian_id')
      .eq('id', hub_appointment_id)
      .eq('clinic_id', clinic_id)
      .eq('appointment_kind', 'pickup_route')
      .is('deleted_at', null)
      .maybeSingle();
    if (apptErr) return res.status(500).json({ error: apptErr.message });
    if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado ou não é do tipo pickup_route.' });

    const a = appt as { id: string; pet_id: string | null; guardian_id: string | null };

    // Buscar endereço do tutor para snapshot
    let addressSnapshot: Record<string, unknown> | null = null;
    if (a.guardian_id) {
      const { data: gu } = await supabaseAdmin
        .from('hub_guardians')
        .select('id, street, street_number, district, city, state, postal_code')
        .eq('id', a.guardian_id)
        .maybeSingle();
      if (gu) addressSnapshot = gu as Record<string, unknown>;
    }

    // Verificar se já existe parada solta para este agendamento
    const { data: existing } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('id, status')
      .eq('hub_appointment_id', hub_appointment_id)
      .is('hub_pickup_route_id', null)
      .maybeSingle();

    let stop: Record<string, unknown>;
    let fromStatus: string | null = null;
    let statusChanged = false;
    if (existing) {
      const ex = existing as { id: string; status: string };
      // Validar transição
      let allowed = VALID_STOP_TRANSITIONS[ex.status] ?? [];
      if (ex.status === 'arrived') {
        allowed = direction === 'pickup' ? ['in_transit', 'failed'] : ['completed', 'failed'];
      }
      if (!allowed.includes(status) && status !== ex.status) {
        return res.status(422).json({ error: `Transição inválida: ${ex.status} → ${status}` });
      }
      const patch: Record<string, unknown> = { status };
      if (status === 'completed') patch.completed_at = new Date().toISOString();

      const { data: updated, error: updErr } = await supabaseAdmin
        .from('hub_pickup_stops')
        .update(patch)
        .eq('id', ex.id)
        .eq('clinic_id', clinic_id)
        .select('id, status, direction, sequence, planned_at, completed_at, failure_reason, notes, updated_at')
        .single();
      if (updErr) return res.status(500).json({ error: updErr.message });
      stop = updated as Record<string, unknown>;
      fromStatus = ex.status;
      statusChanged = status !== ex.status;
    } else {
      const { data: created, error: insErr } = await supabaseAdmin
        .from('hub_pickup_stops')
        .insert({
          clinic_id,
          hub_appointment_id,
          pet_id: a.pet_id,
          guardian_id: a.guardian_id,
          direction,
          status,
          sequence: 0,
          address_snapshot: addressSnapshot,
        })
        .select('id, status, direction, sequence, planned_at, completed_at, failure_reason, notes, updated_at')
        .single();
      if (insErr) return res.status(500).json({ error: insErr.message });
      stop = created as Record<string, unknown>;
      fromStatus = null;
      statusChanged = status !== 'pending';
    }

    if (statusChanged) {
      const actorStaffId = await resolveActorStaffIdFromRequest(req, clinic_id);
      await recordStopStatusEvent({
        clinic_id,
        hub_pickup_stop_id: String(stop.id),
        hub_pickup_route_id: null,
        from_status: fromStatus,
        to_status: status,
        actor_staff_id: actorStaffId,
      });
    }

    // Sincronizar appointment
    let apptStatus: string | null = null;
    if (status === 'completed') apptStatus = 'done';
    else if (['en_route', 'arrived', 'in_transit'].includes(status)) apptStatus = 'in_progress';
    else if (status === 'pending') apptStatus = 'confirmed';

    if (apptStatus) {
      await supabaseAdmin
        .from('hub_appointments')
        .update({ status: apptStatus })
        .eq('id', hub_appointment_id)
        .eq('clinic_id', clinic_id);
    }
    if (status === 'completed') {
      void syncOpenComandasAfterAppointmentOperationalComplete(clinic_id, hub_appointment_id);
    }

    return res.status(existing ? 200 : 201).json({ stop });
  } catch (e) {
    console.error('[hubPickupController] createOrUpdateLooseStop', e);
    return res.status(500).json({ error: 'Erro ao criar/atualizar parada solta.' });
  }
};

// ─── Helpers: enriquecer paradas de uma rota ──────────────────────────────

async function loadEnrichedStopsForRoute(routeId: string) {
  const { data: stops, error: stopsErr } = await supabaseAdmin
    .from('hub_pickup_stops')
    .select(
      'id, hub_appointment_id, pet_id, guardian_id, direction, address_snapshot, sequence, cage_id, status, planned_at, completed_at, failure_reason, notes, updated_at',
    )
    .eq('hub_pickup_route_id', routeId)
    .order('sequence', { ascending: true });
  if (stopsErr) throw new Error(stopsErr.message);

  const stopRows = (stops ?? []) as Array<{
    id: string;
    hub_appointment_id: string | null;
    pet_id: string | null;
    guardian_id: string | null;
    direction: string;
    address_snapshot: Record<string, unknown> | null;
    sequence: number;
    cage_id?: string | null;
    status: string;
    planned_at: string | null;
    completed_at: string | null;
    failure_reason: string | null;
    notes: string | null;
    updated_at?: string;
  }>;

  const petIds = [...new Set(stopRows.map((s) => s.pet_id).filter(Boolean) as string[])];
  const guardianIds = [...new Set(stopRows.map((s) => s.guardian_id).filter(Boolean) as string[])];

  const [petsRes, guardiansRes] = await Promise.all([
    petIds.length
      ? supabaseAdmin.from('hub_pets').select('id, name, species, breed').in('id', petIds)
      : Promise.resolve({ data: [] }),
    guardianIds.length
      ? supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', guardianIds)
      : Promise.resolve({ data: [] }),
  ]);

  const petMap = new Map(
    ((petsRes.data ?? []) as Array<{ id: string } & Record<string, unknown>>).map((p) => [p.id, p]),
  );
  const guMap = new Map(
    ((guardiansRes.data ?? []) as Array<{ id: string } & Record<string, unknown>>).map((g) => [g.id, g]),
  );

  return stopRows.map((s) => ({
    ...s,
    pet: s.pet_id ? petMap.get(s.pet_id) ?? null : null,
    guardian: s.guardian_id ? guMap.get(s.guardian_id) ?? null : null,
  }));
}

async function insertClinicReturnStop(opts: {
  clinic_id: string;
  route_id: string;
  unit_id?: string | null;
  sequence: number;
}): Promise<void> {
  const resolved = await resolveClinicOrUnitAddress(opts.clinic_id, opts.unit_id);
  const { data: routeCoords } = await supabaseAdmin
    .from('hub_pickup_routes')
    .select('start_lat, start_lng, start_address')
    .eq('id', opts.route_id)
    .eq('clinic_id', opts.clinic_id)
    .maybeSingle();
  const rc = (routeCoords ?? {}) as {
    start_lat?: number | null;
    start_lng?: number | null;
    start_address?: string | null;
  };
  const lat =
    typeof rc.start_lat === 'number' && Number.isFinite(rc.start_lat) ? rc.start_lat : null;
  const lng =
    typeof rc.start_lng === 'number' && Number.isFinite(rc.start_lng) ? rc.start_lng : null;

  const addressSnapshot: Record<string, unknown> = {
    label: resolved.label,
    address: resolved.address ?? rc.start_address ?? null,
    address_street: resolved.address ?? rc.start_address ?? null,
    address_city: null,
    address_neighborhood: null,
  };
  if (lat != null && lng != null) {
    addressSnapshot.lat = lat;
    addressSnapshot.lng = lng;
  }

  await supabaseAdmin.from('hub_pickup_stops').insert({
    clinic_id: opts.clinic_id,
    hub_pickup_route_id: opts.route_id,
    hub_appointment_id: null,
    pet_id: null,
    guardian_id: null,
    direction: 'clinic_return',
    address_snapshot: addressSnapshot,
    sequence: opts.sequence,
    status: 'pending',
  });
}

// ─── GET /api/hub/pickup/my-route ─────────────────────────────────────────

const myRouteQuerySchema = z.object({
  clinic_id: uuidStr,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Retorna a rota ativa do dia atribuída ao motorista autenticado.
 * Prioridade: in_progress → primeira planned (sort_order) → última done.
 */
export const getMyPickupRoute = async (req: Request, res: Response) => {
  try {
    const parsed = myRouteQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, date } = parsed.data;
    const dateYmd = date ?? new Date().toLocaleDateString('fr-CA');

    const userId = (req as Request & { user?: { id: string } }).user?.id;
    if (!userId) return res.status(401).json({ error: 'Não autenticado.' });

    const staffId = await resolveDriverStaffIdForUser(clinic_id, userId);
    if (!staffId) return res.json({ route: null });

    const { data: routes, error: routeErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .select(ROUTE_SELECT)
      .eq('clinic_id', clinic_id)
      .eq('route_date', dateYmd)
      .eq('driver_staff_id', staffId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (routeErr) return res.status(500).json({ error: routeErr.message });

    const active = pickActiveRoute((routes ?? []) as RouteRow[]);
    if (!active) return res.json({ route: null });

    const enrichedStops = await loadEnrichedStopsForRoute(active.id);
    return res.json({ route: active, stops: enrichedStops });
  } catch (e) {
    console.error('[hubPickupController] getMyPickupRoute', e);
    return res.status(500).json({ error: 'Erro ao buscar minha rota.' });
  }
};

/**
 * Retorna todas as rotas do dia do motorista autenticado (fila do dia).
 */
export const getMyPickupRoutes = async (req: Request, res: Response) => {
  try {
    const parsed = myRouteQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, date } = parsed.data;
    const dateYmd = date ?? new Date().toLocaleDateString('fr-CA');

    const userId = (req as Request & { user?: { id: string } }).user?.id;
    if (!userId) return res.status(401).json({ error: 'Não autenticado.' });

    const staffId = await resolveDriverStaffIdForUser(clinic_id, userId);
    if (!staffId) return res.json({ routes: [], active_route_id: null });

    const { data: routes, error: routeErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .select(ROUTE_SELECT)
      .eq('clinic_id', clinic_id)
      .eq('route_date', dateYmd)
      .eq('driver_staff_id', staffId)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (routeErr) return res.status(500).json({ error: routeErr.message });

    const routeRows = (routes ?? []) as RouteRow[];
    const active = pickActiveRoute(routeRows);

    const withCounts = await Promise.all(
      routeRows.map(async (r) => {
        const { count } = await supabaseAdmin
          .from('hub_pickup_stops')
          .select('id', { count: 'exact', head: true })
          .eq('hub_pickup_route_id', r.id);
        return { ...r, stops_count: count ?? 0 };
      }),
    );

    return res.json({
      routes: withCounts,
      active_route_id: active?.id ?? null,
    });
  } catch (e) {
    console.error('[hubPickupController] getMyPickupRoutes', e);
    return res.status(500).json({ error: 'Erro ao buscar minhas rotas.' });
  }
};

// ─── POST /api/hub/pickup/routes/:id/split ────────────────────────────────

const splitRouteSchema = z
  .object({
    clinic_id: uuidStr,
    after_sequence: z.number().int().min(0),
    label: z.string().trim().max(80).optional().nullable(),
    insert_clinic_return: z.boolean().optional().default(true),
  })
  .strict();

/**
 * Divide a rota em duas: paradas com sequence > after_sequence vão para a nova rota.
 * Opcionalmente insere parada clinic_return no fim da rota original.
 */
export const splitHubPickupRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de rota inválido' });

    const parsed = splitRouteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, after_sequence, label, insert_clinic_return } = parsed.data;

    const { data: route, error: routeErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .select(ROUTE_SELECT)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (routeErr) return res.status(500).json({ error: routeErr.message });
    if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

    const routeRow = route as RouteRow;
    if (routeRow.status === 'cancelled' || routeRow.status === 'done') {
      return res.status(422).json({ error: 'Não é possível dividir uma rota concluída ou cancelada.' });
    }

    const { data: allStops, error: stopsErr } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('id, sequence, direction, status')
      .eq('hub_pickup_route_id', id)
      .order('sequence', { ascending: true });
    if (stopsErr) return res.status(500).json({ error: stopsErr.message });

    const stops = (allStops ?? []) as Array<{
      id: string;
      sequence: number;
      direction: string;
      status: string;
    }>;
    const toMove = stops.filter((s) => s.sequence > after_sequence);
    if (toMove.length === 0) {
      return res.status(422).json({ error: 'Não há paradas após o ponto de divisão.' });
    }

    const nextSort = (routeRow.sort_order ?? 0) + 1;
    const { data: createdRoute, error: createErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .insert({
        clinic_id,
        unit_id: routeRow.unit_id ?? null,
        route_date: routeRow.route_date,
        driver_staff_id: routeRow.driver_staff_id ?? null,
        vehicle_id: routeRow.vehicle_id ?? null,
        vehicle_label: routeRow.vehicle_label ?? null,
        status: 'planned',
        label: label?.trim() || 'Lote 2',
        sort_order: nextSort,
        start_kind: routeRow.start_kind ?? 'clinic',
        start_address: routeRow.start_address ?? null,
        start_lat: routeRow.start_lat ?? null,
        start_lng: routeRow.start_lng ?? null,
      })
      .select(ROUTE_SELECT)
      .single();
    if (createErr) return res.status(500).json({ error: createErr.message });

    const newRouteId = (createdRoute as { id: string }).id;

    for (let i = 0; i < toMove.length; i++) {
      const { error: moveErr } = await supabaseAdmin
        .from('hub_pickup_stops')
        .update({ hub_pickup_route_id: newRouteId, sequence: i })
        .eq('id', toMove[i].id);
      if (moveErr) return res.status(500).json({ error: moveErr.message });
    }

    if (insert_clinic_return) {
      const remaining = stops.filter((s) => s.sequence <= after_sequence);
      const maxSeq = remaining.reduce((m, s) => Math.max(m, s.sequence), -1);
      await insertClinicReturnStop({
        clinic_id,
        route_id: id,
        unit_id: routeRow.unit_id,
        sequence: maxSeq + 1,
      });
    }

    // Empurrar sort_order das outras rotas do mesmo motorista/dia que ficaram no mesmo slot
    if (routeRow.driver_staff_id && routeRow.route_date) {
      const { data: siblings } = await supabaseAdmin
        .from('hub_pickup_routes')
        .select('id, sort_order')
        .eq('clinic_id', clinic_id)
        .eq('driver_staff_id', routeRow.driver_staff_id)
        .eq('route_date', routeRow.route_date)
        .neq('id', id)
        .neq('id', newRouteId)
        .is('deleted_at', null)
        .gte('sort_order', nextSort);
      for (const sib of (siblings ?? []) as Array<{ id: string; sort_order: number }>) {
        await supabaseAdmin
          .from('hub_pickup_routes')
          .update({ sort_order: (sib.sort_order ?? 0) + 1 })
          .eq('id', sib.id);
      }
    }

    return res.status(201).json({
      route_a: route,
      route_b: createdRoute,
    });
  } catch (e) {
    console.error('[hubPickupController] splitHubPickupRoute', e);
    return res.status(500).json({ error: 'Erro ao dividir rota.' });
  }
};

// ─── POST /api/hub/pickup/routes/:id/clinic-return ────────────────────────

const clinicReturnSchema = z
  .object({
    clinic_id: uuidStr,
    sequence: z.number().int().min(0).optional(),
  })
  .strict();

export const addClinicReturnStop = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de rota inválido' });

    const parsed = clinicReturnSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, sequence } = parsed.data;

    const { data: route, error: routeErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .select('id, unit_id, status')
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (routeErr) return res.status(500).json({ error: routeErr.message });
    if (!route) return res.status(404).json({ error: 'Rota não encontrada' });
    if ((route as { status: string }).status === 'cancelled') {
      return res.status(422).json({ error: 'Rota cancelada.' });
    }

    let seq = sequence;
    if (seq == null) {
      const { data: maxRow } = await supabaseAdmin
        .from('hub_pickup_stops')
        .select('sequence')
        .eq('hub_pickup_route_id', id)
        .order('sequence', { ascending: false })
        .limit(1)
        .maybeSingle();
      seq = ((maxRow as { sequence?: number } | null)?.sequence ?? -1) + 1;
    }

    await insertClinicReturnStop({
      clinic_id,
      route_id: id,
      unit_id: (route as { unit_id?: string | null }).unit_id,
      sequence: seq,
    });

    const enriched = await loadEnrichedStopsForRoute(id);
    return res.status(201).json({ stops: enriched });
  } catch (e) {
    console.error('[hubPickupController] addClinicReturnStop', e);
    return res.status(500).json({ error: 'Erro ao adicionar retorno à clínica.' });
  }
};

// ─── GET /api/hub/pickup/driver-day ───────────────────────────────────────

const driverDayQuerySchema = z.object({
  clinic_id: uuidStr,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit_id: uuidStr.optional(),
});

/**
 * Timeline do dia agrupada por motorista (visão gerencial).
 */
export const getHubPickupDriverDay = async (req: Request, res: Response) => {
  try {
    const parsed = driverDayQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, date, unit_id } = parsed.data;

    let q = supabaseAdmin
      .from('hub_pickup_routes')
      .select(ROUTE_SELECT)
      .eq('clinic_id', clinic_id)
      .eq('route_date', date)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (unit_id) q = q.eq('unit_id', unit_id);

    const { data: routes, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const routeRows = (routes ?? []) as RouteRow[];
    const driverIds = [
      ...new Set(routeRows.map((r) => r.driver_staff_id).filter(Boolean) as string[]),
    ];
    const routeIds = routeRows.map((r) => r.id);

    const [driversRes, stopsRes] = await Promise.all([
      driverIds.length
        ? supabaseAdmin.from('hub_staff_members').select('id, full_name').in('id', driverIds)
        : Promise.resolve({ data: [] }),
      routeIds.length
        ? supabaseAdmin
            .from('hub_pickup_stops')
            .select('id, hub_pickup_route_id, direction, status, sequence')
            .in('hub_pickup_route_id', routeIds)
            .order('sequence', { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    const driverMap = new Map(
      ((driversRes.data ?? []) as Array<{ id: string; full_name: string }>).map((d) => [d.id, d]),
    );
    const stopsByRoute = new Map<string, Array<{ direction: string; status: string; sequence: number }>>();
    for (const s of (stopsRes.data ?? []) as Array<{
      hub_pickup_route_id: string;
      direction: string;
      status: string;
      sequence: number;
    }>) {
      const list = stopsByRoute.get(s.hub_pickup_route_id) ?? [];
      list.push(s);
      stopsByRoute.set(s.hub_pickup_route_id, list);
    }

    type DriverBucket = {
      driver: { id: string; full_name: string } | null;
      routes: Array<RouteRow & { stops_count: number; onboard_count: number }>;
    };

    const byDriver = new Map<string, DriverBucket>();
    const unassigned: DriverBucket = { driver: null, routes: [] };

    for (const r of routeRows) {
      const stops = stopsByRoute.get(r.id) ?? [];
      const enriched = {
        ...r,
        stops_count: stops.length,
        onboard_count: stops.filter((s) => s.direction === 'pickup' && s.status === 'in_transit')
          .length,
      };
      if (!r.driver_staff_id) {
        unassigned.routes.push(enriched);
        continue;
      }
      let bucket = byDriver.get(r.driver_staff_id);
      if (!bucket) {
        bucket = {
          driver: driverMap.get(r.driver_staff_id) ?? {
            id: r.driver_staff_id,
            full_name: 'Motorista',
          },
          routes: [],
        };
        byDriver.set(r.driver_staff_id, bucket);
      }
      bucket.routes.push(enriched);
    }

    const drivers = [...byDriver.values()];
    if (unassigned.routes.length) drivers.push(unassigned);

    return res.json({ date, clinic_id, drivers });
  } catch (e) {
    console.error('[hubPickupController] getHubPickupDriverDay', e);
    return res.status(500).json({ error: 'Erro ao carregar dia dos motoristas.' });
  }
};

// ─── POST /api/hub/pickup/routes/suggest-batches ──────────────────────────

const suggestBatchesSchema = z
  .object({
    clinic_id: uuidStr,
    vehicle_id: uuidStr.optional().nullable(),
    capacity: z.number().int().min(1).optional(),
    stops: z
      .array(
        z.object({
          hub_appointment_id: uuidStr,
          direction: z.enum(['pickup', 'delivery']),
          starts_at: z.string().optional().nullable(),
          lat: z.number().finite().optional().nullable(),
          lng: z.number().finite().optional().nullable(),
        }),
      )
      .min(1),
  })
  .strict();

/**
 * Sugere partições de lotes (não persiste). Heurística: ordena por horário e
 * empacota coletas até a capacidade; entregas acompanham o lote atual.
 */
export const suggestHubPickupBatches = async (req: Request, res: Response) => {
  try {
    const parsed = suggestBatchesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, vehicle_id, capacity: capacityOverride, stops } = parsed.data;

    let capacity =
      capacityOverride ??
      (await resolveVehicleCapacity(clinic_id, vehicle_id ?? null)) ??
      Math.max(4, Math.ceil(stops.filter((s) => s.direction === 'pickup').length / 2));

    if (capacity < 1) capacity = 1;

    const ordered = [...stops].sort((a, b) => {
      const ta = a.starts_at ? Date.parse(a.starts_at) : 0;
      const tb = b.starts_at ? Date.parse(b.starts_at) : 0;
      if (ta !== tb) return ta - tb;
      return a.hub_appointment_id.localeCompare(b.hub_appointment_id);
    });

    type Batch = { label: string; stop_ids: string[]; pickup_count: number };
    const batches: Batch[] = [];
    let current: Batch = { label: 'Lote 1', stop_ids: [], pickup_count: 0 };

    for (const stop of ordered) {
      if (stop.direction === 'pickup' && current.pickup_count >= capacity && current.stop_ids.length > 0) {
        batches.push(current);
        current = {
          label: `Lote ${batches.length + 1}`,
          stop_ids: [],
          pickup_count: 0,
        };
      }
      current.stop_ids.push(stop.hub_appointment_id);
      if (stop.direction === 'pickup') current.pickup_count += 1;
    }
    if (current.stop_ids.length > 0) batches.push(current);

    return res.json({
      capacity,
      batches: batches.map(({ label, stop_ids, pickup_count }) => ({
        label,
        stop_ids,
        pickup_count,
      })),
    });
  } catch (e) {
    console.error('[hubPickupController] suggestHubPickupBatches', e);
    return res.status(500).json({ error: 'Erro ao sugerir lotes.' });
  }
};
