import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { syncOpenComandasAfterBoardingCheckedOut } from './hubComandasController';
import { notifyHubBoardingCheckin, notifyHubBoardingCheckout } from './hubNotifyEvents';
import { buildGroomingDisplayTags } from './groomingPetTags';
import {
  coalesceAppointmentPetId,
  fetchHubPetsMapByIds,
  resolvePrimaryPetIdsByGuardians,
} from './hubDayBoardPets';
import {
  BOARDING_SERVICE_GROUPS,
  appointmentMatchesBoardingTypes,
  calcBoardingNights,
  dayBoundsFromYmdSaoPaulo,
  isValidStatusTransition,
  modeFromAppointmentKind,
  resolveDayBoardRange,
  stageFromAppointmentStatus,
} from './boardingOperational';
import {
  calendarQuerySchema,
  createReservationSchema,
  dayBoardQuerySchema,
  occupancyQuerySchema,
  openFromApptSchema,
  patchReservationSchema,
  unitSettingsPatchSchema,
  unitSettingsQuerySchema,
} from './hubBoardingSchemas';
import {
  BoardingHttpError,
  assertCapacityAllowed,
  checkCapacityForCheckIn,
  dropPendingTasksAfter,
  loadReservation,
  loadReservationsOverlapping,
  loadUnitSettings,
  missingTable,
  prepareStayCare,
  resyncOpenStayTasks,
  syncReservationTasks,
  type ReservationRow,
} from './boardingCareService';
import {
  resolveBoardingRateFromAppointment,
  resolveBoardingRateFromServiceType,
  todayYmdSaoPaulo,
} from './boardingPricing';
import { boardingLocalParts } from './boardingBilling';

/** `*` mantém o endpoint funcionando com ou sem as colunas novas (migrações 123+). */
const RESERVATION_SELECT = '*';

const BASE_RESERVATION_COLUMNS = new Set([
  'clinic_id',
  'unit_id',
  'pet_id',
  'guardian_id',
  'hub_appointment_id',
  'mode',
  'status',
  'expected_check_in',
  'expected_check_out',
  'checked_in_at',
  'checked_out_at',
  'daily_rate_cents',
  'notes',
]);

/** Sem a migração 123+, insere/atualiza só as colunas originais. */
function stripNewColumns(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => BASE_RESERVATION_COLUMNS.has(k)));
}

async function writeReservation(
  op: 'insert' | 'update',
  payload: Record<string, unknown>,
  filter?: { id: string; clinicId: string },
): Promise<Record<string, unknown>> {
  const run = async (p: Record<string, unknown>) => {
    if (op === 'insert') {
      return supabaseAdmin.from('hub_boarding_reservations').insert(p).select(RESERVATION_SELECT).single();
    }
    return supabaseAdmin
      .from('hub_boarding_reservations')
      .update(p)
      .eq('id', filter!.id)
      .eq('clinic_id', filter!.clinicId)
      .select(RESERVATION_SELECT)
      .single();
  };
  let { data, error } = await run(payload);
  if (error && /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? '')) {
    ({ data, error } = await run(stripNewColumns(payload)));
  }
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

function sendBoardingError(res: Response, e: unknown, fallback: string, tag: string) {
  if (e instanceof BoardingHttpError) {
    return res.status(e.status).json({ error: e.message, ...(e.extra ?? {}) });
  }
  console.error(tag, e);
  return res.status(500).json({ error: (e as Error)?.message || fallback });
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

// ─── Itens do dia (agenda + reservas por sobreposição) ──────────────────────

export type BoardingDayItem = Record<string, unknown> & {
  kind: 'reservation' | 'appointment_slot';
  reservation_id: string | null;
  appointment_id: string | null;
  boarding_stage: string;
  mode: 'hotel' | 'daycare';
  pet_id: string | null;
  guardian_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_late: boolean;
  reservation: ReservationRow | null;
};

export async function loadBoardingDayItems(args: {
  clinicId: string;
  unitId?: string | null;
  mode?: string | null;
  from: string;
  to: string;
}): Promise<{ items: BoardingDayItem[]; boardingTypesConfigured: boolean; reservationsTableExists: boolean }> {
  const { clinicId, unitId, mode, from, to } = args;
  const boardingTypeIds = await getBoardingServiceTypeIds(clinicId);
  const boardingTypeSet = new Set(boardingTypeIds);

  let apptQ = supabaseAdmin
    .from('hub_appointments')
    .select(
      'id, clinic_id, unit_id, pet_id, guardian_id, starts_at, ends_at, status, title, hub_service_type_id, appointment_kind, notes',
    )
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .lt('starts_at', to)
    .gt('ends_at', from)
    .order('starts_at', { ascending: true });
  if (unitId) apptQ = apptQ.eq('unit_id', unitId);

  const { data: appointmentsRaw, error: apptErr } = await apptQ;
  if (apptErr) throw new Error(apptErr.message);

  const apptRowsRaw = (appointmentsRaw ?? []) as Record<string, unknown>[];
  const apptIdsAll = apptRowsRaw.map((a) => a.id as string);

  const lineTypeIdsByAppt = new Map<string, string[]>();
  if (apptIdsAll.length > 0) {
    const { data: lineRows, error: lineErr } = await supabaseAdmin
      .from('hub_appointment_services')
      .select('appointment_id, hub_service_type_id')
      .in('appointment_id', apptIdsAll);
    if (lineErr) throw new Error(lineErr.message);
    for (const row of lineRows ?? []) {
      const aid = (row as { appointment_id: string }).appointment_id;
      const stid = (row as { hub_service_type_id: string }).hub_service_type_id;
      const list = lineTypeIdsByAppt.get(aid) ?? [];
      list.push(stid);
      lineTypeIdsByAppt.set(aid, list);
    }
  }

  const boardingAppts = apptRowsRaw.filter((a) =>
    appointmentMatchesBoardingTypes(a, boardingTypeSet, lineTypeIdsByAppt),
  );
  const boardingApptIdSet = new Set(boardingAppts.map((a) => a.id as string));
  const boardingTypesConfigured = boardingTypeIds.length > 0 || boardingAppts.length > 0;

  // Estadias que cobrem o dia (inclui hóspedes de vários dias e reservas futuras do dia).
  const { rows: overlapping, tableExists: reservationsTableExists } = await loadReservationsOverlapping({
    clinicId,
    unitId,
    from,
    to,
  });
  const reservationByApptId = new Map<string, ReservationRow>();
  const standaloneReservations: ReservationRow[] = [];
  for (const r of overlapping) {
    if (r.hub_appointment_id && boardingApptIdSet.has(r.hub_appointment_id)) {
      reservationByApptId.set(r.hub_appointment_id, r);
    } else {
      standaloneReservations.push(r);
    }
  }
  // Agendamentos do dia com reserva já existente fora da sobreposição (ex.: check-out mais cedo).
  const apptIdsWithoutRsv = boardingAppts
    .map((a) => a.id as string)
    .filter((id) => !reservationByApptId.has(id));
  if (reservationsTableExists && apptIdsWithoutRsv.length) {
    const { data: extraRsv } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select(RESERVATION_SELECT)
      .eq('clinic_id', clinicId)
      .in('hub_appointment_id', apptIdsWithoutRsv)
      .is('deleted_at', null);
    for (const r of (extraRsv ?? []) as unknown as ReservationRow[]) {
      if (r.hub_appointment_id) reservationByApptId.set(r.hub_appointment_id, r);
    }
  }

  const petIds = new Set<string>();
  const guIds = new Set<string>();
  for (const a of boardingAppts) {
    if (a.pet_id) petIds.add(a.pet_id as string);
    if (a.guardian_id) guIds.add(a.guardian_id as string);
  }
  for (const r of [...standaloneReservations, ...reservationByApptId.values()]) {
    if (r.pet_id) petIds.add(r.pet_id);
    if (r.guardian_id) guIds.add(r.guardian_id);
  }

  const guardiansMissingPet = new Set<string>();
  for (const a of boardingAppts) {
    if (!a.pet_id && a.guardian_id) guardiansMissingPet.add(a.guardian_id as string);
  }
  const petByGuardian = await resolvePrimaryPetIdsByGuardians(clinicId, guardiansMissingPet);
  for (const pid of petByGuardian.values()) petIds.add(pid);

  const { data: gusData } = guIds.size
    ? await supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', [...guIds])
    : { data: [] as Array<{ id: string }> };
  const petMap = await fetchHubPetsMapByIds(petIds);
  const guMap = new Map((gusData ?? []).map((g: { id: string }) => [g.id, g]));

  const flagsByPet = new Map<string, Array<{ flag_key: string; label: string }>>();
  if (petIds.size) {
    const { data: fr, error: frErr } = await supabaseAdmin
      .from('hub_pet_clinical_flags')
      .select('pet_id, flag_key, label')
      .eq('clinic_id', clinicId)
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
    const petRow = petMap.get(pid);
    return buildGroomingDisplayTags(flagsByPet.get(pid) ?? [], petRow?.notes ?? null, petRow?.behavior_tags ?? null);
  };

  const nowMs = Date.now();
  const nightsFor = (rMode: string, checkedInAt: string | null, checkedOutAt: string | null) =>
    rMode === 'hotel' ? calcBoardingNights(checkedInAt, checkedOutAt) : checkedInAt ? 1 : 0;
  const reservationExtras = (r: ReservationRow | null) => ({
    space_id: r?.space_id ?? null,
    daycare_shift_key: r?.daycare_shift_key ?? null,
    daycare_period: r?.daycare_period ?? null,
    hub_service_type_id: r?.hub_service_type_id ?? null,
    checked_in_at: r?.checked_in_at ?? null,
    checked_out_at: r?.checked_out_at ?? null,
  });

  const items: BoardingDayItem[] = [];

  for (const a of boardingAppts) {
    const apptId = a.id as string;
    const reservation = reservationByApptId.get(apptId) ?? null;
    const guardianId = reservation?.guardian_id ?? (a.guardian_id as string | null);
    let petId = coalesceAppointmentPetId(a.pet_id as string | null, reservation?.pet_id ?? null);
    if (!petId && guardianId) petId = petByGuardian.get(guardianId) ?? null;
    const apptMode = (reservation?.mode as 'hotel' | 'daycare' | undefined) ??
      modeFromAppointmentKind(a.appointment_kind as string | null);
    if (mode && mode !== 'all' && apptMode !== mode) continue;

    const apptStatus = a.status as string;
    const boardingStage = reservation ? reservation.status : stageFromAppointmentStatus(apptStatus);
    const startsAt = reservation?.expected_check_in ?? (a.starts_at as string);
    const endsAt = reservation?.expected_check_out ?? (a.ends_at as string);
    const checkedOutAt = reservation?.checked_out_at ?? null;
    const isLate =
      boardingStage === 'checked_in' && checkedOutAt === null && endsAt && new Date(endsAt).getTime() < nowMs;

    items.push({
      kind: reservation ? 'reservation' : 'appointment_slot',
      reservation_id: reservation?.id ?? null,
      appointment_id: apptId,
      boarding_stage: boardingStage,
      mode: apptMode,
      appointment_status: apptStatus,
      appointment_kind: a.appointment_kind,
      title: a.title,
      notes: reservation?.notes ?? a.notes,
      is_late: Boolean(isLate),
      is_walk_in: false,
      starts_at: startsAt,
      ends_at: endsAt,
      daily_rate_cents: reservation?.daily_rate_cents ?? null,
      nights_count: nightsFor(apptMode, reservation?.checked_in_at ?? null, checkedOutAt),
      pet: petId ? petMap.get(petId) : null,
      guardian: guardianId ? guMap.get(guardianId) : null,
      pet_id: petId,
      guardian_id: guardianId,
      clinical_tags: tagsForPet(petId),
      reservations_table_exists: reservationsTableExists,
      reservation,
      ...reservationExtras(reservation),
    });
  }

  for (const r of standaloneReservations) {
    const rMode = r.mode;
    if (mode && mode !== 'all' && rMode !== mode) continue;
    const endsAt = r.expected_check_out ?? null;
    const isLate =
      r.status === 'checked_in' && !r.checked_out_at && endsAt != null && new Date(endsAt).getTime() < nowMs;

    items.push({
      kind: 'reservation',
      reservation_id: r.id,
      appointment_id: r.hub_appointment_id ?? null,
      boarding_stage: r.status,
      mode: rMode,
      appointment_status: null,
      is_walk_in: !r.hub_appointment_id,
      is_late: isLate,
      starts_at: r.checked_in_at ?? r.expected_check_in ?? r.created_at,
      ends_at: endsAt ?? r.checked_out_at ?? null,
      daily_rate_cents: r.daily_rate_cents ?? null,
      nights_count: nightsFor(rMode, r.checked_in_at, r.checked_out_at),
      notes: r.notes,
      pet: petMap.get(r.pet_id) ?? null,
      guardian: r.guardian_id ? guMap.get(r.guardian_id) : null,
      pet_id: r.pet_id,
      guardian_id: r.guardian_id ?? null,
      clinical_tags: tagsForPet(r.pet_id),
      reservation: r,
      ...reservationExtras(r),
    });
  }

  items.sort((a, b) => new Date(a.starts_at || 0).getTime() - new Date(b.starts_at || 0).getTime());
  return { items, boardingTypesConfigured, reservationsTableExists };
}

// ─── GET /boarding/day-board ───────────────────────────────────────────────

export const getHubBoardingDayBoard = async (req: Request, res: Response) => {
  try {
    const parsed = dayBoardQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, unit_id, mode } = parsed.data;
    const { from, to, dateYmd } = resolveDayBoardRange(parsed.data);
    const { items, boardingTypesConfigured } = await loadBoardingDayItems({
      clinicId: clinic_id,
      unitId: unit_id,
      mode,
      from,
      to,
    });
    return res.json({
      items: items.map(({ reservation: _r, ...rest }) => rest),
      date: dateYmd,
      clinic_id,
      boarding_types_configured: boardingTypesConfigured,
    });
  } catch (e: unknown) {
    return sendBoardingError(res, e, 'Erro ao carregar painel de Hotel & Creche', 'getHubBoardingDayBoard');
  }
};

// ─── POST /boarding/reservations/open-from-appointment ────────────────────

export const openHubBoardingReservationFromAppointment = async (req: Request, res: Response) => {
  try {
    const { force_capacity, ...openBody } = (req.body ?? {}) as Record<string, unknown>;
    const parsed = openFromApptSchema.safeParse(openBody);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, hub_appointment_id } = parsed.data;
    const force = force_capacity === true;

    const { data: existing, error: exErr } = await supabaseAdmin
      .from('hub_boarding_reservations')
      .select(RESERVATION_SELECT)
      .eq('hub_appointment_id', hub_appointment_id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });
    if (existing) return res.json({ reservation: existing, created: false });

    const { data: appt, error: apptErr } = await supabaseAdmin
      .from('hub_appointments')
      .select('pet_id, guardian_id, unit_id, starts_at, ends_at, appointment_kind, hub_service_type_id')
      .eq('id', hub_appointment_id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (apptErr) return res.status(500).json({ error: apptErr.message });
    if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });
    if (!appt.pet_id) return res.status(422).json({ error: 'Agendamento sem pet associado' });

    let mode: 'hotel' | 'daycare' =
      (appt.appointment_kind as string) === 'daycare_block' ? 'daycare' : 'hotel';
    if ((appt.appointment_kind as string) !== 'daycare_block' && (appt.appointment_kind as string) !== 'hotel_stay') {
      const svcId = (appt.hub_service_type_id as string | null) ?? null;
      if (svcId) {
        const { data: st } = await supabaseAdmin
          .from('hub_service_types')
          .select('service_group')
          .eq('id', svcId)
          .maybeSingle();
        if (String(st?.service_group ?? '').trim() === 'creche') mode = 'daycare';
      }
    }
    const capacity = await checkCapacityForCheckIn({
      clinicId: clinic_id,
      unitId: (appt.unit_id as string | null) ?? null,
      mode,
    });
    assertCapacityAllowed(capacity, force);

    const rate = await resolveBoardingRateFromAppointment({
      clinicId: clinic_id,
      appointmentId: hub_appointment_id,
      primaryServiceTypeId: (appt.hub_service_type_id as string | null) ?? null,
    });

    const created = await writeReservation('insert', {
      clinic_id,
      unit_id: appt.unit_id ?? null,
      pet_id: appt.pet_id,
      guardian_id: appt.guardian_id ?? null,
      hub_appointment_id,
      mode,
      status: 'checked_in',
      expected_check_in: appt.starts_at,
      expected_check_out: appt.ends_at,
      checked_in_at: new Date().toISOString(),
      ...(rate
        ? {
            daily_rate_cents: rate.daily_rate_cents,
            hub_service_type_id: rate.hub_service_type_id,
            rate_source: rate.rate_source,
          }
        : {}),
      ...(mode === 'daycare' ? { daycare_period: 'full_day' } : {}),
    });

    await supabaseAdmin
      .from('hub_appointments')
      .update({ status: 'in_progress' })
      .eq('id', hub_appointment_id)
      .eq('clinic_id', clinic_id);

    await prepareStayCare(created as ReservationRow);

    void notifyHubBoardingCheckin({
      clinicId: clinic_id,
      unitId: (appt.unit_id as string | null) ?? null,
      petId: appt.pet_id as string,
      reservationId: created.id as string,
      excludeUserIds: req.user?.id ? [req.user.id] : undefined,
    });

    return res.status(201).json({ reservation: created, created: true, capacity });
  } catch (e: unknown) {
    return sendBoardingError(res, e, 'Erro ao abrir reserva', 'openHubBoardingReservationFromAppointment');
  }
};

// ─── POST /boarding/reservations (nova hospedagem: entrada agora ou reserva futura) ──

export const createHubBoardingReservation = async (req: Request, res: Response) => {
  try {
    const force = req.body?.force_capacity === true;
    const body = { ...(req.body ?? {}) };
    delete body.force_capacity;
    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, status: requestedStatus, ...rest } = parsed.data;
    const status = requestedStatus ?? 'checked_in';
    const nowIso = new Date().toISOString();

    if (status === 'reserved' && !rest.expected_check_in) {
      return res.status(400).json({ error: 'Informe a entrada prevista da reserva' });
    }
    if (rest.expected_check_in && rest.expected_check_out && rest.expected_check_out < rest.expected_check_in) {
      return res.status(400).json({ error: 'A saída prevista precisa ser depois da entrada' });
    }

    let capacity = null;
    if (status === 'checked_in') {
      capacity = await checkCapacityForCheckIn({
        clinicId: clinic_id,
        unitId: rest.unit_id ?? null,
        mode: rest.mode,
        spaceId: rest.space_id ?? null,
        shiftKey: rest.daycare_shift_key ?? null,
      });
      assertCapacityAllowed(capacity, force);
    }

    const payload: Record<string, unknown> = { clinic_id, ...rest, status };
    if (status === 'checked_in') payload.checked_in_at = nowIso;
    if (rest.mode === 'daycare' && !rest.daycare_period) payload.daycare_period = 'full_day';

    if (rest.daily_rate_cents != null) {
      payload.rate_source = 'manual';
    } else {
      const refIso = rest.expected_check_in ?? nowIso;
      const rate = await resolveBoardingRateFromServiceType({
        clinicId: clinic_id,
        petId: rest.pet_id,
        mode: rest.mode,
        serviceTypeId: rest.hub_service_type_id ?? null,
        daycarePeriod: (payload.daycare_period as 'full_day' | 'half_day' | undefined) ?? null,
        refYmd: boardingLocalParts(refIso)?.ymd ?? todayYmdSaoPaulo(),
      });
      if (rate) {
        payload.daily_rate_cents = rate.daily_rate_cents;
        payload.hub_service_type_id = rate.hub_service_type_id;
        payload.rate_source = rate.rate_source;
      }
    }

    const reservation = await writeReservation('insert', payload);
    await prepareStayCare(reservation as ReservationRow);

    if (status === 'checked_in') {
      void notifyHubBoardingCheckin({
        clinicId: clinic_id,
        unitId: (reservation.unit_id as string | null) ?? null,
        petId: (reservation.pet_id as string | null) ?? null,
        reservationId: reservation.id as string,
        excludeUserIds: req.user?.id ? [req.user.id] : undefined,
      });
    }

    return res.status(201).json({ reservation, capacity });
  } catch (e: unknown) {
    return sendBoardingError(res, e, 'Erro ao criar reserva', 'createHubBoardingReservation');
  }
};

// ─── PATCH /boarding/reservations/:id ─────────────────────────────────────

export const patchHubBoardingReservation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return res.status(400).json({ error: 'ID de reserva inválido' });
    }
    const parsed = patchReservationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, status: newStatus, reprice, force_capacity, ...rest } = parsed.data;

    const current = await loadReservation(clinic_id, id);
    if (!current) return res.status(404).json({ error: 'Reserva não encontrada' });

    const previousStatus = current.status;
    if (newStatus && newStatus !== previousStatus && !isValidStatusTransition(previousStatus, newStatus)) {
      return res.status(422).json({ error: `Transição inválida: ${previousStatus} → ${newStatus}` });
    }

    const updatePayload: Record<string, unknown> = { ...rest };
    if (newStatus) updatePayload.status = newStatus;
    const nowIso = new Date().toISOString();
    if (newStatus === 'checked_in' && !rest.checked_in_at && previousStatus !== 'checked_in') {
      updatePayload.checked_in_at = nowIso;
    }
    if (newStatus === 'checked_out' && !rest.checked_out_at) updatePayload.checked_out_at = nowIso;

    const enteringNow = newStatus === 'checked_in' && previousStatus !== 'checked_in';
    const spaceChanged = rest.space_id !== undefined && rest.space_id !== current.space_id && rest.space_id != null;
    let capacity = null;
    if (enteringNow || (spaceChanged && (newStatus ?? previousStatus) === 'checked_in')) {
      capacity = await checkCapacityForCheckIn({
        clinicId: clinic_id,
        unitId: current.unit_id,
        mode: current.mode,
        reservationId: id,
        spaceId: (rest.space_id as string | null | undefined) ?? current.space_id ?? null,
        shiftKey: (rest.daycare_shift_key as string | null | undefined) ?? current.daycare_shift_key ?? null,
      });
      if (!enteringNow) capacity = { ...capacity, over: false };
      assertCapacityAllowed(capacity, force_capacity);
    }

    if (rest.daily_rate_cents !== undefined && !reprice) updatePayload.rate_source = 'manual';
    const pricingChanged =
      reprice ||
      (rest.daily_rate_cents === undefined &&
        ((rest.hub_service_type_id !== undefined && rest.hub_service_type_id !== current.hub_service_type_id) ||
          (rest.daycare_period !== undefined && rest.daycare_period !== current.daycare_period)));
    if (pricingChanged) {
      const rate = await resolveBoardingRateFromServiceType({
        clinicId: clinic_id,
        petId: current.pet_id,
        mode: current.mode,
        serviceTypeId: (rest.hub_service_type_id as string | null | undefined) ?? current.hub_service_type_id ?? null,
        daycarePeriod:
          ((rest.daycare_period ?? current.daycare_period) as 'full_day' | 'half_day' | null | undefined) ?? null,
        refYmd:
          boardingLocalParts(current.checked_in_at ?? current.expected_check_in ?? nowIso)?.ymd ?? todayYmdSaoPaulo(),
      });
      if (rate) {
        updatePayload.daily_rate_cents = rate.daily_rate_cents;
        updatePayload.hub_service_type_id = rate.hub_service_type_id;
        updatePayload.rate_source = rate.rate_source;
      }
    }

    const updated = (await writeReservation('update', updatePayload, { id, clinicId: clinic_id })) as ReservationRow;

    const apptId = current.hub_appointment_id;
    if (apptId && newStatus && newStatus !== previousStatus) {
      const apptStatus =
        newStatus === 'checked_in'
          ? 'in_progress'
          : newStatus === 'checked_out'
            ? 'done'
            : newStatus === 'cancelled'
              ? 'cancelled'
              : undefined;
      if (apptStatus) {
        await supabaseAdmin.from('hub_appointments').update({ status: apptStatus }).eq('id', apptId).eq('clinic_id', clinic_id);
      }
    }

    // Tarefas acompanham a estadia: datas mudaram → refaz pendentes; saiu → remove o que ficou para depois.
    try {
      if (newStatus === 'checked_out') {
        await dropPendingTasksAfter(clinic_id, id, updated.checked_out_at ?? nowIso);
      } else if (newStatus === 'cancelled' || newStatus === 'no_show') {
        await dropPendingTasksAfter(clinic_id, id, null);
      } else if (
        enteringNow ||
        rest.expected_check_in !== undefined ||
        rest.expected_check_out !== undefined ||
        rest.checked_in_at !== undefined
      ) {
        await syncReservationTasks(updated);
      }
    } catch (taskErr) {
      console.error('patchHubBoardingReservation tasks', taskErr);
    }

    if (newStatus === 'checked_out') void syncOpenComandasAfterBoardingCheckedOut(clinic_id, id);
    else if (
      (rest.daily_rate_cents !== undefined || pricingChanged) &&
      (newStatus ?? previousStatus) === 'checked_out'
    ) {
      void syncOpenComandasAfterBoardingCheckedOut(clinic_id, id);
    }

    if (newStatus && newStatus !== previousStatus) {
      const notifyArgs = {
        clinicId: clinic_id,
        unitId: current.unit_id,
        petId: current.pet_id,
        reservationId: id,
        excludeUserIds: req.user?.id ? [req.user.id] : undefined,
      };
      if (newStatus === 'checked_in') void notifyHubBoardingCheckin(notifyArgs);
      if (newStatus === 'checked_out') void notifyHubBoardingCheckout(notifyArgs);
    }

    return res.json({ reservation: updated, capacity });
  } catch (e: unknown) {
    return sendBoardingError(res, e, 'Erro ao atualizar reserva', 'patchHubBoardingReservation');
  }
};

// ─── Configurações da unidade ───────────────────────────────────────────────

export const getHubBoardingUnitSettings = async (req: Request, res: Response) => {
  const parsed = unitSettingsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { clinic_id, unit_id } = parsed.data;

  try {
    let q = supabaseAdmin.from('hub_unit_boarding_settings').select('*').eq('clinic_id', clinic_id);
    if (unit_id) q = q.eq('unit_id', unit_id);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ settings: data ?? [] });
  } catch (e: unknown) {
    return sendBoardingError(res, e, 'Erro ao buscar configurações', 'getHubBoardingUnitSettings');
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
    if (error) {
      if (missingTable(error) || /column/i.test(error.message ?? '')) {
        return res.status(503).json({
          error: 'Configurações novas de Hotel & Creche indisponíveis. Execute as migrações 127 e 131 no Supabase.',
        });
      }
      return res.status(500).json({ error: error.message });
    }
    if (fields.meal_slot_times || fields.recreation_windows) {
      try {
        await resyncOpenStayTasks(clinic_id, unit_id);
      } catch (err) {
        console.error('resyncOpenStayTasks', err);
      }
    }
    return res.json({ settings: data });
  } catch (e: unknown) {
    return sendBoardingError(res, e, 'Erro ao salvar configurações', 'patchHubBoardingUnitSettings');
  }
};

// ─── Ocupação ───────────────────────────────────────────────────────────────

export const getHubBoardingOccupancy = async (req: Request, res: Response) => {
  const parsed = occupancyQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { clinic_id, unit_id, mode } = parsed.data;

  try {
    const dateYmd = parsed.data.date ?? parsed.data.from?.slice(0, 10) ?? todayYmdSaoPaulo();
    const { from, to } =
      parsed.data.from && parsed.data.to
        ? { from: parsed.data.from, to: parsed.data.to }
        : dayBoundsFromYmdSaoPaulo(dateYmd);

    const { rows } = await loadReservationsOverlapping({ clinicId: clinic_id, unitId: unit_id, from, to });
    const active = rows.filter(
      (r) => (r.status === 'reserved' || r.status === 'checked_in') && (!mode || mode === 'all' || r.mode === mode),
    );
    const settings = await loadUnitSettings(clinic_id, unit_id);

    const hotelCount = active.filter((r) => r.mode === 'hotel').length;
    const daycareCount = active.filter((r) => r.mode === 'daycare').length;
    const hotelMax = settings.hotel_slots;
    const daycareMax = settings.daycare_slots_per_shift;

    const shifts = settings.daycare_shifts.map((s) => {
      const current = active.filter((r) => r.mode === 'daycare' && r.daycare_shift_key === s.key).length;
      return { key: s.key, label: s.label, current, max: daycareMax, over_capacity: daycareMax != null && current > daycareMax };
    });

    return res.json({
      hotel: { current: hotelCount, max: hotelMax, over_capacity: hotelMax != null ? hotelCount > hotelMax : false },
      daycare: {
        current: daycareCount,
        max: daycareMax,
        over_capacity:
          daycareMax != null
            ? shifts.length
              ? shifts.some((s) => s.over_capacity)
              : daycareCount > daycareMax
            : false,
        shifts,
      },
      overbooking_policy: settings.overbooking_policy,
    });
  } catch (e: unknown) {
    return sendBoardingError(res, e, 'Erro ao calcular ocupação', 'getHubBoardingOccupancy');
  }
};

// ─── Calendário de reservas futuras ─────────────────────────────────────────

export const getHubBoardingCalendar = async (req: Request, res: Response) => {
  const parsed = calendarQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { clinic_id, unit_id, from, to, mode } = parsed.data;

  try {
    const fromTs = new Date(`${from}T00:00:00-03:00`).toISOString();
    const toTs = new Date(`${to}T23:59:59.999-03:00`).toISOString();

    const { rows } = await loadReservationsOverlapping({ clinicId: clinic_id, unitId: unit_id, from: fromTs, to: toTs });
    const filtered = rows.filter((r) => !mode || mode === 'all' || r.mode === mode);
    const petIds = new Set(filtered.map((r) => r.pet_id));
    const guIds = [...new Set(filtered.map((r) => r.guardian_id).filter(Boolean))] as string[];
    const [{ data: pets }, { data: gus }] = await Promise.all([
      petIds.size
        ? supabaseAdmin.from('hub_pets').select('id, name, size_tier').in('id', [...petIds])
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; size_tier: string | null }> }),
      guIds.length
        ? supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', guIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; phone: string | null }> }),
    ]);
    const petById = new Map((pets ?? []).map((p) => [p.id, p]));
    const guById = new Map((gus ?? []).map((g) => [g.id, g]));

    const events = filtered
      .sort((a, b) => String(a.expected_check_in ?? a.checked_in_at ?? '').localeCompare(String(b.expected_check_in ?? b.checked_in_at ?? '')))
      .map((r) => ({
        id: r.id,
        mode: r.mode,
        status: r.status,
        expected_check_in: r.expected_check_in ?? r.checked_in_at,
        expected_check_out: r.expected_check_out ?? r.checked_out_at,
        checked_in_at: r.checked_in_at,
        checked_out_at: r.checked_out_at,
        pet: petById.get(r.pet_id) ?? null,
        guardian: r.guardian_id ? guById.get(r.guardian_id) ?? null : null,
      }));

    return res.json({ events });
  } catch (e: unknown) {
    return sendBoardingError(res, e, 'Erro ao buscar calendário', 'getHubBoardingCalendar');
  }
};
