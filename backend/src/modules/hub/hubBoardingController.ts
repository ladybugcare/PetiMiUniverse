import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { buildGroomingDisplayTags } from './groomingPetTags';

const uuidStr = z.string().uuid();
const BOARDING_SERVICE_GROUPS = ['hotel', 'creche'] as const;
const BOARDING_APPOINTMENT_KINDS = ['hotel_stay', 'daycare_block'];
const BOARDING_MODES = ['hotel', 'daycare', 'all'] as const;
const BOARDING_STATUSES = ['reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show'] as const;

const RESERVATION_SELECT = `
  id, clinic_id, unit_id, pet_id, guardian_id, hub_appointment_id,
  mode, status, expected_check_in, expected_check_out,
  checked_in_at, checked_out_at, daily_rate_cents, notes,
  created_at, updated_at
`;

// ─── helpers ───────────────────────────────────────────────────────────────

const dayBoardQuerySchema = z
  .object({
    clinic_id: uuidStr,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    unit_id: uuidStr.optional(),
    mode: z.enum(BOARDING_MODES).optional(),
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

async function getBoardingServiceTypeIds(clinicId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_types')
    .select('id')
    .eq('clinic_id', clinicId)
    .in('service_group', BOARDING_SERVICE_GROUPS)
    .is('deleted_at', null);
  if (error) throw error;
  return (data ?? []).map((r: { id: string }) => r.id);
}

function appointmentMatchesBoardingTypes(
  appt: Record<string, unknown>,
  boardingTypeIds: Set<string>,
  lineTypeIdsByAppt: Map<string, string[]>,
): boolean {
  const kind = appt.appointment_kind as string | null;
  if (kind && BOARDING_APPOINTMENT_KINDS.includes(kind)) return true;
  const primary = appt.hub_service_type_id as string | null;
  if (primary && boardingTypeIds.has(primary)) return true;
  const lines = lineTypeIdsByAppt.get(appt.id as string) ?? [];
  return lines.some((id) => boardingTypeIds.has(id));
}

function modeFromAppointmentKind(kind: string | null): 'hotel' | 'daycare' {
  return kind === 'daycare_block' ? 'daycare' : 'hotel';
}

function stageFromAppointmentStatus(status: string | null): string {
  switch (status) {
    case 'in_progress':
      return 'checked_in';
    case 'done':
    case 'paid':
      return 'checked_out';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'reserved';
  }
}

/** Número de noites entre check-in e check-out (ou agora). */
function calcNights(checkedInAt: string | null, checkedOutAt: string | null): number {
  if (!checkedInAt) return 0;
  const inMs = new Date(checkedInAt).getTime();
  const outMs = checkedOutAt ? new Date(checkedOutAt).getTime() : Date.now();
  if (isNaN(inMs) || isNaN(outMs)) return 0;
  const nights = Math.floor((outMs - inMs) / (1000 * 60 * 60 * 24));
  return Math.max(0, nights);
}

// ─── GET /boarding/day-board ───────────────────────────────────────────────

export const getHubBoardingDayBoard = async (req: Request, res: Response) => {
  try {
    const parsed = dayBoardQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, unit_id, mode } = parsed.data;
    const { from, to, dateYmd } = resolveDayBoardRange(parsed.data);

    const boardingTypeIds = await getBoardingServiceTypeIds(clinic_id);
    const boardingTypeSet = new Set(boardingTypeIds);

    // Agendamentos do dia com overlap temporal
    let apptQ = supabaseAdmin
      .from('hub_appointments')
      .select(
        'id, clinic_id, unit_id, pet_id, guardian_id, starts_at, ends_at, status, title, hub_service_type_id, appointment_kind, notes',
      )
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .lt('starts_at', to)
      .gt('ends_at', from)
      .order('starts_at', { ascending: true });

    if (unit_id) apptQ = apptQ.eq('unit_id', unit_id);

    const { data: appointmentsRaw, error: apptErr } = await apptQ;
    if (apptErr) return res.status(500).json({ error: apptErr.message });

    const apptRowsRaw = (appointmentsRaw ?? []) as Record<string, unknown>[];
    const apptIdsAll = apptRowsRaw.map((a) => a.id as string);

    // Linhas de serviço (multi-serviço)
    const lineTypeIdsByAppt = new Map<string, string[]>();
    if (apptIdsAll.length > 0) {
      const { data: lineRows, error: lineErr } = await supabaseAdmin
        .from('hub_appointment_services')
        .select('appointment_id, hub_service_type_id')
        .in('appointment_id', apptIdsAll);
      if (lineErr) return res.status(500).json({ error: lineErr.message });
      for (const row of lineRows ?? []) {
        const aid = (row as { appointment_id: string }).appointment_id;
        const stid = (row as { hub_service_type_id: string }).hub_service_type_id;
        const list = lineTypeIdsByAppt.get(aid) ?? [];
        list.push(stid);
        lineTypeIdsByAppt.set(aid, list);
      }
    }

    // Filtrar somente agendamentos de boarding (por kind OU por service_group)
    const boardingAppts = apptRowsRaw.filter((a) =>
      appointmentMatchesBoardingTypes(a, boardingTypeSet, lineTypeIdsByAppt),
    );

    const boardingApptIds = boardingAppts.map((a) => a.id as string);
    const boardingTypesConfigured = boardingTypeIds.length > 0 || boardingAppts.length > 0;

    // Reservas ativas (Fase 2: hub_boarding_reservations)
    const reservationByApptId = new Map<string, Record<string, unknown>>();
    const walkInReservations: Record<string, unknown>[] = [];
    let reservationsTableExists = true;

    {
      let rsvQ = supabaseAdmin
        .from('hub_boarding_reservations')
        .select(RESERVATION_SELECT)
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .not('status', 'in', '("cancelled","no_show")');

      if (unit_id) rsvQ = rsvQ.eq('unit_id', unit_id);

      const { data: rsvData, error: rsvErr } = await rsvQ;
      if (rsvErr) {
        if (rsvErr.message?.includes('hub_boarding_reservations')) {
          reservationsTableExists = false;
        } else {
          return res.status(500).json({ error: rsvErr.message });
        }
      } else {
        const allRsv = (rsvData ?? []) as Record<string, unknown>[];
        for (const r of allRsv) {
          const aid = r.hub_appointment_id as string | null;
          if (aid) {
            reservationByApptId.set(aid, r);
          } else {
            // walk-in: reserva sem agendamento criada no dia ou check-in no dia
            const createdAt = r.created_at as string;
            const checkedInAt = r.checked_in_at as string | null;
            const inDay =
              (checkedInAt && checkedInAt >= from && checkedInAt <= to) ||
              (createdAt >= from && createdAt <= to);
            if (inDay) walkInReservations.push(r);
          }
        }
      }
    }

    // Pets, tutores
    const petIds = new Set<string>();
    const guIds = new Set<string>();
    for (const a of boardingAppts) {
      if (a.pet_id) petIds.add(a.pet_id as string);
      if (a.guardian_id) guIds.add(a.guardian_id as string);
    }
    for (const r of walkInReservations) {
      petIds.add(r.pet_id as string);
      if (r.guardian_id) guIds.add(r.guardian_id as string);
    }
    // Adicionar de reservas vinculadas a agendamentos
    for (const r of reservationByApptId.values()) {
      if (r.guardian_id) guIds.add(r.guardian_id as string);
    }

    const [petsRes, gusRes] = await Promise.all([
      petIds.size
        ? supabaseAdmin
            .from('hub_pets')
            .select('id, name, species, breed, size_tier, birth_date, notes, avatar_url')
            .in('id', [...petIds])
        : Promise.resolve({ data: [] }),
      guIds.size
        ? supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', [...guIds])
        : Promise.resolve({ data: [] }),
    ]);

    const petMap = new Map((petsRes.data ?? []).map((p: { id: string }) => [p.id, p]));
    const guMap = new Map((gusRes.data ?? []).map((g: { id: string }) => [g.id, g]));

    // Flags clínicas
    const flagsByPet = new Map<string, Array<{ flag_key: string; label: string }>>();
    if (petIds.size) {
      const { data: fr, error: frErr } = await supabaseAdmin
        .from('hub_pet_clinical_flags')
        .select('pet_id, flag_key, label')
        .eq('clinic_id', clinic_id)
        .in('pet_id', [...petIds])
        .eq('active', true)
        .is('deleted_at', null);
      if (!frErr && fr) {
        for (const row of fr) {
          const pid = row.pet_id as string;
          const list = flagsByPet.get(pid) ?? [];
          list.push({ flag_key: String(row.flag_key), label: String(row.label || '') });
          flagsByPet.set(pid, list);
        }
      }
    }

    const tagsForPet = (pid: string | null | undefined) => {
      if (!pid) return [];
      const petRow = petMap.get(pid) as { notes?: string | null } | undefined;
      return buildGroomingDisplayTags(flagsByPet.get(pid) ?? [], petRow?.notes ?? null);
    };

    const nowMs = Date.now();
    const items: Record<string, unknown>[] = [];

    // Itens de agendamentos de boarding
    for (const a of boardingAppts) {
      const apptId = a.id as string;
      const reservation = reservationByApptId.get(apptId);
      const petId = a.pet_id as string | null;
      const apptMode = modeFromAppointmentKind(a.appointment_kind as string | null);
      const apptStatus = a.status as string;

      // Filtro de aba (hotel / daycare)
      if (mode && mode !== 'all' && apptMode !== mode) continue;

      const boardingStage = reservation
        ? (reservation.status as string)
        : stageFromAppointmentStatus(apptStatus);

      const startsAt = reservation
        ? (reservation.expected_check_in as string) ?? (a.starts_at as string)
        : (a.starts_at as string);
      const endsAt = reservation
        ? (reservation.expected_check_out as string) ?? (a.ends_at as string)
        : (a.ends_at as string);

      const checkedInAt = (reservation?.checked_in_at as string | null) ?? null;
      const checkedOutAt = (reservation?.checked_out_at as string | null) ?? null;
      const nightsCount =
        apptMode === 'hotel' ? calcNights(checkedInAt, checkedOutAt) : checkedInAt ? 1 : 0;

      const isLate =
        boardingStage === 'checked_in' &&
        checkedOutAt === null &&
        endsAt &&
        new Date(endsAt).getTime() < nowMs;

      const guardianId = (reservation?.guardian_id as string | null) ?? (a.guardian_id as string | null);

      items.push({
        kind: reservation ? 'reservation' : 'appointment_slot',
        reservation_id: reservation?.id ?? null,
        appointment_id: apptId,
        boarding_stage: boardingStage,
        mode: apptMode,
        appointment_status: apptStatus,
        appointment_kind: a.appointment_kind,
        title: a.title,
        notes: a.notes,
        is_late: Boolean(isLate),
        is_walk_in: false,
        starts_at: startsAt,
        ends_at: endsAt,
        daily_rate_cents: (reservation?.daily_rate_cents as number | null) ?? null,
        nights_count: nightsCount,
        pet: petId ? petMap.get(petId) : null,
        guardian: guardianId ? guMap.get(guardianId) : null,
        pet_id: petId,
        guardian_id: guardianId,
        clinical_tags: tagsForPet(petId),
        reservations_table_exists: reservationsTableExists,
      });
    }

    // Walk-ins (reservas sem agendamento)
    for (const r of walkInReservations) {
      const petId = r.pet_id as string;
      const rMode = r.mode as string;
      if (mode && mode !== 'all' && rMode !== mode) continue;

      const checkedInAt = (r.checked_in_at as string | null) ?? null;
      const checkedOutAt = (r.checked_out_at as string | null) ?? null;
      const nightsCount = rMode === 'hotel' ? calcNights(checkedInAt, checkedOutAt) : checkedInAt ? 1 : 0;

      items.push({
        kind: 'reservation',
        reservation_id: r.id,
        appointment_id: null,
        boarding_stage: r.status,
        mode: rMode,
        appointment_status: null,
        is_walk_in: true,
        is_late: false,
        starts_at: (r.expected_check_in as string) ?? (r.created_at as string),
        ends_at: (r.expected_check_out as string) ?? (r.created_at as string),
        daily_rate_cents: (r.daily_rate_cents as number | null) ?? null,
        nights_count: nightsCount,
        notes: r.notes,
        pet: petMap.get(petId) ?? null,
        guardian: r.guardian_id ? guMap.get(r.guardian_id as string) : null,
        pet_id: petId,
        guardian_id: r.guardian_id ?? null,
        clinical_tags: tagsForPet(petId),
      });
    }

    items.sort((a, b) => {
      const ta = new Date((a.starts_at as string) || 0).getTime();
      const tb = new Date((b.starts_at as string) || 0).getTime();
      return ta - tb;
    });

    return res.json({
      items,
      date: dateYmd,
      clinic_id,
      boarding_types_configured: boardingTypesConfigured,
    });
  } catch (e: unknown) {
    console.error('getHubBoardingDayBoard', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar painel de Hotel & Creche' });
  }
};

// ─── POST /boarding/reservations/open-from-appointment ────────────────────

const openFromApptSchema = z
  .object({
    clinic_id: uuidStr,
    hub_appointment_id: uuidStr,
  })
  .strict();

export const openHubBoardingReservationFromAppointment = async (req: Request, res: Response) => {
  try {
    const parsed = openFromApptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, hub_appointment_id } = parsed.data;

    // Idempotência: retorna reserva existente
    const { data: existing, error: exErr } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select(RESERVATION_SELECT)
      .eq('hub_appointment_id', hub_appointment_id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });
    if (existing) return res.json({ reservation: existing, created: false });

    // Busca agendamento para snapshot de dados
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from('hub_appointments')
      .select('pet_id, guardian_id, unit_id, starts_at, ends_at, appointment_kind')
      .eq('id', hub_appointment_id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (apptErr) return res.status(500).json({ error: apptErr.message });
    if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });
    if (!appt.pet_id) return res.status(422).json({ error: 'Agendamento sem pet associado' });

    const mode = (appt.appointment_kind as string) === 'daycare_block' ? 'daycare' : 'hotel';
    const now = new Date().toISOString();

    const { data: created, error: insErr } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .insert({
        clinic_id,
        unit_id: appt.unit_id ?? null,
        pet_id: appt.pet_id,
        guardian_id: appt.guardian_id ?? null,
        hub_appointment_id,
        mode,
        status: 'checked_in',
        expected_check_in: appt.starts_at,
        expected_check_out: appt.ends_at,
        checked_in_at: now,
      })
      .select(RESERVATION_SELECT)
      .single();
    if (insErr) return res.status(500).json({ error: insErr.message });

    // Sincroniza status do agendamento
    await supabaseAdmin
      .from('hub_appointments')
      .update({ status: 'in_progress' })
      .eq('id', hub_appointment_id)
      .eq('clinic_id', clinic_id);

    return res.status(201).json({ reservation: created, created: true });
  } catch (e: unknown) {
    console.error('openHubBoardingReservationFromAppointment', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao abrir reserva' });
  }
};

// ─── POST /boarding/reservations (walk-in) ────────────────────────────────

const createReservationSchema = z
  .object({
    clinic_id: uuidStr,
    pet_id: uuidStr,
    guardian_id: uuidStr.optional().nullable(),
    unit_id: uuidStr.optional().nullable(),
    mode: z.enum(['hotel', 'daycare']),
    expected_check_in: z.string().datetime({ offset: true }).optional().nullable(),
    expected_check_out: z.string().datetime({ offset: true }).optional().nullable(),
    daily_rate_cents: z.number().int().min(0).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .strict();

export const createHubBoardingReservation = async (req: Request, res: Response) => {
  try {
    const parsed = createReservationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, ...rest } = parsed.data;

    const { data: created, error: insErr } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .insert({ clinic_id, ...rest, status: 'checked_in', checked_in_at: new Date().toISOString() })
      .select(RESERVATION_SELECT)
      .single();
    if (insErr) return res.status(500).json({ error: insErr.message });

    return res.status(201).json({ reservation: created });
  } catch (e: unknown) {
    console.error('createHubBoardingReservation', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar reserva' });
  }
};

// ─── PATCH /boarding/reservations/:id ─────────────────────────────────────

const patchReservationSchema = z
  .object({
    clinic_id: uuidStr,
    status: z.enum(BOARDING_STATUSES).optional(),
    expected_check_in: z.string().datetime({ offset: true }).optional().nullable(),
    expected_check_out: z.string().datetime({ offset: true }).optional().nullable(),
    checked_in_at: z.string().datetime({ offset: true }).optional().nullable(),
    checked_out_at: z.string().datetime({ offset: true }).optional().nullable(),
    daily_rate_cents: z.number().int().min(0).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .strict();

/** Transições de status válidas. */
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  reserved: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['checked_out', 'reserved'],
  checked_out: ['checked_in'],
  cancelled: [],
  no_show: ['reserved'],
};

export const patchHubBoardingReservation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return res.status(400).json({ error: 'ID de reserva inválido' });
    }
    const parsed = patchReservationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, status: newStatus, ...rest } = parsed.data;

    // Busca reserva atual para validar transição
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select('id, status, hub_appointment_id')
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!current) return res.status(404).json({ error: 'Reserva não encontrada' });

    if (newStatus) {
      const currentStatus = (current as { status: string }).status;
      const allowed = VALID_STATUS_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(newStatus)) {
        return res.status(422).json({
          error: `Transição inválida: ${currentStatus} → ${newStatus}`,
        });
      }
    }

    const updatePayload: Record<string, unknown> = { ...rest };
    if (newStatus) updatePayload.status = newStatus;

    // Auto-preenche timestamps de transição
    if (newStatus === 'checked_in' && !rest.checked_in_at) {
      updatePayload.checked_in_at = new Date().toISOString();
    }
    if (newStatus === 'checked_out' && !rest.checked_out_at) {
      updatePayload.checked_out_at = new Date().toISOString();
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .update(updatePayload)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .select(RESERVATION_SELECT)
      .single();
    if (upErr) return res.status(500).json({ error: upErr.message });

    // Sincroniza status do agendamento vinculado
    const apptId = (current as { hub_appointment_id: string | null }).hub_appointment_id;
    if (apptId && newStatus) {
      const apptStatus =
        newStatus === 'checked_in'
          ? 'in_progress'
          : newStatus === 'checked_out'
          ? 'done'
          : newStatus === 'cancelled'
          ? 'cancelled'
          : undefined;
      if (apptStatus) {
        await supabaseAdmin
          .from('hub_appointments')
          .update({ status: apptStatus })
          .eq('id', apptId)
          .eq('clinic_id', clinic_id);
      }
    }

    return res.json({ reservation: updated });
  } catch (e: unknown) {
    console.error('patchHubBoardingReservation', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar reserva' });
  }
};

// ─── Configurações de capacidade por unidade ────────────────────────────────

const unitSettingsQuerySchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr.optional(),
});

const unitSettingsPatchSchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr,
  hotel_slots: z.number().int().positive().nullable().optional(),
  daycare_slots_per_shift: z.number().int().positive().nullable().optional(),
  checkout_cutoff_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .nullable()
    .optional(),
});

export const getHubBoardingUnitSettings = async (req: Request, res: Response) => {
  const parsed = unitSettingsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { clinic_id, unit_id } = parsed.data;

  try {
    let q = supabaseAdmin
      .from('hub_unit_boarding_settings')
      .select('unit_id, clinic_id, hotel_slots, daycare_slots_per_shift, checkout_cutoff_time, updated_at')
      .eq('clinic_id', clinic_id);
    if (unit_id) q = q.eq('unit_id', unit_id);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ settings: data ?? [] });
  } catch (e: unknown) {
    console.error('getHubBoardingUnitSettings', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao buscar configurações' });
  }
};

export const patchHubBoardingUnitSettings = async (req: Request, res: Response) => {
  const parsed = unitSettingsPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { clinic_id, unit_id, ...fields } = parsed.data;

  try {
    const { data, error } = await supabaseAdmin
      .from('hub_unit_boarding_settings')
      .upsert({ unit_id, clinic_id, ...fields }, { onConflict: 'unit_id' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ settings: data });
  } catch (e: unknown) {
    console.error('patchHubBoardingUnitSettings', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao salvar configurações' });
  }
};

// ─── Ocupação (sem bloqueio — só alerta) ────────────────────────────────────

const occupancyQuerySchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  mode: z.enum(BOARDING_MODES).optional(),
});

export const getHubBoardingOccupancy = async (req: Request, res: Response) => {
  const parsed = occupancyQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { clinic_id, unit_id, mode } = parsed.data;

  try {
    const dateYmd = parsed.data.date ?? parsed.data.from?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const { from, to } = parsed.data.from && parsed.data.to
      ? { from: parsed.data.from, to: parsed.data.to }
      : dayBoundsFromYmdSaoPaulo(dateYmd);

    // Reservas ativas no intervalo (overlap)
    let rQ = supabaseAdmin
      .from('hub_boarding_reservations')
      .select('id, mode', { count: 'exact', head: false })
      .eq('clinic_id', clinic_id)
      .in('status', ['reserved', 'checked_in'])
      .lt('expected_check_in', to)
      .gt('expected_check_out', from);
    if (unit_id) rQ = rQ.eq('unit_id', unit_id);
    if (mode && mode !== 'all') rQ = rQ.eq('mode', mode);

    const { data: reservations, error: rErr } = await rQ;
    if (rErr) return res.status(500).json({ error: rErr.message });

    // Configuração de capacidade
    let settingsQ = supabaseAdmin
      .from('hub_unit_boarding_settings')
      .select('hotel_slots, daycare_slots_per_shift')
      .eq('clinic_id', clinic_id);
    if (unit_id) settingsQ = settingsQ.eq('unit_id', unit_id);
    const { data: settingsRows } = await settingsQ;

    const settings = settingsRows?.[0] ?? null;
    const hotelMax = settings?.hotel_slots ?? null;
    const daycareMax = settings?.daycare_slots_per_shift ?? null;

    const hotelCount = (reservations ?? []).filter((r) => r.mode === 'hotel').length;
    const daycareCount = (reservations ?? []).filter((r) => r.mode === 'daycare').length;

    return res.json({
      hotel: {
        current: hotelCount,
        max: hotelMax,
        over_capacity: hotelMax != null ? hotelCount > hotelMax : false,
      },
      daycare: {
        current: daycareCount,
        max: daycareMax,
        over_capacity: daycareMax != null ? daycareCount > daycareMax : false,
      },
    });
  } catch (e: unknown) {
    console.error('getHubBoardingOccupancy', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao calcular ocupação' });
  }
};

// ─── Calendário de reservas futuras ─────────────────────────────────────────

const calendarQuerySchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(BOARDING_MODES).optional(),
});

export const getHubBoardingCalendar = async (req: Request, res: Response) => {
  const parsed = calendarQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { clinic_id, unit_id, from, to, mode } = parsed.data;

  try {
    const fromTs = new Date(`${from}T00:00:00-03:00`).toISOString();
    const toTs = new Date(`${to}T23:59:59.999-03:00`).toISOString();

    // Reservas que se sobrepõem ao intervalo
    let rQ = supabaseAdmin
      .from('hub_boarding_reservations')
      .select(`
        id, mode, status, expected_check_in, expected_check_out,
        checked_in_at, checked_out_at, pet_id, guardian_id,
        hub_pets!hub_boarding_reservations_pet_id_fkey(id, name, size_tier),
        hub_guardians!hub_boarding_reservations_guardian_id_fkey(id, full_name, phone)
      `)
      .eq('clinic_id', clinic_id)
      .not('status', 'in', '("cancelled","no_show")')
      .lt('expected_check_in', toTs)
      .gt('expected_check_out', fromTs)
      .order('expected_check_in');
    if (unit_id) rQ = rQ.eq('unit_id', unit_id);
    if (mode && mode !== 'all') rQ = rQ.eq('mode', mode);

    const { data, error } = await rQ;
    if (error) return res.status(500).json({ error: error.message });

    const events = (data ?? []).map((r) => ({
      id: r.id,
      mode: r.mode,
      status: r.status,
      expected_check_in: r.expected_check_in,
      expected_check_out: r.expected_check_out,
      checked_in_at: r.checked_in_at,
      checked_out_at: r.checked_out_at,
      pet: (r as unknown as { hub_pets?: { id: string; name: string; size_tier: string | null } }).hub_pets ?? null,
      guardian:
        (r as unknown as { hub_guardians?: { id: string; full_name: string; phone: string | null } }).hub_guardians ??
        null,
    }));

    return res.json({ events });
  } catch (e: unknown) {
    console.error('getHubBoardingCalendar', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao buscar calendário' });
  }
};
