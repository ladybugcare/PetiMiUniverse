import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { buildGroomingDisplayTags } from './groomingPetTags';
import { HUB_DAY_BOARD_PET_SELECT } from './hubDayBoardPets';
import { calcBoardingNights } from './boardingOperational';
import { uuidStr } from './hubBoardingSchemas';
import {
  buildBoardingTimeline,
  computeAttention,
  computePlanPendencies,
  normalizePlanBlocks,
  normalizeProfileBlocks,
} from './boardingCare';
import { estimateBoardingStayTotal, type BoardingExtraInput } from './boardingBilling';
import {
  loadCareProfileRow,
  loadCarePlanRow,
  loadReservation,
  loadUnitSettings,
  missingTable,
  planStatusFromRow,
  type ReservationRow,
} from './boardingCareService';

const DAILY_LOG_SELECT = `
  id, clinic_id, hub_boarding_reservation_id, log_date,
  fed, medication, walks, mood, notes, created_by_staff_id, created_at
`;

export const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Nome do profissional (hub_staff_members) a partir do usuário autenticado. */
export async function resolveStaffNamesByUserIds(clinicId: string, userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!userIds.length) return names;
  const { data: cus } = await supabaseAdmin
    .from('clinic_users')
    .select('id, user_id')
    .eq('clinic_id', clinicId)
    .in('user_id', userIds);
  const userByClinicUser = new Map((cus ?? []).map((c: { id: string; user_id: string }) => [c.id, c.user_id]));
  if (!userByClinicUser.size) return names;
  const { data: staff } = await supabaseAdmin
    .from('hub_staff_members')
    .select('clinic_user_id, full_name, display_name')
    .eq('clinic_id', clinicId)
    .in('clinic_user_id', [...userByClinicUser.keys()])
    .is('deleted_at', null);
  for (const s of (staff ?? []) as Array<{ clinic_user_id: string; full_name: string; display_name: string | null }>) {
    const uid = userByClinicUser.get(s.clinic_user_id);
    if (uid) names.set(uid, s.display_name || s.full_name);
  }
  return names;
}

/** Lê uma tabela nova de Hotel & Creche; sem a migração, devolve lista vazia. */
export async function safeList<T = Record<string, unknown>>(
  query: PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>,
): Promise<{ rows: T[]; ready: boolean }> {
  const { data, error } = await query;
  if (error) {
    if (missingTable(error)) return { rows: [], ready: false };
    throw new Error(error.message);
  }
  return { rows: (data ?? []) as T[], ready: true };
}

export function carePlanPayload(row: Record<string, unknown> | null) {
  if (!row) return null;
  const token = (row.tutor_token as string | null) ?? null;
  return {
    id: row.id as string,
    ...normalizePlanBlocks(row),
    instructions: (row.instructions as string | null) ?? null,
    block_status: planStatusFromRow(row),
    confirmed_at: (row.confirmed_at as string | null) ?? null,
    tasks_generated_at: (row.tasks_generated_at as string | null) ?? null,
    tutor_link: token
      ? {
          token,
          expires_at: (row.tutor_token_expires_at as string | null) ?? null,
          path: `/cuidados-hospedagem/${token}`,
        }
      : null,
    tutor_submission: (row.tutor_submission as Record<string, unknown> | null) ?? null,
    tutor_submitted_at: (row.tutor_submitted_at as string | null) ?? null,
    tutor_submission_reviewed_at: (row.tutor_submission_reviewed_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

export function careProfilePayload(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    ...normalizeProfileBlocks(row),
    notes: (row.notes as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

async function loadStayBundle(clinicId: string, reservation: ReservationRow) {
  const id = reservation.id;
  const [tasks, incidents, belongings, extras, media, reports, logs, executions] = await Promise.all([
    safeList(
      supabaseAdmin
        .from('hub_boarding_tasks')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('hub_boarding_reservation_id', id)
        .order('scheduled_for', { ascending: true, nullsFirst: false }),
    ),
    safeList(
      supabaseAdmin
        .from('hub_boarding_incidents')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('hub_boarding_reservation_id', id)
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false }),
    ),
    safeList(
      supabaseAdmin
        .from('hub_boarding_belongings')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('hub_boarding_reservation_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
    ),
    safeList<BoardingExtraInput & Record<string, unknown>>(
      supabaseAdmin
        .from('hub_boarding_extras')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('hub_boarding_reservation_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
    ),
    safeList(
      supabaseAdmin
        .from('hub_boarding_media')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('hub_boarding_reservation_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
    ),
    safeList(
      supabaseAdmin
        .from('hub_boarding_tutor_reports')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('hub_boarding_reservation_id', id)
        .order('sent_at', { ascending: false }),
    ),
    safeList(
      supabaseAdmin
        .from('hub_boarding_daily_logs')
        .select(DAILY_LOG_SELECT)
        .eq('hub_boarding_reservation_id', id)
        .eq('clinic_id', clinicId)
        .order('log_date', { ascending: false }),
    ),
    safeList(
      supabaseAdmin
        .from('hub_boarding_task_executions')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('hub_boarding_reservation_id', id)
        .order('executed_at', { ascending: false })
        .limit(300),
    ),
  ]);
  return { tasks, incidents, belongings, extras, media, reports, logs, executions };
}

// ─── GET /boarding/reservations/:id/drawer ─────────────────────────────────

export const getHubBoardingReservationDrawer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { clinic_id } = req.query as { clinic_id?: string };
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    const clinicParsed = uuidStr.safeParse(clinic_id);
    if (!clinicParsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinicId = clinicParsed.data;

    const reservation = await loadReservation(clinicId, id);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });

    const petId = reservation.pet_id;
    const guardianId = reservation.guardian_id;

    const [petRes, guRes, flagsRes, profileRow, planRow, settings, bundle] = await Promise.all([
      supabaseAdmin.from('hub_pets').select(HUB_DAY_BOARD_PET_SELECT).eq('id', petId).maybeSingle(),
      guardianId
        ? supabaseAdmin.from('hub_guardians').select('id, full_name, phone').eq('id', guardianId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        .from('hub_pet_clinical_flags')
        .select('pet_id, flag_key, label')
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId)
        .eq('active', true)
        .is('deleted_at', null),
      loadCareProfileRow(clinicId, petId),
      loadCarePlanRow(clinicId, id),
      loadUnitSettings(clinicId, reservation.unit_id),
      loadStayBundle(clinicId, reservation),
    ]);
    if (petRes.error) return res.status(500).json({ error: petRes.error.message });

    const pet = petRes.data as { notes?: string | null; behavior_tags?: string[] | null } | null;
    const flags = (flagsRes.data ?? []).map((f: { flag_key: unknown; label: unknown }) => ({
      flag_key: String(f.flag_key),
      label: String(f.label || ''),
    }));
    const clinicalTags = buildGroomingDisplayTags(flags, pet?.notes ?? null, pet?.behavior_tags);

    let space: Record<string, unknown> | null = null;
    if (reservation.space_id) {
      const { data: sp } = await supabaseAdmin
        .from('hub_boarding_spaces')
        .select('id, name, kind, mode, capacity')
        .eq('id', reservation.space_id)
        .maybeSingle();
      space = (sp as Record<string, unknown> | null) ?? null;
    }

    let serviceType: { id: string; name: string } | null = null;
    if (reservation.hub_service_type_id) {
      const { data: st } = await supabaseAdmin
        .from('hub_service_types')
        .select('id, name')
        .eq('id', reservation.hub_service_type_id)
        .maybeSingle();
      serviceType = (st as { id: string; name: string } | null) ?? null;
    }

    const estimate = estimateBoardingStayTotal(
      {
        id: reservation.id,
        mode: reservation.mode,
        daycare_period: reservation.daycare_period ?? null,
        expected_check_in: reservation.expected_check_in,
        expected_check_out: reservation.expected_check_out,
        checked_in_at: reservation.checked_in_at,
        checked_out_at: reservation.checked_out_at,
        daily_rate_cents: reservation.daily_rate_cents,
      },
      bundle.extras.rows,
      { cutoffTime: settings.checkout_cutoff_time },
    );

    const pendencies = computePlanPendencies(planRow ? { block_status: planStatusFromRow(planRow) } : null, reservation.mode);
    const tasks = bundle.tasks.rows as Array<Record<string, unknown>>;
    const incidents = bundle.incidents.rows as Array<Record<string, unknown>>;
    const belongings = bundle.belongings.rows as Array<Record<string, unknown>>;
    const nowYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const attention = computeAttention({
      stage: reservation.status,
      pendencies,
      tutorSubmissionPending: Boolean(planRow?.tutor_submitted_at && !planRow?.tutor_submission_reviewed_at),
      openIncidents: incidents.filter((i) => i.status === 'open').map((i) => ({ severity: String(i.severity) })),
      tasks: tasks
        .filter((t) => t.task_date === nowYmd)
        .map((t) => ({
          kind: String(t.kind),
          status: String(t.status),
          scheduled_for: (t.scheduled_for as string | null) ?? null,
          outcome: (t.outcome as string | null) ?? null,
        })),
      isLate:
        reservation.status === 'checked_in' &&
        !reservation.checked_out_at &&
        Boolean(reservation.expected_check_out && new Date(reservation.expected_check_out).getTime() < Date.now()),
      missingBelongings: belongings.filter((b) => b.checkout_status === 'missing').length,
    });

    return res.json({
      reservation,
      pet: pet ?? null,
      guardian: guRes.data ?? null,
      clinical_tags: clinicalTags,
      nights_count:
        reservation.mode === 'hotel'
          ? calcBoardingNights(reservation.checked_in_at, reservation.checked_out_at)
          : reservation.checked_in_at
            ? 1
            : 0,
      daily_logs: bundle.logs.rows,
      care_profile: careProfilePayload(profileRow),
      care_plan: carePlanPayload(planRow),
      plan_pendencies: pendencies,
      attention,
      tasks,
      incidents,
      belongings,
      extras: bundle.extras.rows,
      media: bundle.media.rows,
      tutor_reports: bundle.reports.rows,
      space,
      service_type: serviceType,
      unit_settings: settings,
      pricing: {
        daily_rate_cents: reservation.daily_rate_cents ?? null,
        rate_source: (reservation.rate_source as string | null | undefined) ?? null,
        cutoff_time: settings.checkout_cutoff_time,
        ...estimate,
      },
      migrations_ready: bundle.tasks.ready && bundle.incidents.ready && bundle.extras.ready,
    });
  } catch (e: unknown) {
    console.error('getHubBoardingReservationDrawer', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar a estadia' });
  }
};

// ─── GET /boarding/reservations/:id/timeline ───────────────────────────────

export const getHubBoardingReservationTimeline = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const clinicParsed = uuidStr.safeParse((req.query as { clinic_id?: string }).clinic_id);
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
    if (!clinicParsed.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const clinicId = clinicParsed.data;

    const reservation = await loadReservation(clinicId, id);
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada' });
    const bundle = await loadStayBundle(clinicId, reservation);
    const titleById = new Map(
      (bundle.tasks.rows as Array<{ id: string; title: string }>).map((t) => [t.id, t.title]),
    );

    const timeline = buildBoardingTimeline({
      reservation,
      executions: (bundle.executions.rows as Array<Record<string, unknown>>).map((e) => ({
        id: e.id as string,
        executed_at: e.executed_at as string,
        outcome: (e.outcome as string | null) ?? null,
        undone: Boolean(e.undone),
        notes: (e.notes as string | null) ?? null,
        task_title: titleById.get(e.hub_boarding_task_id as string) ?? 'Tarefa',
        executed_by_user_id: (e.executed_by_user_id as string | null) ?? null,
      })),
      incidents: bundle.incidents.rows as never,
      media: bundle.media.rows as never,
      tutorReports: bundle.reports.rows as never,
      belongings: bundle.belongings.rows as never,
      legacyLogs: bundle.logs.rows as never,
    });

    const actorIds = [...new Set(timeline.map((t) => t.actor_user_id).filter(Boolean))] as string[];
    const actorNames = await resolveStaffNamesByUserIds(clinicId, actorIds);

    return res.json({
      timeline: timeline.map((t) => ({
        ...t,
        actor_name: t.actor_user_id ? actorNames.get(t.actor_user_id) ?? null : null,
      })),
    });
  } catch (e: unknown) {
    console.error('getHubBoardingReservationTimeline', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar linha do tempo' });
  }
};

// ─── POST /boarding/reservations/:id/daily-logs (legado — escrita desligada) ─

/**
 * Escrita descontinuada. A operação nova usa hub_boarding_tasks / executions.
 * Leituras de daily_logs antigos seguem no drawer e na timeline.
 */
export const postHubBoardingDailyLog = async (_req: Request, res: Response) => {
  return res.status(410).json({
    error:
      'Relatório diário por checklist foi descontinuado. Use as tarefas da estadia (POST /boarding/tasks/:id/execute).',
    code: 'BOARDING_DAILY_LOGS_GONE',
  });
};
