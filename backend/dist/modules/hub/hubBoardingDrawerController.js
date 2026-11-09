"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubBoardingDailyLog = exports.getHubBoardingReservationTimeline = exports.getHubBoardingReservationDrawer = exports.UUID_RE = void 0;
exports.resolveStaffNamesByUserIds = resolveStaffNamesByUserIds;
exports.safeList = safeList;
exports.carePlanPayload = carePlanPayload;
exports.careProfilePayload = careProfilePayload;
const supabase_1 = require("../../config/supabase");
const groomingPetTags_1 = require("./groomingPetTags");
const hubDayBoardPets_1 = require("./hubDayBoardPets");
const boardingOperational_1 = require("./boardingOperational");
const hubBoardingSchemas_1 = require("./hubBoardingSchemas");
const boardingCare_1 = require("./boardingCare");
const boardingBilling_1 = require("./boardingBilling");
const boardingCareService_1 = require("./boardingCareService");
const DAILY_LOG_SELECT = `
  id, clinic_id, hub_boarding_reservation_id, log_date,
  fed, medication, walks, mood, notes, created_by_staff_id, created_at
`;
exports.UUID_RE = /^[0-9a-f-]{36}$/i;
/** Nome do profissional (hub_staff_members) a partir do usuário autenticado. */
async function resolveStaffNamesByUserIds(clinicId, userIds) {
    const names = new Map();
    if (!userIds.length)
        return names;
    const { data: cus } = await supabase_1.supabaseAdmin
        .from('clinic_users')
        .select('id, user_id')
        .eq('clinic_id', clinicId)
        .in('user_id', userIds);
    const userByClinicUser = new Map((cus ?? []).map((c) => [c.id, c.user_id]));
    if (!userByClinicUser.size)
        return names;
    const { data: staff } = await supabase_1.supabaseAdmin
        .from('hub_staff_members')
        .select('clinic_user_id, full_name, display_name')
        .eq('clinic_id', clinicId)
        .in('clinic_user_id', [...userByClinicUser.keys()])
        .is('deleted_at', null);
    for (const s of (staff ?? [])) {
        const uid = userByClinicUser.get(s.clinic_user_id);
        if (uid)
            names.set(uid, s.display_name || s.full_name);
    }
    return names;
}
/** Lê uma tabela nova de Hotel & Creche; sem a migração, devolve lista vazia. */
async function safeList(query) {
    const { data, error } = await query;
    if (error) {
        if ((0, boardingCareService_1.missingTable)(error))
            return { rows: [], ready: false };
        throw new Error(error.message);
    }
    return { rows: (data ?? []), ready: true };
}
function carePlanPayload(row) {
    if (!row)
        return null;
    const token = row.tutor_token ?? null;
    return {
        id: row.id,
        ...(0, boardingCare_1.normalizePlanBlocks)(row),
        instructions: row.instructions ?? null,
        block_status: (0, boardingCareService_1.planStatusFromRow)(row),
        confirmed_at: row.confirmed_at ?? null,
        tasks_generated_at: row.tasks_generated_at ?? null,
        tutor_link: token
            ? {
                token,
                expires_at: row.tutor_token_expires_at ?? null,
                path: `/cuidados-hospedagem/${token}`,
            }
            : null,
        tutor_submission: row.tutor_submission ?? null,
        tutor_submitted_at: row.tutor_submitted_at ?? null,
        tutor_submission_reviewed_at: row.tutor_submission_reviewed_at ?? null,
        updated_at: row.updated_at ?? null,
    };
}
function careProfilePayload(row) {
    if (!row)
        return null;
    return {
        ...(0, boardingCare_1.normalizeProfileBlocks)(row),
        notes: row.notes ?? null,
        updated_at: row.updated_at ?? null,
    };
}
async function loadStayBundle(clinicId, reservation) {
    const id = reservation.id;
    const [tasks, incidents, belongings, extras, media, reports, logs, executions] = await Promise.all([
        safeList(supabase_1.supabaseAdmin
            .from('hub_boarding_tasks')
            .select('*')
            .eq('clinic_id', clinicId)
            .eq('hub_boarding_reservation_id', id)
            .order('scheduled_for', { ascending: true, nullsFirst: false })),
        safeList(supabase_1.supabaseAdmin
            .from('hub_boarding_incidents')
            .select('*')
            .eq('clinic_id', clinicId)
            .eq('hub_boarding_reservation_id', id)
            .is('deleted_at', null)
            .order('occurred_at', { ascending: false })),
        safeList(supabase_1.supabaseAdmin
            .from('hub_boarding_belongings')
            .select('*')
            .eq('clinic_id', clinicId)
            .eq('hub_boarding_reservation_id', id)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })),
        safeList(supabase_1.supabaseAdmin
            .from('hub_boarding_extras')
            .select('*')
            .eq('clinic_id', clinicId)
            .eq('hub_boarding_reservation_id', id)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })),
        safeList(supabase_1.supabaseAdmin
            .from('hub_boarding_media')
            .select('*')
            .eq('clinic_id', clinicId)
            .eq('hub_boarding_reservation_id', id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })),
        safeList(supabase_1.supabaseAdmin
            .from('hub_boarding_tutor_reports')
            .select('*')
            .eq('clinic_id', clinicId)
            .eq('hub_boarding_reservation_id', id)
            .order('sent_at', { ascending: false })),
        safeList(supabase_1.supabaseAdmin
            .from('hub_boarding_daily_logs')
            .select(DAILY_LOG_SELECT)
            .eq('hub_boarding_reservation_id', id)
            .eq('clinic_id', clinicId)
            .order('log_date', { ascending: false })),
        safeList(supabase_1.supabaseAdmin
            .from('hub_boarding_task_executions')
            .select('*')
            .eq('clinic_id', clinicId)
            .eq('hub_boarding_reservation_id', id)
            .order('executed_at', { ascending: false })
            .limit(300)),
    ]);
    return { tasks, incidents, belongings, extras, media, reports, logs, executions };
}
// ─── GET /boarding/reservations/:id/drawer ─────────────────────────────────
const getHubBoardingReservationDrawer = async (req, res) => {
    try {
        const { id } = req.params;
        const { clinic_id } = req.query;
        if (!id || !exports.UUID_RE.test(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        const clinicParsed = hubBoardingSchemas_1.uuidStr.safeParse(clinic_id);
        if (!clinicParsed.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinicId = clinicParsed.data;
        const reservation = await (0, boardingCareService_1.loadReservation)(clinicId, id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        const petId = reservation.pet_id;
        const guardianId = reservation.guardian_id;
        const [petRes, guRes, flagsRes, profileRow, planRow, settings, bundle] = await Promise.all([
            supabase_1.supabaseAdmin.from('hub_pets').select(hubDayBoardPets_1.HUB_DAY_BOARD_PET_SELECT).eq('id', petId).maybeSingle(),
            guardianId
                ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name, phone').eq('id', guardianId).maybeSingle()
                : Promise.resolve({ data: null }),
            supabase_1.supabaseAdmin
                .from('hub_pet_clinical_flags')
                .select('pet_id, flag_key, label')
                .eq('clinic_id', clinicId)
                .eq('pet_id', petId)
                .eq('active', true)
                .is('deleted_at', null),
            (0, boardingCareService_1.loadCareProfileRow)(clinicId, petId),
            (0, boardingCareService_1.loadCarePlanRow)(clinicId, id),
            (0, boardingCareService_1.loadUnitSettings)(clinicId, reservation.unit_id),
            loadStayBundle(clinicId, reservation),
        ]);
        if (petRes.error)
            return res.status(500).json({ error: petRes.error.message });
        const pet = petRes.data;
        const flags = (flagsRes.data ?? []).map((f) => ({
            flag_key: String(f.flag_key),
            label: String(f.label || ''),
        }));
        const clinicalTags = (0, groomingPetTags_1.buildGroomingDisplayTags)(flags, pet?.notes ?? null, pet?.behavior_tags);
        let space = null;
        if (reservation.space_id) {
            const { data: sp } = await supabase_1.supabaseAdmin
                .from('hub_boarding_spaces')
                .select('id, name, kind, mode, capacity')
                .eq('id', reservation.space_id)
                .maybeSingle();
            space = sp ?? null;
        }
        let serviceType = null;
        if (reservation.hub_service_type_id) {
            const { data: st } = await supabase_1.supabaseAdmin
                .from('hub_service_types')
                .select('id, name')
                .eq('id', reservation.hub_service_type_id)
                .maybeSingle();
            serviceType = st ?? null;
        }
        const estimate = (0, boardingBilling_1.estimateBoardingStayTotal)({
            id: reservation.id,
            mode: reservation.mode,
            daycare_period: reservation.daycare_period ?? null,
            expected_check_in: reservation.expected_check_in,
            expected_check_out: reservation.expected_check_out,
            checked_in_at: reservation.checked_in_at,
            checked_out_at: reservation.checked_out_at,
            daily_rate_cents: reservation.daily_rate_cents,
        }, bundle.extras.rows, { cutoffTime: settings.checkout_cutoff_time });
        const pendencies = (0, boardingCare_1.computePlanPendencies)(planRow ? { block_status: (0, boardingCareService_1.planStatusFromRow)(planRow) } : null, reservation.mode);
        const tasks = bundle.tasks.rows;
        const incidents = bundle.incidents.rows;
        const belongings = bundle.belongings.rows;
        const nowYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
        const attention = (0, boardingCare_1.computeAttention)({
            stage: reservation.status,
            pendencies,
            tutorSubmissionPending: Boolean(planRow?.tutor_submitted_at && !planRow?.tutor_submission_reviewed_at),
            openIncidents: incidents.filter((i) => i.status === 'open').map((i) => ({ severity: String(i.severity) })),
            tasks: tasks
                .filter((t) => t.task_date === nowYmd)
                .map((t) => ({
                kind: String(t.kind),
                status: String(t.status),
                scheduled_for: t.scheduled_for ?? null,
                outcome: t.outcome ?? null,
            })),
            isLate: (reservation.status === 'checked_in' ||
                reservation.status === 'checkout_preparing' ||
                reservation.status === 'ready_for_handoff') &&
                !reservation.checked_out_at &&
                Boolean(reservation.expected_check_out && new Date(reservation.expected_check_out).getTime() < Date.now()),
            missingBelongings: belongings.filter((b) => b.checkout_status === 'missing').length,
        });
        return res.json({
            reservation,
            pet: pet ?? null,
            guardian: guRes.data ?? null,
            clinical_tags: clinicalTags,
            nights_count: reservation.mode === 'hotel'
                ? (0, boardingOperational_1.calcBoardingNights)(reservation.checked_in_at, reservation.checked_out_at)
                : reservation.checked_in_at
                    ? 1
                    : 0,
            daily_logs: bundle.logs.rows,
            care_profile: careProfilePayload(profileRow),
            care_plan: carePlanPayload(planRow),
            plan_pendencies: pendencies,
            attention,
            tasks: tasks.map((t) => ({
                ...t,
                title: typeof t.title === 'string' ? t.title : String(t.title ?? ''),
                details: (0, boardingCare_1.taskDetailsDisplayText)(t.details),
            })),
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
                rate_source: reservation.rate_source ?? null,
                cutoff_time: settings.checkout_cutoff_time,
                ...estimate,
            },
            migrations_ready: bundle.tasks.ready && bundle.incidents.ready && bundle.extras.ready,
        });
    }
    catch (e) {
        console.error('getHubBoardingReservationDrawer', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar a estadia' });
    }
};
exports.getHubBoardingReservationDrawer = getHubBoardingReservationDrawer;
// ─── GET /boarding/reservations/:id/timeline ───────────────────────────────
const getHubBoardingReservationTimeline = async (req, res) => {
    try {
        const { id } = req.params;
        const clinicParsed = hubBoardingSchemas_1.uuidStr.safeParse(req.query.clinic_id);
        if (!id || !exports.UUID_RE.test(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        if (!clinicParsed.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const clinicId = clinicParsed.data;
        const reservation = await (0, boardingCareService_1.loadReservation)(clinicId, id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        const bundle = await loadStayBundle(clinicId, reservation);
        const titleById = new Map(bundle.tasks.rows.map((t) => [t.id, t.title]));
        const timeline = (0, boardingCare_1.buildBoardingTimeline)({
            reservation,
            executions: bundle.executions.rows.map((e) => ({
                id: e.id,
                executed_at: e.executed_at,
                outcome: e.outcome ?? null,
                undone: Boolean(e.undone),
                notes: e.notes ?? null,
                task_title: titleById.get(e.hub_boarding_task_id) ?? 'Tarefa',
                executed_by_user_id: e.executed_by_user_id ?? null,
            })),
            incidents: bundle.incidents.rows,
            media: bundle.media.rows,
            tutorReports: bundle.reports.rows,
            belongings: bundle.belongings.rows,
            legacyLogs: bundle.logs.rows,
        });
        const actorIds = [...new Set(timeline.map((t) => t.actor_user_id).filter(Boolean))];
        const actorNames = await resolveStaffNamesByUserIds(clinicId, actorIds);
        return res.json({
            timeline: timeline.map((t) => ({
                ...t,
                actor_name: t.actor_user_id ? actorNames.get(t.actor_user_id) ?? null : null,
            })),
        });
    }
    catch (e) {
        console.error('getHubBoardingReservationTimeline', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar linha do tempo' });
    }
};
exports.getHubBoardingReservationTimeline = getHubBoardingReservationTimeline;
// ─── POST /boarding/reservations/:id/daily-logs (legado — escrita desligada) ─
/**
 * Escrita descontinuada. A operação nova usa hub_boarding_tasks / executions.
 * Leituras de daily_logs antigos seguem no drawer e na timeline.
 */
const postHubBoardingDailyLog = async (_req, res) => {
    return res.status(410).json({
        error: 'Relatório diário por checklist foi descontinuado. Use as tarefas da estadia (POST /boarding/tasks/:id/execute).',
        code: 'BOARDING_DAILY_LOGS_GONE',
    });
};
exports.postHubBoardingDailyLog = postHubBoardingDailyLog;
