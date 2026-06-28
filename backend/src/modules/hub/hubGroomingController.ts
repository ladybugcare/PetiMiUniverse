import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { createNotification } from '../../controllers/notificationsController';
import {
  GROOMING_STAGES,
  GROOMING_EVENT_TITLES,
  GROOMING_NEXT_STAGE,
  GROOMING_STAGE_LABELS,
  appointmentStatusForGroomingStage,
  boardStageFromAppointmentStatus,
  canTransitionGroomingStage,
  type GroomingStage,
} from './groomingStages';
import { buildGroomingDisplayTags } from './groomingPetTags';
import {
  syncOpenComandasAfterGroomingClosed,
  financialAdjustmentFlagsForAppointments,
} from './hubComandasController';
import {
  coalesceAppointmentPetId,
  fetchHubPetsMapByIds,
  resolvePrimaryPetIdsByGuardians,
} from './hubDayBoardPets';

const uuidStr = z.string().uuid();
const GROOMING_SERVICE_GROUP = 'banho_tosa';
const groomingStageSchema = z.enum(GROOMING_STAGES);

const SESSION_SELECT = `
  id, clinic_id, unit_id, pet_id, guardian_id, hub_appointment_id, hub_staff_member_id,
  grooming_stage, priority, checked_in_at, started_at, ready_at, delivered_at, closed_at,
  paused_at,
  tutor_notes_snapshot, operational_notes, checklist, created_at, updated_at
`;

const dayBoardQuerySchema = z
  .object({
    clinic_id: uuidStr,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    unit_id: uuidStr.optional(),
    hub_staff_member_id: z.string().optional(),
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

async function getGroomingServiceTypeIds(clinicId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_types')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('service_group', GROOMING_SERVICE_GROUP)
    .is('deleted_at', null);
  if (error) throw error;
  return (data ?? []).map((r: { id: string }) => r.id);
}

function appointmentMatchesGroomingTypes(
  appt: Record<string, unknown>,
  groomingTypeIds: Set<string>,
  lineTypeIdsByAppt: Map<string, string[]>,
): boolean {
  const primary = appt.hub_service_type_id as string | null;
  if (primary && groomingTypeIds.has(primary)) return true;
  const lines = lineTypeIdsByAppt.get(appt.id as string) ?? [];
  return lines.some((id) => groomingTypeIds.has(id));
}

type ServiceTypeRow = {
  id: string;
  name: string;
  code: string;
  service_group: string;
  default_duration_minutes: number | null;
};

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Heurística para filtro «só banho» (sem tosquia no nome/código dos tipos de grooming do item). */
function classifyGroomingServiceMix(
  serviceLines: Array<{ name: string; hub_service_type_id: string }>,
  primarySt: ServiceTypeRow | null,
  stMap: Map<string, ServiceTypeRow>,
): 'banho_only' | 'with_tosa' | 'unknown' {
  const tosaPattern = (text: string) => {
    const t = stripDiacritics(text.toLowerCase());
    return (
      /\btosa\b/.test(t) ||
      /\btosqui/.test(t) ||
      /\bmaquina\b/.test(t) ||
      /\btesoura\b/.test(t) ||
      t.includes('banho_tosa')
    );
  };

  const candidates: Array<{ st: ServiceTypeRow; lineName: string }> = [];
  for (const l of serviceLines) {
    const st = stMap.get(l.hub_service_type_id);
    if (st?.service_group === GROOMING_SERVICE_GROUP) candidates.push({ st, lineName: l.name });
  }
  if (candidates.length === 0 && primarySt?.service_group === GROOMING_SERVICE_GROUP) {
    candidates.push({ st: primarySt, lineName: primarySt.name });
  }
  if (candidates.length === 0) return 'unknown';

  for (const { st, lineName } of candidates) {
    const blob = `${st.code ?? ''} ${st.name} ${lineName}`;
    if (st.code === 'banho_tosa' || tosaPattern(blob)) return 'with_tosa';
  }
  return 'banho_only';
}

async function assertPetInClinic(clinicId: string, petId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('hub_pets')
    .select('id')
    .eq('id', petId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  return !!data;
}

async function logGroomingEvent(opts: {
  clinic_id: string;
  session_id: string;
  event_type: string;
  title?: string;
  body?: string | null;
  payload?: Record<string, unknown>;
  created_by_staff_id?: string | null;
}) {
  await supabaseAdmin.from('hub_grooming_events').insert({
    clinic_id: opts.clinic_id,
    hub_grooming_session_id: opts.session_id,
    event_type: opts.event_type,
    title: opts.title ?? GROOMING_EVENT_TITLES[opts.event_type] ?? opts.event_type,
    body: opts.body ?? null,
    payload: opts.payload ?? {},
    created_by_staff_id: opts.created_by_staff_id ?? null,
  });
}

function stageTimestampsPatch(stage: GroomingStage, now: string): Record<string, string> {
  const patch: Record<string, string> = {};
  if (stage === 'checked_in') patch.checked_in_at = now;
  if (stage === 'in_service') patch.started_at = now;
  if (stage === 'ready') patch.ready_at = now;
  if (stage === 'delivered') patch.delivered_at = now;
  if (stage === 'closed') patch.closed_at = now;
  return patch;
}

async function syncAppointmentStatusForStage(
  clinicId: string,
  appointmentId: string | null | undefined,
  stage: GroomingStage,
) {
  if (!appointmentId) return;
  const nextStatus = appointmentStatusForGroomingStage(stage);
  if (!nextStatus) return;
  await supabaseAdmin
    .from('hub_appointments')
    .update({ status: nextStatus })
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId);
}

function buildServiceLinesForAppointment(
  apptId: string,
  a: Record<string, unknown>,
  lineRowsByAppt: Map<
    string,
    Array<{ id: string; hub_service_type_id: string; order_index: number; executed_at?: string | null }>
  >,
  stMap: Map<string, ServiceTypeRow>,
) {
  const lineDefs = lineRowsByAppt.get(apptId) ?? [];
  const serviceLines: Array<{
    id?: string;
    hub_service_type_id: string;
    name: string;
    duration_minutes: number | null;
    executed_at?: string | null;
  }> = [];

  for (const l of lineDefs) {
    const st = stMap.get(l.hub_service_type_id);
    if (!st || st.service_group !== GROOMING_SERVICE_GROUP) continue;
    serviceLines.push({
      id: l.id,
      hub_service_type_id: st.id,
      name: st.name,
      duration_minutes: st.default_duration_minutes,
      executed_at: l.executed_at ?? null,
    });
  }

  const primarySt = a.hub_service_type_id ? stMap.get(a.hub_service_type_id as string) : null;
  if (serviceLines.length === 0 && primarySt) {
    serviceLines.push({
      hub_service_type_id: primarySt.id,
      name: primarySt.name,
      duration_minutes: primarySt.default_duration_minutes,
    });
  }

  const estimated_duration_minutes = serviceLines.reduce((sum, l) => sum + (l?.duration_minutes ?? 0), 0);
  return { serviceLines, primarySt, estimated_duration_minutes };
}

/** GET /grooming/day-board */
export const getHubGroomingDayBoard = async (req: Request, res: Response) => {
  try {
    const parsed = dayBoardQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, unit_id, hub_staff_member_id } = parsed.data;
    const { from, to, dateYmd } = resolveDayBoardRange(parsed.data);

    const groomingTypeIds = await getGroomingServiceTypeIds(clinic_id);
    const groomingTypeSet = new Set(groomingTypeIds);
    const groomingTypesConfigured = groomingTypeIds.length > 0;

    if (!groomingTypesConfigured) {
      return res.json({
        items: [],
        date: dateYmd,
        clinic_id,
        grooming_types_configured: false,
      });
    }

    let apptQ = supabaseAdmin
      .from('hub_appointments')
      .select(
        'id, clinic_id, unit_id, pet_id, guardian_id, hub_staff_member_id, starts_at, ends_at, status, title, hub_service_type_id, appointment_kind, notes, description',
      )
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .lt('starts_at', to)
      .gt('ends_at', from)
      .order('starts_at', { ascending: true });

    if (unit_id) apptQ = apptQ.eq('unit_id', unit_id);
    if (hub_staff_member_id === '__na__') apptQ = apptQ.is('hub_staff_member_id', null);
    else if (hub_staff_member_id) apptQ = apptQ.eq('hub_staff_member_id', hub_staff_member_id);

    const { data: appointmentsRaw, error: apptErr } = await apptQ;
    if (apptErr) return res.status(500).json({ error: apptErr.message });

    const apptRowsRaw = (appointmentsRaw ?? []) as Record<string, unknown>[];
    const apptIdsAll = apptRowsRaw.map((a) => a.id as string);

    const lineTypeIdsByAppt = new Map<string, string[]>();
    const lineRowsByAppt = new Map<
      string,
      Array<{ id: string; hub_service_type_id: string; order_index: number; executed_at?: string | null }>
    >();

    if (apptIdsAll.length > 0) {
      const { data: lineRows, error: lineErr } = await supabaseAdmin
        .from('hub_appointment_services')
        .select('id, appointment_id, hub_service_type_id, order_index, executed_at')
        .in('appointment_id', apptIdsAll)
        .order('order_index', { ascending: true });
      if (lineErr) return res.status(500).json({ error: lineErr.message });
      for (const row of lineRows ?? []) {
        const aid = (row as { appointment_id: string }).appointment_id;
        const stid = (row as { hub_service_type_id: string }).hub_service_type_id;
        const list = lineTypeIdsByAppt.get(aid) ?? [];
        list.push(stid);
        lineTypeIdsByAppt.set(aid, list);
        const lines = lineRowsByAppt.get(aid) ?? [];
        lines.push({
          id: (row as { id: string }).id,
          hub_service_type_id: stid,
          order_index: (row as { order_index: number }).order_index,
          executed_at: (row as { executed_at?: string | null }).executed_at ?? null,
        });
        lineRowsByAppt.set(aid, lines);
      }
    }

    const appointments = apptRowsRaw.filter((a) =>
      appointmentMatchesGroomingTypes(a, groomingTypeSet, lineTypeIdsByAppt),
    );
    const groomingApptIds = appointments.map((a) => a.id as string);

    let sessQ = supabaseAdmin
      .from('hub_grooming_sessions')
      .select(SESSION_SELECT)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null);

    if (unit_id) sessQ = sessQ.eq('unit_id', unit_id);
    if (hub_staff_member_id === '__na__') sessQ = sessQ.is('hub_staff_member_id', null);
    else if (hub_staff_member_id) sessQ = sessQ.eq('hub_staff_member_id', hub_staff_member_id);

    const { data: sessionsRaw, error: sessErr } = await sessQ;
    if (sessErr) {
      if (sessErr.message?.includes('hub_grooming_sessions')) {
        return res.status(503).json({
          error:
            'Tabela hub_grooming_sessions não encontrada. Execute create_hub_grooming_sessions.sql no Supabase.',
        });
      }
      return res.status(500).json({ error: sessErr.message });
    }

    const sessionsForDay = ((sessionsRaw ?? []) as Record<string, unknown>[]).filter((s) => {
      const aid = s.hub_appointment_id as string | null;
      if (aid && groomingApptIds.includes(aid)) return true;
      const checkedIn = s.checked_in_at as string | null;
      if (checkedIn && checkedIn >= from && checkedIn <= to) return true;
      const created = s.created_at as string;
      return !aid && created >= from && created <= to;
    });

    const sessionByApptId = new Map<string, Record<string, unknown>>();
    for (const s of sessionsForDay) {
      const aid = s.hub_appointment_id as string | null;
      if (aid) sessionByApptId.set(aid, s);
    }

    const allStIds = new Set<string>();
    for (const a of appointments) {
      if (a.hub_service_type_id) allStIds.add(a.hub_service_type_id as string);
      for (const id of lineTypeIdsByAppt.get(a.id as string) ?? []) allStIds.add(id);
    }

    const stMap = new Map<string, ServiceTypeRow>();
    if (allStIds.size > 0) {
      const { data: sts, error: stErr } = await supabaseAdmin
        .from('hub_service_types')
        .select('id, name, code, service_group, default_duration_minutes')
        .in('id', [...allStIds]);
      if (stErr) return res.status(500).json({ error: stErr.message });
      for (const st of sts ?? []) stMap.set((st as ServiceTypeRow).id, st as ServiceTypeRow);
    }

    const petIds = new Set<string>();
    const guIds = new Set<string>();
    const staffIds = new Set<string>();
    for (const a of appointments) {
      if (a.pet_id) petIds.add(a.pet_id as string);
      if (a.guardian_id) guIds.add(a.guardian_id as string);
      if (a.hub_staff_member_id) staffIds.add(a.hub_staff_member_id as string);
    }
    for (const s of sessionsForDay) {
      if (s.pet_id) petIds.add(s.pet_id as string);
      if (s.guardian_id) guIds.add(s.guardian_id as string);
      if (s.hub_staff_member_id) staffIds.add(s.hub_staff_member_id as string);
    }

    const guardiansMissingPet = new Set<string>();
    for (const a of appointments) {
      if (!a.pet_id && a.guardian_id) guardiansMissingPet.add(a.guardian_id as string);
    }
    for (const s of sessionsForDay) {
      if (!s.pet_id && s.guardian_id) guardiansMissingPet.add(s.guardian_id as string);
    }

    const [petByGuardian, gusRes, staffRes] = await Promise.all([
      resolvePrimaryPetIdsByGuardians(clinic_id, guardiansMissingPet),
      guIds.size
        ? supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', [...guIds])
        : Promise.resolve({ data: [] }),
      staffIds.size
        ? supabaseAdmin.from('hub_staff_members').select('id, full_name').in('id', [...staffIds])
        : Promise.resolve({ data: [] }),
    ]);

    for (const pid of petByGuardian.values()) petIds.add(pid);

    const petMap = await fetchHubPetsMapByIds(petIds);
    const guMap = new Map((gusRes.data ?? []).map((g: { id: string }) => [g.id, g]));
    const staffMap = new Map((staffRes.data ?? []).map((s: { id: string }) => [s.id, s]));

    const closedCountsByPet = new Map<string, number>();
    if (petIds.size) {
      const { data: closedRows, error: crErr } = await supabaseAdmin
        .from('hub_grooming_sessions')
        .select('pet_id')
        .eq('clinic_id', clinic_id)
        .in('pet_id', [...petIds])
        .not('closed_at', 'is', null)
        .is('deleted_at', null);
      if (!crErr && closedRows) {
        for (const row of closedRows) {
          const pid = row.pet_id as string;
          closedCountsByPet.set(pid, (closedCountsByPet.get(pid) ?? 0) + 1);
        }
      }
    }

    const enrichPet = (pid: string | null | undefined): Record<string, unknown> | null => {
      if (!pid) return null;
      const raw = petMap.get(pid) as Record<string, unknown> | undefined;
      if (!raw) return null;
      const closedCount = closedCountsByPet.get(pid) ?? 0;
      return { ...raw, is_first_grooming_visit: closedCount === 0 };
    };

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
    const seenSessionIds = new Set<string>();

    for (const a of appointments) {
      const apptId = a.id as string;
      const session = sessionByApptId.get(apptId);
      const { serviceLines, primarySt, estimated_duration_minutes } = buildServiceLinesForAppointment(
        apptId,
        a,
        lineRowsByAppt,
        stMap,
      );
      const grooming_service_mix = classifyGroomingServiceMix(serviceLines, primarySt ?? null, stMap);
      const startsAt = a.starts_at as string;
      const appointment_status = a.status as string;
      const grooming_stage = session
        ? (session.grooming_stage as GroomingStage)
        : boardStageFromAppointmentStatus(appointment_status);
      const is_late =
        ['scheduled', 'checked_in', 'queued'].includes(grooming_stage) &&
        ['pending_confirm', 'confirmed', 'checked_in', 'in_progress'].includes(appointment_status) &&
        new Date(startsAt).getTime() < nowMs;

      const staffId = (session?.hub_staff_member_id as string) ?? (a.hub_staff_member_id as string | null);
      const guardianId = (session?.guardian_id as string | null) ?? (a.guardian_id as string | null);
      let petId = coalesceAppointmentPetId(a.pet_id as string | null, session?.pet_id as string | null);
      if (!petId && guardianId) petId = petByGuardian.get(guardianId) ?? null;

      if (session) {
        seenSessionIds.add(session.id as string);
        items.push({
          kind: 'session',
          session_id: session.id,
          appointment_id: apptId,
          grooming_stage,
          priority: session.priority ?? 0,
          appointment_status,
          starts_at: startsAt,
          ends_at: a.ends_at,
          appointment_kind: a.appointment_kind,
          title: a.title,
          notes: a.notes,
          description: a.description,
          service_type: primarySt
            ? { id: primarySt.id, name: primarySt.name, service_group: primarySt.service_group }
            : null,
          services: serviceLines,
          estimated_duration_minutes: estimated_duration_minutes || null,
          grooming_service_mix,
          paused_at: (session.paused_at as string | null) ?? null,
          is_late,
          operational_notes: session.operational_notes,
          pet: enrichPet(petId),
          guardian: guardianId ? guMap.get(guardianId) : null,
          staff_member: staffId ? staffMap.get(staffId) : null,
          pet_id: petId,
          guardian_id: guardianId,
          hub_staff_member_id: staffId,
          clinical_tags: tagsForPet(petId),
        });
      } else {
        items.push({
          kind: 'appointment_slot',
          appointment_id: apptId,
          grooming_stage,
          priority: 0,
          appointment_status,
          starts_at: startsAt,
          ends_at: a.ends_at,
          appointment_kind: a.appointment_kind,
          title: a.title,
          notes: a.notes,
          description: a.description,
          service_type: primarySt
            ? { id: primarySt.id, name: primarySt.name, service_group: primarySt.service_group }
            : null,
          services: serviceLines,
          estimated_duration_minutes: estimated_duration_minutes || null,
          grooming_service_mix,
          paused_at: null,
          is_late,
          pet: enrichPet(petId),
          guardian: guardianId ? guMap.get(guardianId) : null,
          staff_member: staffId ? staffMap.get(staffId) : null,
          pet_id: petId,
          guardian_id: guardianId,
          hub_staff_member_id: staffId,
          clinical_tags: tagsForPet(petId),
        });
      }
    }

    for (const s of sessionsForDay) {
      if (seenSessionIds.has(s.id as string)) continue;
      const petId = s.pet_id as string;
      const staffId = s.hub_staff_member_id as string | null;
      const checkedIn = (s.checked_in_at as string) || (s.created_at as string);
      items.push({
        kind: 'session',
        session_id: s.id,
        appointment_id: null,
        grooming_stage: s.grooming_stage,
        priority: s.priority ?? 0,
        appointment_status: null,
        starts_at: checkedIn,
        ends_at: checkedIn,
        appointment_kind: 'standard',
        title: 'Avulso',
        service_type: null,
        services: [],
        estimated_duration_minutes: null,
        grooming_service_mix: 'unknown',
        paused_at: (s.paused_at as string | null) ?? null,
        is_late: false,
        is_walk_in: true,
        operational_notes: s.operational_notes,
        pet: enrichPet(petId),
        guardian: s.guardian_id ? guMap.get(s.guardian_id as string) : null,
        staff_member: staffId ? staffMap.get(staffId) : null,
        pet_id: petId,
        guardian_id: s.guardian_id,
        hub_staff_member_id: staffId,
        clinical_tags: tagsForPet(petId),
      });
    }

    items.sort((a, b) => {
      const ta = new Date((a.starts_at as string) || 0).getTime();
      const tb = new Date((b.starts_at as string) || 0).getTime();
      return ta - tb;
    });

    const apptIdsForAdj = [
      ...new Set(items.map((it) => it.appointment_id as string | null | undefined).filter(Boolean) as string[]),
    ];
    const adjByAppt = await financialAdjustmentFlagsForAppointments(clinic_id, apptIdsForAdj);
    for (const item of items) {
      const aid = item.appointment_id as string | null | undefined;
      if (!aid) {
        item.financial_adjustment_pending = false;
        item.comanda_id = null;
        continue;
      }
      const f = adjByAppt.get(aid);
      item.financial_adjustment_pending = f?.financial_adjustment_pending ?? false;
      item.comanda_id = f?.comanda_id ?? null;
    }

    return res.json({
      items,
      date: dateYmd,
      clinic_id,
      grooming_types_configured: true,
    });
  } catch (e: unknown) {
    console.error('getHubGroomingDayBoard', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar fila de Banho & Tosa' });
  }
};

const openFromAppointmentSchema = z
  .object({
    clinic_id: uuidStr,
    hub_appointment_id: uuidStr,
    grooming_stage: groomingStageSchema.optional(),
  })
  .strict();

/** POST /grooming/sessions/open-from-appointment */
export const openHubGroomingSessionFromAppointment = async (req: Request, res: Response) => {
  try {
    const parsed = openFromAppointmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, hub_appointment_id } = parsed.data;
    const targetStage: GroomingStage = parsed.data.grooming_stage ?? 'checked_in';

    const { data: existing } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select(SESSION_SELECT)
      .eq('hub_appointment_id', hub_appointment_id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      return res.json({ session: existing, created: false });
    }

    const { data: appt, error: apptErr } = await supabaseAdmin
      .from('hub_appointments')
      .select('id, clinic_id, unit_id, pet_id, guardian_id, hub_staff_member_id, notes')
      .eq('id', hub_appointment_id)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (apptErr) return res.status(500).json({ error: apptErr.message });
    if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });
    if (!appt.pet_id) return res.status(400).json({ error: 'Agendamento sem pet associado' });

    let tutorSnapshot: string | null = null;
    if (appt.pet_id) {
      const { data: petRow } = await supabaseAdmin
        .from('hub_pets')
        .select('notes')
        .eq('id', appt.pet_id)
        .maybeSingle();
      tutorSnapshot = (petRow as { notes?: string } | null)?.notes ?? null;
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .insert({
        clinic_id,
        unit_id: appt.unit_id,
        pet_id: appt.pet_id,
        guardian_id: appt.guardian_id,
        hub_appointment_id,
        hub_staff_member_id: appt.hub_staff_member_id,
        grooming_stage: targetStage,
        checked_in_at: now,
        tutor_notes_snapshot: tutorSnapshot,
      })
      .select(SESSION_SELECT)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    await logGroomingEvent({
      clinic_id,
      session_id: data.id,
      event_type: 'check_in',
      body: appt.notes,
    });
    await syncAppointmentStatusForStage(clinic_id, hub_appointment_id, targetStage);

    return res.status(201).json({ session: data, created: true });
  } catch (e: unknown) {
    console.error('openHubGroomingSessionFromAppointment', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao abrir sessão' });
  }
};

const createSessionSchema = z
  .object({
    clinic_id: uuidStr,
    pet_id: uuidStr,
    guardian_id: uuidStr.optional().nullable(),
    unit_id: uuidStr.optional().nullable(),
    hub_staff_member_id: uuidStr,
    operational_notes: z.string().trim().max(8000).optional().nullable(),
  })
  .strict();

/** POST /grooming/sessions — walk-in */
export const createHubGroomingSession = async (req: Request, res: Response) => {
  try {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;

    if (!(await assertPetInClinic(b.clinic_id, b.pet_id))) {
      return res.status(400).json({ error: 'Pet inválido' });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .insert({
        clinic_id: b.clinic_id,
        unit_id: b.unit_id ?? null,
        pet_id: b.pet_id,
        guardian_id: b.guardian_id ?? null,
        hub_staff_member_id: b.hub_staff_member_id,
        grooming_stage: 'checked_in',
        checked_in_at: now,
        operational_notes: b.operational_notes ?? null,
      })
      .select(SESSION_SELECT)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    await logGroomingEvent({
      clinic_id: b.clinic_id,
      session_id: data.id,
      event_type: 'check_in',
      created_by_staff_id: b.hub_staff_member_id,
    });

    return res.status(201).json({ session: data });
  } catch (e: unknown) {
    console.error('createHubGroomingSession', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar sessão' });
  }
};

const patchSessionSchema = z
  .object({
    clinic_id: uuidStr,
    grooming_stage: groomingStageSchema.optional(),
    paused: z.boolean().optional(),
    hub_staff_member_id: uuidStr.optional().nullable(),
    priority: z.number().int().min(0).max(99).optional(),
    operational_notes: z.string().trim().max(8000).optional().nullable(),
    checklist: z.record(z.string(), z.object({ done: z.boolean() }).strict()).optional(),
  })
  .strict();

/** PATCH /grooming/sessions/:id */
async function notifyUnitStaffPetReady(opts: {
  clinicId: string;
  unitId: string | null | undefined;
  petId: string | null | undefined;
  sessionId: string;
}): Promise<void> {
  try {
    let staffQuery = supabaseAdmin
      .from('hub_staff_members')
      .select('clinic_user_id')
      .eq('clinic_id', opts.clinicId)
      .eq('has_hub_access', true)
      .not('clinic_user_id', 'is', null)
      .is('deleted_at', null);
    if (opts.unitId) {
      staffQuery = staffQuery.eq('default_unit_id', opts.unitId);
    }
    const { data: staff } = await staffQuery;
    if (!staff?.length) return;

    const clinicUserIds = staff.map((s) => s.clinic_user_id as string).filter(Boolean);
    if (!clinicUserIds.length) return;

    const { data: clinicUsers } = await supabaseAdmin
      .from('clinic_users')
      .select('user_id')
      .in('id', clinicUserIds);
    if (!clinicUsers?.length) return;

    let petName = 'Pet';
    if (opts.petId) {
      const { data: petRow } = await supabaseAdmin
        .from('hub_pets')
        .select('name')
        .eq('id', opts.petId)
        .maybeSingle();
      if (petRow?.name) petName = String(petRow.name);
    }
    const pet = petName;
    await Promise.all(
      clinicUsers.map((cu) =>
        createNotification({
          user_id: cu.user_id as string,
          type: 'hub_pet_ready',
          title: 'Pet pronto para retirada',
          message: `${pet} já está pronto(a) para retirada.`,
          link: `/hub/banho-tosa`,
          entity_type: 'grooming_session',
          entity_id: opts.sessionId,
        }),
      ),
    );
  } catch (e) {
    console.error('notifyUnitStaffPetReady', e);
  }
}

export const patchHubGroomingSession = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'id inválido' });
    const parsed = patchSessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;

    if (b.grooming_stage !== undefined && b.paused !== undefined) {
      return res.status(400).json({ error: 'Envie grooming_stage ou paused, não ambos no mesmo pedido.' });
    }

    const { data: current, error: curErr } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select(SESSION_SELECT)
      .eq('id', id.data)
      .eq('clinic_id', b.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (curErr) return res.status(500).json({ error: curErr.message });
    if (!current) return res.status(404).json({ error: 'Sessão não encontrada' });

    const patch: Record<string, unknown> = {};
    const now = new Date().toISOString();
    let shouldLogPause = false;
    let shouldLogResume = false;

    if (b.grooming_stage !== undefined) {
      const from = current.grooming_stage as GroomingStage;
      const to = b.grooming_stage;
      if (!canTransitionGroomingStage(from, to)) {
        return res.status(400).json({
          error: `Transição inválida: ${GROOMING_STAGE_LABELS[from]} → ${GROOMING_STAGE_LABELS[to]}`,
        });
      }
      patch.grooming_stage = to;
      Object.assign(patch, stageTimestampsPatch(to, now));
      patch.paused_at = null;
    }

    if (b.paused !== undefined) {
      const st = current.grooming_stage as GroomingStage;
      const wasPaused = Boolean((current as Record<string, unknown>).paused_at);
      if (b.paused) {
        if (st !== 'in_service' && st !== 'finishing') {
          return res.status(400).json({ error: 'Só é possível pausar durante atendimento ou finalização.' });
        }
        if (!wasPaused) {
          patch.paused_at = now;
          shouldLogPause = true;
        }
      } else if (wasPaused) {
        patch.paused_at = null;
        shouldLogResume = true;
      }
    }

    if (b.hub_staff_member_id !== undefined) {
      if (b.hub_staff_member_id !== current.hub_staff_member_id) {
        await logGroomingEvent({
          clinic_id: b.clinic_id,
          session_id: id.data,
          event_type: 'staff_change',
          payload: { from: current.hub_staff_member_id, to: b.hub_staff_member_id },
          created_by_staff_id: b.hub_staff_member_id,
        });
      }
      patch.hub_staff_member_id = b.hub_staff_member_id;
    }

    if (b.priority !== undefined) patch.priority = b.priority;
    if (b.operational_notes !== undefined) patch.operational_notes = b.operational_notes;
    if (b.checklist !== undefined) {
      const cur = (current.checklist as Record<string, { done: boolean }>) || {};
      patch.checklist = { ...cur, ...b.checklist };
    }

    if (Object.keys(patch).length === 0) {
      return res.json({ session: current });
    }

    const { data, error } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .update(patch)
      .eq('id', id.data)
      .eq('clinic_id', b.clinic_id)
      .select(SESSION_SELECT)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Sessão não encontrada' });

    if (b.grooming_stage !== undefined) {
      await logGroomingEvent({
        clinic_id: b.clinic_id,
        session_id: id.data,
        event_type: 'stage_change',
        body: `${GROOMING_STAGE_LABELS[current.grooming_stage as GroomingStage]} → ${GROOMING_STAGE_LABELS[b.grooming_stage]}`,
        payload: { from: current.grooming_stage, to: b.grooming_stage },
      });
      await syncAppointmentStatusForStage(
        b.clinic_id,
        current.hub_appointment_id as string | null,
        b.grooming_stage,
      );
      if (b.grooming_stage === 'closed') {
        void syncOpenComandasAfterGroomingClosed(b.clinic_id, id.data);
      }
      if (b.grooming_stage === 'ready') {
        void notifyUnitStaffPetReady({
          clinicId: b.clinic_id,
          unitId: (current as Record<string, unknown>).unit_id as string | null,
          petId: (current as Record<string, unknown>).pet_id as string | null,
          sessionId: id.data,
        });
      }
    }

    if (shouldLogPause) {
      await logGroomingEvent({ clinic_id: b.clinic_id, session_id: id.data, event_type: 'pause' });
    }
    if (shouldLogResume) {
      await logGroomingEvent({ clinic_id: b.clinic_id, session_id: id.data, event_type: 'resume' });
    }

    return res.json({ session: data });
  } catch (e: unknown) {
    console.error('patchHubGroomingSession', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar sessão' });
  }
};

const postEventSchema = z
  .object({
    clinic_id: uuidStr,
    event_type: z.enum([
      'check_in',
      'start',
      'pause',
      'resume',
      'staff_change',
      'stage_change',
      'note',
      'ready',
      'delivered',
      'closed',
    ]),
    title: z.string().trim().max(200).optional(),
    body: z.string().trim().max(4000).optional().nullable(),
    payload: z.record(z.string(), z.unknown()).optional(),
    created_by_staff_id: uuidStr.optional().nullable(),
  })
  .strict();

/** POST /grooming/sessions/:id/events */
export const postHubGroomingSessionEvent = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'id inválido' });
    const parsed = postEventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;

    const { data: session } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select('id')
      .eq('id', id.data)
      .eq('clinic_id', b.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    const { data, error } = await supabaseAdmin
      .from('hub_grooming_events')
      .insert({
        clinic_id: b.clinic_id,
        hub_grooming_session_id: id.data,
        event_type: b.event_type,
        title: b.title ?? GROOMING_EVENT_TITLES[b.event_type] ?? b.event_type,
        body: b.body ?? null,
        payload: b.payload ?? {},
        created_by_staff_id: b.created_by_staff_id ?? null,
      })
      .select('id, event_type, title, body, payload, created_at, created_by_staff_id')
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({ event: data });
  } catch (e: unknown) {
    console.error('postHubGroomingSessionEvent', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao registrar evento' });
  }
};

/** GET /grooming/sessions/:id/events */
export const listHubGroomingSessionEvents = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic_id.success) {
      return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
    }

    const { data, error } = await supabaseAdmin
      .from('hub_grooming_events')
      .select('id, event_type, title, body, payload, created_at, created_by_staff_id')
      .eq('hub_grooming_session_id', id.data)
      .eq('clinic_id', clinic_id.data)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ events: data ?? [] });
  } catch (e: unknown) {
    console.error('listHubGroomingSessionEvents', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao listar eventos' });
  }
};

/** POST /grooming/sessions/:id/advance — avança para o próximo estágio */
export const advanceHubGroomingSession = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const body = z.object({ clinic_id: uuidStr }).strict().safeParse(req.body);
    if (!id.success || !body.success) return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });

    const { data: current } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select('grooming_stage')
      .eq('id', id.data)
      .eq('clinic_id', body.data.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!current) return res.status(404).json({ error: 'Sessão não encontrada' });

    const from = current.grooming_stage as GroomingStage;
    const next = GROOMING_NEXT_STAGE[from];
    if (!next) return res.status(400).json({ error: 'Não há próximo estágio' });

    req.body = { clinic_id: body.data.clinic_id, grooming_stage: next };
    return patchHubGroomingSession(req, res);
  } catch (e: unknown) {
    console.error('advanceHubGroomingSession', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao avançar estágio' });
  }
};
