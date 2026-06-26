import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const uuidStr = z.string().uuid();

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
 * Deriva o sentido da parada (coleta vs entrega) por heurística de ordem temporal.
 *
 * Regra: para cada pet, ordena as pernas pickup_route do dia por `starts_at`.
 * - Se houver 2 pernas para o mesmo pet: a mais cedo = pickup, a mais tarde = delivery.
 * - Se houver apenas 1: compara com o agendamento padrão do pet no mesmo dia.
 *   - Se a perna termina antes do horário mediano dos agendamentos padrão → pickup.
 *   - Caso contrário → delivery.
 * - Se não houver referência → 'unknown'.
 *
 * Essa lógica é suficiente para o MVP (Fase 1) e será substituída pelo campo
 * `direction` em `hub_pickup_stops` na Fase 2.
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

    // Leg única: compara com agendamentos padrão do pet
    const leg = legs[0];
    const stdTimes = standardByPet.get(pid) ?? [];
    if (stdTimes.length > 0) {
      stdTimes.sort();
      const firstStd = stdTimes[0];
      result.set(leg.id, leg.starts_at < firstStd ? 'pickup' : 'delivery');
    } else {
      result.set(leg.id, 'unknown');
    }
  }

  return result;
}

/** GET /api/hub/pickup/day-board */
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

    // 2. Agendamentos padrão do mesmo dia (para inferir sentido de pernas únicas)
    const petIds = [...new Set(pickupAppts.map((a) => a.pet_id).filter(Boolean) as string[])];

    const standardAppts: Array<{ pet_id: string | null; starts_at: string }> = [];
    if (petIds.length > 0) {
      let stdQ = supabaseAdmin
        .from('hub_appointments')
        .select('pet_id, starts_at')
        .eq('clinic_id', clinic_id)
        .eq('appointment_kind', 'standard')
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .in('pet_id', petIds)
        .lt('starts_at', to)
        .gt('ends_at', from);
      if (unit_id) stdQ = stdQ.eq('unit_id', unit_id);
      const { data: stdData } = await stdQ;
      standardAppts.push(...((stdData ?? []) as Array<{ pet_id: string | null; starts_at: string }>));
    }

    // 3. Derivar direção
    const directionMap = deriveDirections(pickupAppts, standardAppts);

    // 4. Enriquecer com pet, tutor e tipo de serviço
    const guIds = [...new Set(pickupAppts.map((a) => a.guardian_id).filter(Boolean) as string[])];
    const stIds = [...new Set(pickupAppts.map((a) => a.hub_service_type_id).filter(Boolean) as string[])];

    const [petsRes, gusRes, stsRes] = await Promise.all([
      petIds.length
        ? supabaseAdmin
            .from('hub_pets')
            .select('id, name, species, breed, size_tier, birth_date, avatar_url')
            .in('id', petIds)
        : Promise.resolve({ data: [] }),
      guIds.length
        ? supabaseAdmin
            .from('hub_guardians')
            .select('id, full_name, phone, address_street, address_neighborhood, address_city, address_state')
            .in('id', guIds)
        : Promise.resolve({ data: [] }),
      stIds.length
        ? supabaseAdmin
            .from('hub_service_types')
            .select('id, name, service_group')
            .in('id', stIds)
        : Promise.resolve({ data: [] }),
    ]);

    const petMap = new Map(
      ((petsRes.data ?? []) as Array<{ id: string } & Record<string, unknown>>).map((p) => [p.id, p]),
    );
    const guMap = new Map(
      ((gusRes.data ?? []) as Array<{ id: string } & Record<string, unknown>>).map((g) => [g.id, g]),
    );
    const stMap = new Map(
      ((stsRes.data ?? []) as Array<{ id: string } & Record<string, unknown>>).map((s) => [s.id, s]),
    );

    // 5. Montar itens e filtrar por direção
    const items = pickupAppts
      .map((a) => {
        const itemDirection = directionMap.get(a.id) ?? 'unknown';
        const pet = a.pet_id ? petMap.get(a.pet_id) ?? null : null;
        const guardian = a.guardian_id ? guMap.get(a.guardian_id) ?? null : null;
        const serviceType = a.hub_service_type_id ? stMap.get(a.hub_service_type_id) ?? null : null;

        const gu = guardian as {
          id: string;
          full_name: string;
          phone?: string | null;
          address_street?: string | null;
          address_neighborhood?: string | null;
          address_city?: string | null;
          address_state?: string | null;
        } | null;

        const address = gu
          ? [gu.address_street, gu.address_neighborhood, gu.address_city, gu.address_state]
              .filter(Boolean)
              .join(', ') || null
          : null;

        return {
          appointment_id: a.id,
          appointment_kind: 'pickup_route' as const,
          direction: itemDirection,
          starts_at: a.starts_at,
          ends_at: a.ends_at,
          status: a.status,
          notes: a.notes,
          resource_label: a.resource_label,
          service_type: serviceType
            ? { id: (serviceType as { id: string; name: string; service_group: string }).id, name: (serviceType as { id: string; name: string; service_group: string }).name, service_group: (serviceType as { id: string; name: string; service_group: string }).service_group }
            : null,
          pet: pet ?? null,
          guardian: gu
            ? { id: gu.id, full_name: gu.full_name, phone: gu.phone ?? null }
            : null,
          address,
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
