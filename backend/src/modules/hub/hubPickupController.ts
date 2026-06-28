import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { fetchHubPetsMapByIds, resolvePrimaryPetIdsByGuardians } from './hubDayBoardPets';

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
const STOP_STATUSES = ['pending', 'en_route', 'arrived', 'completed', 'failed'] as const;

const VALID_ROUTE_TRANSITIONS: Record<string, string[]> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['done', 'planned'],
  done: [],
  cancelled: [],
};

const VALID_STOP_TRANSITIONS: Record<string, string[]> = {
  pending: ['en_route', 'failed'],
  en_route: ['arrived', 'failed'],
  arrived: ['completed', 'failed'],
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
        'id, clinic_id, unit_id, pet_id, guardian_id, hub_staff_member_id, hub_service_type_id, starts_at, ends_at, status, resource_label, notes, appointment_kind',
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

    // 2. Paradas já registradas em hub_pickup_stops (Fase 2+)
    const { data: stopsRaw } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('id, hub_appointment_id, hub_pickup_route_id, direction, sequence, status, planned_at, completed_at, failure_reason, notes')
      .in('hub_appointment_id', apptIds)
      .not('hub_pickup_route_id', 'is', null);

    type StopRow = {
      id: string;
      hub_appointment_id: string;
      hub_pickup_route_id: string;
      direction: string;
      sequence: number;
      status: string;
      planned_at: string | null;
      completed_at: string | null;
      failure_reason: string | null;
      notes: string | null;
    };

    const stopByApptId = new Map<string, StopRow>();
    for (const s of (stopsRaw ?? []) as StopRow[]) {
      stopByApptId.set(s.hub_appointment_id, s);
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
    vehicle_label: z.string().max(200).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .strict();

export const createHubPickupRoute = async (req: Request, res: Response) => {
  try {
    const parsed = createRouteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, ...rest } = parsed.data;

    const { data: created, error: insErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .insert({ clinic_id, ...rest, status: 'planned' })
      .select('id, clinic_id, unit_id, route_date, driver_staff_id, vehicle_label, status, notes, created_at')
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
      .select(
        'id, clinic_id, unit_id, route_date, driver_staff_id, vehicle_label, status, notes, created_at, updated_at',
      )
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .order('route_date', { ascending: true });

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
      .select('id, status')
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (routeErr) return res.status(500).json({ error: routeErr.message });
    if (!route) return res.status(404).json({ error: 'Rota não encontrada' });
    if ((route as { status: string }).status === 'cancelled') {
      return res.status(422).json({ error: 'Não é possível adicionar paradas a uma rota cancelada.' });
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

    // Verificar unicidade: nenhum desses appointments já tem stop em outra rota ativa
    const { data: existing } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('hub_appointment_id, hub_pickup_route_id')
      .in('hub_appointment_id', apptIds)
      .not('hub_pickup_route_id', 'is', null);

    const alreadyInRoute = (existing ?? []) as Array<{
      hub_appointment_id: string;
      hub_pickup_route_id: string;
    }>;
    const conflicts = alreadyInRoute.filter((s) => s.hub_pickup_route_id !== id);
    if (conflicts.length) {
      return res.status(409).json({
        error: 'Uma ou mais pernas já estão em outra rota ativa.',
        conflicts: conflicts.map((c) => c.hub_appointment_id),
      });
    }

    // Buscar snapshot de endereço dos tutores
    const guardianIds = [
      ...new Set(
        ((appts ?? []) as Array<{ guardian_id: string | null }>)
          .map((a) => a.guardian_id)
          .filter(Boolean) as string[],
      ),
    ];
    const { data: guardians } = await supabaseAdmin
      .from('hub_guardians')
      .select('id, street, street_number, district, city, state, postal_code')
      .in('id', guardianIds);
    const guardianMap = new Map(
      ((guardians ?? []) as Array<{ id: string } & Record<string, unknown>>).map((g) => [g.id, g]),
    );

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
      status: string;
    };

    const inserts: StopInsert[] = [];
    for (let idx = 0; idx < stops.length; idx++) {
      const s = stops[idx];
      const appt = apptMap.get(s.hub_appointment_id)!;
      const gu = (appt.guardian_id ? guardianMap.get(appt.guardian_id) : null) as Record<string, unknown> | undefined;

      let addressSnapshot: Record<string, unknown> | null = gu ?? null;

      // Geocodificar se o tutor tem endereço
      if (gu) {
        const addrStr = [gu.street, gu.district, gu.city, gu.state, 'Brasil']
          .filter(Boolean)
          .join(', ');
        if (addrStr.length > 10) {
          const coords = await geocodeAddress(addrStr);
          if (coords) {
            addressSnapshot = { ...gu, lat: coords.lat, lng: coords.lng };
          }
          // Respeita limite de 1 req/s do Nominatim entre paradas
          if (idx < stops.length - 1) {
            await new Promise<void>((r) => setTimeout(r, 1100));
          }
        }
      }

      inserts.push({
        clinic_id,
        hub_pickup_route_id: id,
        hub_appointment_id: s.hub_appointment_id,
        pet_id: appt.pet_id ?? null,
        guardian_id: appt.guardian_id ?? null,
        direction: s.direction,
        address_snapshot: addressSnapshot,
        sequence: s.sequence ?? idx,
        planned_at: s.planned_at ?? null,
        status: 'pending',
      });
    }

    const { data: created, error: insErr } = await supabaseAdmin
      .from('hub_pickup_stops')
      .upsert(inserts, { onConflict: 'hub_appointment_id', ignoreDuplicates: false })
      .select('id, hub_appointment_id, direction, sequence, status, planned_at');
    if (insErr) return res.status(500).json({ error: insErr.message });

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
    vehicle_label: z.string().max(200).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    stop_sequence: z.array(uuidStr).optional(),
  })
  .strict();

export const patchHubPickupRoute = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de rota inválido' });

    const parsed = patchRouteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, status: newStatus, stop_sequence, ...rest } = parsed.data;

    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .select('id, status')
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

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('hub_pickup_routes')
      .update(patch)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .select('id, clinic_id, unit_id, route_date, driver_staff_id, vehicle_label, status, notes, updated_at')
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
      .select('id, clinic_id, unit_id, route_date, driver_staff_id, vehicle_label, status, notes, created_at, updated_at')
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (routeErr) return res.status(500).json({ error: routeErr.message });
    if (!route) return res.status(404).json({ error: 'Rota não encontrada' });

    const { data: stopsRaw, error: stopsErr } = await supabaseAdmin
      .from('hub_pickup_stops')
      .select('id, hub_appointment_id, pet_id, guardian_id, direction, address_snapshot, sequence, status, planned_at, completed_at, failure_reason, notes')
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
    }>;

    // Enriquecer com pet e tutor
    const petIdSet = new Set(stops.map((s) => s.pet_id).filter(Boolean) as string[]);
    const guIds = [...new Set(stops.map((s) => s.guardian_id).filter(Boolean) as string[])];

    const guardiansMissingPet = stops
      .filter((s) => !s.pet_id && s.guardian_id)
      .map((s) => s.guardian_id as string);
    const petByGuardian = await resolvePrimaryPetIdsByGuardians(clinic_id, guardiansMissingPet);
    for (const pid of petByGuardian.values()) petIdSet.add(pid);

    const [gusRes, petMap] = await Promise.all([
      guIds.length
        ? supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', guIds)
        : Promise.resolve({ data: [] }),
      fetchHubPetsMapByIds(petIdSet),
    ]);
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

    return res.json({ route: { ...route, driver }, stops: enrichedStops });
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
      .select('id, status, hub_appointment_id, hub_pickup_route_id')
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!current) return res.status(404).json({ error: 'Parada não encontrada' });

    const cur = current as { status: string; hub_appointment_id: string | null; hub_pickup_route_id: string | null };

    if (newStatus) {
      const allowed = VALID_STOP_TRANSITIONS[cur.status] ?? [];
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
      .select('id, status, completed_at, failure_reason, notes, sequence, direction, planned_at')
      .single();
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Sincronizar hub_appointments quando parada concluída
    if (newStatus === 'completed' && cur.hub_appointment_id) {
      await supabaseAdmin
        .from('hub_appointments')
        .update({ status: 'done' })
        .eq('id', cur.hub_appointment_id)
        .eq('clinic_id', clinic_id);
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
