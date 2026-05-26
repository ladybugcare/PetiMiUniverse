import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const uuidStr = z.string().uuid();

const optionalTrim = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v === undefined || v === null ? undefined : String(v).trim()))
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || v === undefined || v.length <= max, { message: 'Texto muito longo' });

const appointmentStatusSchema = z.enum([
  'pending_confirm',
  'confirmed',
  'in_progress',
  'done',
  'cancelled',
  'paid',
]);

const appointmentKindSchema = z.enum(['standard', 'hotel_stay', 'daycare_block', 'pickup_route']);

type OverlapRow = {
  id: string;
  hub_staff_member_id: string | null;
  resource_label: string | null;
  unit_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(aEnd).getTime() > new Date(bStart).getTime();
}

function isStaffConflict(staffId: string | null, other: OverlapRow): boolean {
  if (!staffId || !other.hub_staff_member_id) return false;
  return staffId === other.hub_staff_member_id;
}

function isResourceConflict(resourceLabel: string | null, unitId: string | null, other: OverlapRow): boolean {
  const r1 = resourceLabel?.trim();
  const r2 = other.resource_label?.trim();
  if (!r1 || !r2) return false;
  if (r1 !== r2) return false;
  return String(unitId ?? '') === String(other.unit_id ?? '');
}

function rowConflictsWith(
  row: OverlapRow,
  staffId: string | null,
  resourceLabel: string | null,
  unitId: string | null,
  startsAt: string,
  endsAt: string,
): boolean {
  if (row.status === 'cancelled') return false;
  if (!intervalsOverlap(startsAt, endsAt, row.starts_at, row.ends_at)) return false;
  return isStaffConflict(staffId, row) || isResourceConflict(resourceLabel, unitId, row);
}

async function loadOverlappingRows(
  clinicId: string,
  startsAt: string,
  endsAt: string,
  excludeIds: string[],
): Promise<OverlapRow[]> {
  let q = supabaseAdmin
    .from('hub_appointments')
    .select('id, hub_staff_member_id, resource_label, unit_id, starts_at, ends_at, status')
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .lt('starts_at', endsAt)
    .gt('ends_at', startsAt);
  if (excludeIds.length === 1) q = q.neq('id', excludeIds[0]!);
  else if (excludeIds.length > 1) q = q.not('id', 'in', `(${excludeIds.join(',')})`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OverlapRow[];
}

async function assertNoScheduleConflict(
  clinicId: string,
  excludeIds: string[],
  staffId: string | null,
  resourceLabel: string | null,
  unitId: string | null,
  startsAt: string,
  endsAt: string,
): Promise<{ conflict: boolean; reason: string; conflictingId?: string }> {
  const rows = await loadOverlappingRows(clinicId, startsAt, endsAt, excludeIds);
  for (const row of rows) {
    if (rowConflictsWith(row, staffId, resourceLabel, unitId, startsAt, endsAt)) {
      const reason =
        isStaffConflict(staffId, row) && staffId
          ? 'Horário em conflito com outro atendimento do mesmo profissional.'
          : 'Horário em conflito com outro atendimento no mesmo recurso/sala.';
      return { conflict: true, reason, conflictingId: row.id };
    }
  }
  return { conflict: false, reason: '' };
}

async function assertServiceTypeInClinic(clinicId: string, serviceTypeId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_types')
    .select('id')
    .eq('id', serviceTypeId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function assertStaffInClinicOptional(clinicId: string, staffId: string | null): Promise<boolean> {
  if (!staffId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id')
    .eq('id', staffId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

async function assertPetInClinic(clinicId: string, petId: string | null): Promise<boolean> {
  if (!petId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_pets')
    .select('id')
    .eq('id', petId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

async function assertGuardianInClinic(clinicId: string, guardianId: string | null): Promise<boolean> {
  if (!guardianId) return true;
  const { data, error } = await supabaseAdmin
    .from('hub_guardians')
    .select('id')
    .eq('id', guardianId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

async function assertUnitInClinic(clinicId: string, unitId: string | null): Promise<boolean> {
  if (!unitId) return true;
  const { data, error } = await supabaseAdmin
    .from('units')
    .select('id, clinic_id')
    .eq('id', unitId)
    .maybeSingle();
  if (error || !data || (data as { clinic_id: string }).clinic_id !== clinicId) return false;
  return true;
}

// ── Recurrence helpers ──────────────────────────────────────────────────────

const MAX_OCCURRENCES = 52;

type RecurrenceRule = {
  kind: 'daily' | 'weekly' | 'monthly';
  interval_value: number;
  days_of_week?: number[] | null;
  day_of_month?: number | null;
  until_date?: string | null;
  occurrences?: number | null;
};

function generateOccurrenceDates(startDate: string, rule: RecurrenceRule): string[] {
  const dates: string[] = [];
  let current = new Date(startDate + 'T00:00:00Z');
  const cap = Math.min(rule.occurrences ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const until = rule.until_date ? new Date(rule.until_date + 'T23:59:59Z') : null;

  while (dates.length < cap) {
    if (until && current > until) break;

    if (rule.kind === 'daily') {
      dates.push(current.toISOString().slice(0, 10));
      current = new Date(current);
      current.setUTCDate(current.getUTCDate() + rule.interval_value);
    } else if (rule.kind === 'weekly') {
      const targetDays = rule.days_of_week && rule.days_of_week.length > 0 ? rule.days_of_week : [1];
      // iso weekday: 1=mon..7=sun
      const dow = ((current.getUTCDay() + 6) % 7) + 1;
      if (targetDays.includes(dow)) {
        dates.push(current.toISOString().slice(0, 10));
      }
      current = new Date(current);
      current.setUTCDate(current.getUTCDate() + 1);
      // skip to next week start if past all target days this week
      if (dates.length > 0 && rule.interval_value > 1) {
        const curDow = ((current.getUTCDay() + 6) % 7) + 1;
        const maxTarget = Math.max(...targetDays);
        if (curDow > maxTarget) {
          // jump to monday of next Nth week
          const daysUntilMon = (8 - current.getUTCDay()) % 7 || 7;
          current.setUTCDate(current.getUTCDate() + daysUntilMon + (rule.interval_value - 1) * 7);
        }
      }
      if (dates.length >= cap) break;
      continue;
    } else {
      // monthly
      dates.push(current.toISOString().slice(0, 10));
      current = new Date(current);
      current.setUTCMonth(current.getUTCMonth() + rule.interval_value);
      if (rule.day_of_month) {
        const maxDay = new Date(current.getUTCFullYear(), current.getUTCMonth() + 1, 0).getUTCDate();
        current.setUTCDate(Math.min(rule.day_of_month, maxDay));
      }
    }
  }
  return dates;
}

function shiftTimestampToDate(originalTs: string, newDate: string): string {
  // keep time portion from originalTs, apply to newDate
  const orig = new Date(originalTs);
  const [y, m, d] = newDate.split('-').map(Number);
  orig.setUTCFullYear(y!, m! - 1, d!);
  return orig.toISOString();
}

// ── Enrichment ───────────────────────────────────────────────────────────────

type EnrichedAppointment = Record<string, unknown>;

async function enrichAppointments(rows: Record<string, unknown>[]): Promise<EnrichedAppointment[]> {
  if (rows.length === 0) return [];
  const stIds = [...new Set(rows.map((r) => r.hub_service_type_id as string))];
  const staffIds = [...new Set(rows.map((r) => r.hub_staff_member_id).filter(Boolean))] as string[];
  const petIds = [...new Set(rows.map((r) => r.pet_id).filter(Boolean))] as string[];
  const guIds = [...new Set(rows.map((r) => r.guardian_id).filter(Boolean))] as string[];
  const unitIds = [...new Set(rows.map((r) => r.unit_id).filter(Boolean))] as string[];
  const apptIds = rows.map((r) => r.id as string);

  const [stRes, staffRes, petsRes, guRes, unitsRes, svcLinesRes] = await Promise.all([
    supabaseAdmin
      .from('hub_service_types')
      .select('id, name, code, service_group, agenda_color, default_duration_minutes')
      .in('id', stIds),
    staffIds.length
      ? supabaseAdmin.from('hub_staff_members').select('id, full_name, agenda_color').in('id', staffIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    petIds.length
      ? supabaseAdmin.from('hub_pets').select('id, name').in('id', petIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    guIds.length
      ? supabaseAdmin.from('hub_guardians').select('id, full_name').in('id', guIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    unitIds.length
      ? supabaseAdmin.from('units').select('id, name').in('id', unitIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    apptIds.length
      ? supabaseAdmin
          .from('hub_appointment_services')
          .select('appointment_id, hub_service_type_id, duration_minutes, order_index')
          .in('appointment_id', apptIds)
          .order('order_index')
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const stMap = new Map((stRes.data ?? []).map((x: Record<string, unknown>) => [x.id as string, x]));
  const staffMap = new Map((staffRes.data ?? []).map((x: Record<string, unknown>) => [x.id as string, x]));
  const petMap = new Map((petsRes.data ?? []).map((x: Record<string, unknown>) => [x.id as string, x]));
  const guMap = new Map((guRes.data ?? []).map((x: Record<string, unknown>) => [x.id as string, x]));
  const unitMap = new Map((unitsRes.data ?? []).map((x: Record<string, unknown>) => [x.id as string, x]));

  // group service lines by appointment
  const svcByAppt = new Map<string, Record<string, unknown>[]>();
  for (const line of (svcLinesRes.data ?? []) as Record<string, unknown>[]) {
    const apptId = line.appointment_id as string;
    const arr = svcByAppt.get(apptId) ?? [];
    arr.push(line);
    svcByAppt.set(apptId, arr);
  }

  return rows.map((r) => {
    const st = stMap.get(r.hub_service_type_id as string);
    const sm = r.hub_staff_member_id ? staffMap.get(r.hub_staff_member_id as string) : null;
    const pet = r.pet_id ? petMap.get(r.pet_id as string) : null;
    const gu = r.guardian_id ? guMap.get(r.guardian_id as string) : null;
    const un = r.unit_id ? unitMap.get(r.unit_id as string) : null;
    const rawLines = svcByAppt.get(r.id as string) ?? [];
    const services = rawLines.map((l) => ({
      id: l.id as string,
      hub_service_type_id: l.hub_service_type_id as string,
      duration_minutes: l.duration_minutes as number,
      order_index: l.order_index as number,
      service_type: stMap.get(l.hub_service_type_id as string) ?? null,
    }));
    return {
      ...r,
      service_type: st ?? null,
      staff_member: sm ?? null,
      pet: pet ?? null,
      guardian: gu ?? null,
      unit: un ?? null,
      services,
    };
  });
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  clinic_id: uuidStr,
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  unit_id: uuidStr.optional(),
  hub_staff_member_id: z.union([uuidStr, z.literal('__na__')]).optional(),
  hub_service_type_id: uuidStr.optional(),
  service_group: z.string().trim().min(1).max(64).optional(),
  status: appointmentStatusSchema.optional(),
  resource_label: z.string().trim().max(120).optional(),
});

const serviceLineSchema = z.object({
  hub_service_type_id: uuidStr,
  duration_minutes: z.number().int().positive(),
});

const pickupBlockSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  resource_label: optionalTrim(120).optional(),
  hub_staff_member_id: uuidStr.optional().nullable(),
});

const extraBlockSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  services: z.array(serviceLineSchema).min(1),
  hub_staff_member_id: uuidStr.optional().nullable(),
  resource_label: optionalTrim(120).optional(),
  status: appointmentStatusSchema.optional(),
  notes: optionalTrim(8000).optional(),
});

const recurrenceSchema = z.object({
  kind: z.enum(['daily', 'weekly', 'monthly']),
  interval_value: z.number().int().positive().default(1),
  days_of_week: z.array(z.number().int().min(1).max(7)).optional().nullable(),
  day_of_month: z.number().int().min(1).max(31).optional().nullable(),
  until_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  occurrences: z.number().int().positive().max(MAX_OCCURRENCES).optional().nullable(),
});

const createAppointmentSchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    hub_service_type_id: uuidStr,
    hub_staff_member_id: uuidStr.optional().nullable(),
    pet_id: uuidStr.optional().nullable(),
    guardian_id: uuidStr.optional().nullable(),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    status: appointmentStatusSchema.optional(),
    resource_label: optionalTrim(120).optional(),
    notes: optionalTrim(8000).optional(),
    appointment_kind: appointmentKindSchema.optional(),
    title: optionalTrim(200).optional(),
    description: optionalTrim(8000).optional(),
    services: z.array(serviceLineSchema).optional(),
    with_pickup_route_before: pickupBlockSchema.optional().nullable(),
    with_pickup_route_after: pickupBlockSchema.optional().nullable(),
    extra_blocks: z.array(extraBlockSchema).optional(),
    recurrence: recurrenceSchema.optional().nullable(),
  })
  .strict();

const patchAppointmentSchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    hub_service_type_id: uuidStr.optional(),
    hub_staff_member_id: uuidStr.optional().nullable(),
    pet_id: uuidStr.optional().nullable(),
    guardian_id: uuidStr.optional().nullable(),
    starts_at: z.string().datetime({ offset: true }).optional(),
    ends_at: z.string().datetime({ offset: true }).optional(),
    status: appointmentStatusSchema.optional(),
    resource_label: optionalTrim(120).optional().nullable(),
    notes: optionalTrim(8000).optional().nullable(),
    appointment_kind: appointmentKindSchema.optional(),
    deleted: z.boolean().optional(),
    title: optionalTrim(200).optional().nullable(),
    description: optionalTrim(8000).optional().nullable(),
    services: z.array(serviceLineSchema).optional(),
  })
  .strict();

// ── Handlers ─────────────────────────────────────────────────────────────────

export const listHubAppointments = async (req: Request, res: Response) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { clinic_id, from, to, unit_id, hub_staff_member_id, hub_service_type_id, service_group, status, resource_label } =
      parsed.data;

    let typeIdsFilter: string[] | null = null;
    if (service_group) {
      const { data: types, error: te } = await supabaseAdmin
        .from('hub_service_types')
        .select('id')
        .eq('clinic_id', clinic_id)
        .eq('service_group', service_group)
        .is('deleted_at', null);
      if (te) return res.status(500).json({ error: te.message });
      typeIdsFilter = (types ?? []).map((t: { id: string }) => t.id);
      if (typeIdsFilter.length === 0) {
        return res.json({ appointments: [], range: { from, to } });
      }
    }

    let q = supabaseAdmin
      .from('hub_appointments')
      .select('*')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .lt('starts_at', to)
      .gt('ends_at', from)
      .order('starts_at', { ascending: true });

    if (unit_id) q = q.eq('unit_id', unit_id);
    if (hub_staff_member_id === '__na__') q = q.is('hub_staff_member_id', null);
    else if (hub_staff_member_id) q = q.eq('hub_staff_member_id', hub_staff_member_id);
    if (hub_service_type_id) q = q.eq('hub_service_type_id', hub_service_type_id);
    if (typeIdsFilter) q = q.in('hub_service_type_id', typeIdsFilter);
    if (status) q = q.eq('status', status);
    if (resource_label) q = q.eq('resource_label', resource_label);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    const enriched = await enrichAppointments((data ?? []) as Record<string, unknown>[]);
    return res.json({ appointments: enriched, range: { from, to } });
  } catch (e: unknown) {
    console.error('listHubAppointments', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao listar agendamentos' });
  }
};

export const createHubAppointment = async (req: Request, res: Response) => {
  try {
    const parsed = createAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const b = parsed.data;
    if (new Date(b.ends_at) <= new Date(b.starts_at)) {
      return res.status(400).json({ error: 'ends_at deve ser posterior a starts_at' });
    }

    // validations
    if (!(await assertServiceTypeInClinic(b.clinic_id, b.hub_service_type_id))) {
      return res.status(400).json({ error: 'Tipo de serviço inválido ou não pertence à clínica' });
    }
    if (!(await assertStaffInClinicOptional(b.clinic_id, b.hub_staff_member_id ?? null))) {
      return res.status(400).json({ error: 'Profissional inválido ou não pertence à clínica' });
    }
    if (!(await assertPetInClinic(b.clinic_id, b.pet_id ?? null))) {
      return res.status(400).json({ error: 'Pet inválido ou não pertence à clínica' });
    }
    if (!(await assertGuardianInClinic(b.clinic_id, b.guardian_id ?? null))) {
      return res.status(400).json({ error: 'Tutor inválido ou não pertence à clínica' });
    }
    if (!(await assertUnitInClinic(b.clinic_id, b.unit_id ?? null))) {
      return res.status(400).json({ error: 'Unidade inválida ou não pertence à clínica' });
    }

    // Validate service types for extra services
    const allServiceTypeIds = b.services ? b.services.map((s) => s.hub_service_type_id) : [];
    for (const stId of allServiceTypeIds) {
      if (stId !== b.hub_service_type_id && !(await assertServiceTypeInClinic(b.clinic_id, stId))) {
        return res.status(400).json({ error: `Tipo de serviço inválido: ${stId}` });
      }
    }

    // ── Create series if recurrence requested ─────────────────────────────
    let seriesId: string | null = null;
    let occurrenceDates: string[] = [];

    if (b.recurrence) {
      const rule = b.recurrence;
      const { data: seriesRow, error: serErr } = await supabaseAdmin
        .from('hub_appointment_series')
        .insert({
          clinic_id: b.clinic_id,
          kind: rule.kind,
          interval_value: rule.interval_value ?? 1,
          days_of_week: rule.days_of_week ?? null,
          day_of_month: rule.day_of_month ?? null,
          start_date: b.starts_at.slice(0, 10),
          until_date: rule.until_date ?? null,
          occurrences: rule.occurrences ?? null,
        })
        .select('id')
        .single();
      if (serErr) return res.status(500).json({ error: serErr.message });
      seriesId = (seriesRow as { id: string }).id;
      occurrenceDates = generateOccurrenceDates(b.starts_at.slice(0, 10), rule as RecurrenceRule);
    } else {
      occurrenceDates = [b.starts_at.slice(0, 10)];
    }

    const conflicts: Array<{ date: string; reason: string; conflictingId?: string }> = [];
    const createdIds: string[] = [];

    for (const occDate of occurrenceDates) {
      const startsAt = seriesId ? shiftTimestampToDate(b.starts_at, occDate) : b.starts_at;
      const endsAt = seriesId ? shiftTimestampToDate(b.ends_at, occDate) : b.ends_at;

      const check = await assertNoScheduleConflict(
        b.clinic_id,
        [],
        b.hub_staff_member_id ?? null,
        b.resource_label ?? null,
        b.unit_id ?? null,
        startsAt,
        endsAt,
      );
      if (check.conflict) {
        conflicts.push({ date: occDate, reason: check.reason, conflictingId: check.conflictingId });
        continue;
      }

      const insert = {
        clinic_id: b.clinic_id,
        unit_id: b.unit_id ?? null,
        hub_service_type_id: b.hub_service_type_id,
        hub_staff_member_id: b.hub_staff_member_id ?? null,
        pet_id: b.pet_id ?? null,
        guardian_id: b.guardian_id ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        status: b.status ?? 'confirmed',
        resource_label: b.resource_label ?? null,
        notes: b.notes ?? null,
        appointment_kind: b.appointment_kind ?? 'standard',
        title: b.title ?? null,
        description: b.description ?? null,
        series_id: seriesId,
        series_occurrence_date: seriesId ? occDate : null,
      };

      const { data: apptRow, error: apptErr } = await supabaseAdmin
        .from('hub_appointments')
        .insert(insert)
        .select('id')
        .single();
      if (apptErr) return res.status(500).json({ error: apptErr.message });
      const apptId = (apptRow as { id: string }).id;
      createdIds.push(apptId);

      // insert N:M service lines
      const svcLines =
        b.services && b.services.length > 0
          ? b.services
          : [{ hub_service_type_id: b.hub_service_type_id, duration_minutes: 60 }];

      const svcInsert = svcLines.map((s, idx) => ({
        appointment_id: apptId,
        hub_service_type_id: s.hub_service_type_id,
        duration_minutes: s.duration_minutes,
        order_index: idx,
      }));
      const { error: svcErr } = await supabaseAdmin.from('hub_appointment_services').insert(svcInsert);
      if (svcErr) return res.status(500).json({ error: svcErr.message });

      // pickup_route blocks
      for (const [kind, pickupBlock] of [
        ['before', b.with_pickup_route_before] as const,
        ['after', b.with_pickup_route_after] as const,
      ]) {
        if (!pickupBlock) continue;
        const pStarts = kind === 'before'
          ? (seriesId ? shiftTimestampToDate(pickupBlock.starts_at, occDate) : pickupBlock.starts_at)
          : (seriesId ? shiftTimestampToDate(pickupBlock.starts_at, occDate) : pickupBlock.starts_at);
        const pEnds = seriesId ? shiftTimestampToDate(pickupBlock.ends_at, occDate) : pickupBlock.ends_at;
        const { error: pErr } = await supabaseAdmin.from('hub_appointments').insert({
          clinic_id: b.clinic_id,
          unit_id: b.unit_id ?? null,
          hub_service_type_id: b.hub_service_type_id,
          hub_staff_member_id: pickupBlock.hub_staff_member_id ?? null,
          pet_id: b.pet_id ?? null,
          guardian_id: b.guardian_id ?? null,
          starts_at: pStarts,
          ends_at: pEnds,
          status: b.status ?? 'confirmed',
          resource_label: pickupBlock.resource_label ?? null,
          appointment_kind: 'pickup_route',
          series_id: seriesId,
          series_occurrence_date: seriesId ? occDate : null,
        });
        if (pErr) return res.status(500).json({ error: pErr.message });
      }

      // extra_blocks
      for (const block of b.extra_blocks ?? []) {
        const bStarts = seriesId ? shiftTimestampToDate(block.starts_at, occDate) : block.starts_at;
        const bEnds = seriesId ? shiftTimestampToDate(block.ends_at, occDate) : block.ends_at;
        const firstSvcType = block.services[0]!.hub_service_type_id;
        const { data: blockRow, error: blockErr } = await supabaseAdmin
          .from('hub_appointments')
          .insert({
            clinic_id: b.clinic_id,
            unit_id: b.unit_id ?? null,
            hub_service_type_id: firstSvcType,
            hub_staff_member_id: block.hub_staff_member_id ?? null,
            pet_id: b.pet_id ?? null,
            guardian_id: b.guardian_id ?? null,
            starts_at: bStarts,
            ends_at: bEnds,
            status: block.status ?? b.status ?? 'confirmed',
            resource_label: block.resource_label ?? null,
            notes: block.notes ?? null,
            appointment_kind: 'standard',
            series_id: seriesId,
            series_occurrence_date: seriesId ? occDate : null,
          })
          .select('id')
          .single();
        if (blockErr) return res.status(500).json({ error: blockErr.message });
        const blockId = (blockRow as { id: string }).id;
        const blockSvcInsert = block.services.map((s, idx) => ({
          appointment_id: blockId,
          hub_service_type_id: s.hub_service_type_id,
          duration_minutes: s.duration_minutes,
          order_index: idx,
        }));
        const { error: bSvcErr } = await supabaseAdmin.from('hub_appointment_services').insert(blockSvcInsert);
        if (bSvcErr) return res.status(500).json({ error: bSvcErr.message });
      }
    }

    if (conflicts.length > 0 && createdIds.length === 0) {
      return res.status(409).json({
        error: 'Todos os horários solicitados entram em conflito.',
        conflicts,
      });
    }

    // Fetch and return the main appointment (first created)
    if (createdIds.length === 0) {
      return res.status(409).json({ error: 'Nenhum agendamento criado (conflitos em todas as datas).', conflicts });
    }

    const { data: mainAppt } = await supabaseAdmin
      .from('hub_appointments')
      .select('*')
      .eq('id', createdIds[0]!)
      .single();
    const [enriched] = await enrichAppointments([mainAppt as Record<string, unknown>]);
    return res.status(201).json({
      appointment: enriched,
      created_count: createdIds.length,
      conflict_count: conflicts.length,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    });
  } catch (e: unknown) {
    console.error('createHubAppointment', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar agendamento' });
  }
};

export const patchHubAppointment = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const scope = (req.query.scope as string) ?? 'this';
    if (!['this', 'future', 'all'].includes(scope)) {
      return res.status(400).json({ error: 'scope deve ser this, future ou all' });
    }

    const parsed = patchAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const b = parsed.data;

    const { data: existing, error: exErr } = await supabaseAdmin
      .from('hub_appointments')
      .select('*')
      .eq('id', id)
      .eq('clinic_id', b.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });
    if (!existing) return res.status(404).json({ error: 'Agendamento não encontrado' });

    // soft-delete scoped
    if (b.deleted === true) {
      const now = new Date().toISOString();
      if (scope === 'this') {
        await supabaseAdmin
          .from('hub_appointments')
          .update({ deleted_at: now })
          .eq('id', id)
          .eq('clinic_id', b.clinic_id);
      } else if (scope === 'future' && (existing as Record<string, unknown>).series_id) {
        await supabaseAdmin
          .from('hub_appointments')
          .update({ deleted_at: now })
          .eq('clinic_id', b.clinic_id)
          .eq('series_id', (existing as Record<string, unknown>).series_id as string)
          .gte('starts_at', (existing as Record<string, unknown>).starts_at as string)
          .is('deleted_at', null);
      } else if (scope === 'all' && (existing as Record<string, unknown>).series_id) {
        await supabaseAdmin
          .from('hub_appointments')
          .update({ deleted_at: now })
          .eq('clinic_id', b.clinic_id)
          .eq('series_id', (existing as Record<string, unknown>).series_id as string)
          .is('deleted_at', null);
      } else {
        await supabaseAdmin
          .from('hub_appointments')
          .update({ deleted_at: now })
          .eq('id', id)
          .eq('clinic_id', b.clinic_id);
      }
      return res.status(204).send();
    }

    const starts = b.starts_at ?? (existing.starts_at as string);
    const ends = b.ends_at ?? (existing.ends_at as string);
    if (new Date(ends) <= new Date(starts)) {
      return res.status(400).json({ error: 'ends_at deve ser posterior a starts_at' });
    }

    const nextStaff = b.hub_staff_member_id !== undefined ? b.hub_staff_member_id : (existing.hub_staff_member_id as string | null);
    const nextResource = b.resource_label !== undefined ? b.resource_label : (existing.resource_label as string | null);
    const nextUnit = b.unit_id !== undefined ? b.unit_id : (existing.unit_id as string | null);

    if (b.hub_service_type_id && !(await assertServiceTypeInClinic(b.clinic_id, b.hub_service_type_id))) {
      return res.status(400).json({ error: 'Tipo de serviço inválido' });
    }
    if (b.hub_staff_member_id !== undefined && !(await assertStaffInClinicOptional(b.clinic_id, b.hub_staff_member_id))) {
      return res.status(400).json({ error: 'Profissional inválido' });
    }
    if (b.pet_id !== undefined && !(await assertPetInClinic(b.clinic_id, b.pet_id))) {
      return res.status(400).json({ error: 'Pet inválido' });
    }
    if (b.guardian_id !== undefined && !(await assertGuardianInClinic(b.clinic_id, b.guardian_id))) {
      return res.status(400).json({ error: 'Tutor inválido' });
    }
    if (b.unit_id !== undefined && !(await assertUnitInClinic(b.clinic_id, b.unit_id))) {
      return res.status(400).json({ error: 'Unidade inválida' });
    }

    const check = await assertNoScheduleConflict(b.clinic_id, [id], nextStaff, nextResource, nextUnit, starts, ends);
    if (check.conflict) {
      return res.status(409).json({ error: check.reason });
    }

    const patch: Record<string, unknown> = {};
    if (b.unit_id !== undefined) patch.unit_id = b.unit_id;
    if (b.hub_service_type_id !== undefined) patch.hub_service_type_id = b.hub_service_type_id;
    if (b.hub_staff_member_id !== undefined) patch.hub_staff_member_id = b.hub_staff_member_id;
    if (b.pet_id !== undefined) patch.pet_id = b.pet_id;
    if (b.guardian_id !== undefined) patch.guardian_id = b.guardian_id;
    if (b.starts_at !== undefined) patch.starts_at = b.starts_at;
    if (b.ends_at !== undefined) patch.ends_at = b.ends_at;
    if (b.status !== undefined) patch.status = b.status;
    if (b.resource_label !== undefined) patch.resource_label = b.resource_label;
    if (b.notes !== undefined) patch.notes = b.notes;
    if (b.appointment_kind !== undefined) patch.appointment_kind = b.appointment_kind;
    if (b.title !== undefined) patch.title = b.title;
    if (b.description !== undefined) patch.description = b.description;

    if (Object.keys(patch).length === 0 && !b.services) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    // determine IDs to update based on scope
    let targetIds: string[] = [id];
    const seriesId = (existing as Record<string, unknown>).series_id as string | null;
    if (seriesId && scope !== 'this') {
      let q = supabaseAdmin
        .from('hub_appointments')
        .select('id, starts_at')
        .eq('clinic_id', b.clinic_id)
        .eq('series_id', seriesId)
        .is('deleted_at', null);
      if (scope === 'future') {
        q = q.gte('starts_at', (existing as Record<string, unknown>).starts_at as string);
      }
      const { data: seriesRows } = await q;
      targetIds = (seriesRows ?? []).map((r: Record<string, unknown>) => r.id as string);
    }

    for (const tid of targetIds) {
      if (Object.keys(patch).length > 0) {
        const { error: pErr } = await supabaseAdmin
          .from('hub_appointments')
          .update(patch)
          .eq('id', tid)
          .eq('clinic_id', b.clinic_id);
        if (pErr) return res.status(500).json({ error: pErr.message });
      }

      if (b.services && b.services.length > 0) {
        // replace service lines
        await supabaseAdmin.from('hub_appointment_services').delete().eq('appointment_id', tid);
        const svcInsert = b.services.map((s, idx) => ({
          appointment_id: tid,
          hub_service_type_id: s.hub_service_type_id,
          duration_minutes: s.duration_minutes,
          order_index: idx,
        }));
        const { error: svcErr } = await supabaseAdmin.from('hub_appointment_services').insert(svcInsert);
        if (svcErr) return res.status(500).json({ error: svcErr.message });
      }
    }

    const { data: updated } = await supabaseAdmin
      .from('hub_appointments')
      .select('*')
      .eq('id', id)
      .single();
    const [enriched] = await enrichAppointments([updated as Record<string, unknown>]);
    return res.json({ appointment: enriched, updated_count: targetIds.length });
  } catch (e: unknown) {
    console.error('patchHubAppointment', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar agendamento' });
  }
};

// ── Calendar blocks ───────────────────────────────────────────────────────────

const listBlocksQuery = z.object({
  clinic_id: uuidStr,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listHubAgendaCalendarBlocks = async (req: Request, res: Response) => {
  try {
    const parsed = listBlocksQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, from, to } = parsed.data;
    const { data, error } = await supabaseAdmin
      .from('hub_agenda_calendar_blocks')
      .select('*')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .gte('block_date', from)
      .lte('block_date', to)
      .order('block_date');
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ blocks: data ?? [] });
  } catch (e: unknown) {
    console.error('listHubAgendaCalendarBlocks', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao listar bloqueios' });
  }
};

const upsertBlockSchema = z
  .object({
    clinic_id: uuidStr,
    block_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    label: z.string().trim().min(1).max(200),
    kind: z.enum(['holiday', 'closure', 'reduced_staff', 'other']).optional(),
  })
  .strict();

export const upsertHubAgendaCalendarBlock = async (req: Request, res: Response) => {
  try {
    const parsed = upsertBlockSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;
    const row = {
      clinic_id: b.clinic_id,
      block_date: b.block_date,
      label: b.label,
      kind: b.kind ?? 'closure',
    };
    const { data: existing } = await supabaseAdmin
      .from('hub_agenda_calendar_blocks')
      .select('id')
      .eq('clinic_id', b.clinic_id)
      .eq('block_date', b.block_date)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabaseAdmin
        .from('hub_agenda_calendar_blocks')
        .update({ label: row.label, kind: row.kind, deleted_at: null })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ block: data });
    }

    const { data, error } = await supabaseAdmin.from('hub_agenda_calendar_blocks').insert(row).select('*').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ block: data });
  } catch (e: unknown) {
    console.error('upsertHubAgendaCalendarBlock', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao gravar bloqueio' });
  }
};

export const deleteHubAgendaCalendarBlock = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'ID inválido' });
    const clinic_id = z.string().uuid().safeParse(req.query.clinic_id);
    if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
    const { error } = await supabaseAdmin
      .from('hub_agenda_calendar_blocks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('clinic_id', clinic_id.data);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).send();
  } catch (e: unknown) {
    console.error('deleteHubAgendaCalendarBlock', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao remover bloqueio' });
  }
};
