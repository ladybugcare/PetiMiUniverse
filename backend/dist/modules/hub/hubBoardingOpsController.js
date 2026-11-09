"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteHubBoardingSpace = exports.patchHubBoardingSpace = exports.postHubBoardingSpace = exports.getHubBoardingSpaces = exports.postHubBoardingTutorReport = exports.getHubBoardingTutorReport = exports.postHubBoardingHandoffAcknowledge = exports.postHubBoardingHandoff = exports.getHubBoardingHandoffs = exports.getHubBoardingOpsBoard = void 0;
exports.buildOpsBoard = buildOpsBoard;
const supabase_1 = require("../../config/supabase");
const boardingCare_1 = require("./boardingCare");
const boardingBilling_1 = require("./boardingBilling");
const boardingOperational_1 = require("./boardingOperational");
const boardingCareService_1 = require("./boardingCareService");
const boardingPricing_1 = require("./boardingPricing");
const hubBoardingController_1 = require("./hubBoardingController");
const hubBoardingDrawerController_1 = require("./hubBoardingDrawerController");
const hubBoardingSchemas_1 = require("./hubBoardingSchemas");
function inRange(iso, from, to) {
    if (!iso)
        return false;
    const t = new Date(iso).getTime();
    return t >= new Date(from).getTime() && t <= new Date(to).getTime();
}
// ─── Montagem do painel ───────────────────────────────────────────────────
async function buildOpsBoard(args) {
    const { clinicId, unitId, date } = args;
    const { from, to } = (0, boardingOperational_1.dayBoundsFromYmdSaoPaulo)(date);
    const now = Date.now();
    const [{ items, boardingTypesConfigured, reservationsTableExists }, settings] = await Promise.all([
        (0, hubBoardingController_1.loadBoardingDayItems)({ clinicId, unitId, from, to }),
        (0, boardingCareService_1.loadUnitSettings)(clinicId, unitId),
    ]);
    const rsvIds = items.map((i) => i.reservation_id).filter(Boolean);
    const petIdsWithoutRsv = [
        ...new Set(items.filter((i) => !i.reservation_id && i.pet_id).map((i) => i.pet_id)),
    ];
    const [plans, tasks, incidents, belongings, spaces, profiles, lastHandoff] = await Promise.all([
        rsvIds.length
            ? (0, hubBoardingDrawerController_1.safeList)(supabase_1.supabaseAdmin
                .from('hub_boarding_care_plans')
                .select('hub_boarding_reservation_id, block_status, handling, recreation, tutor_submitted_at, tutor_submission_reviewed_at')
                .in('hub_boarding_reservation_id', rsvIds))
            : Promise.resolve({ rows: [], ready: true }),
        rsvIds.length
            ? (0, hubBoardingDrawerController_1.safeList)(supabase_1.supabaseAdmin
                .from('hub_boarding_tasks')
                .select('*')
                .eq('clinic_id', clinicId)
                .eq('task_date', date)
                .in('hub_boarding_reservation_id', rsvIds)
                .order('scheduled_for', { ascending: true, nullsFirst: false }))
            : Promise.resolve({ rows: [], ready: true }),
        rsvIds.length
            ? (0, hubBoardingDrawerController_1.safeList)(supabase_1.supabaseAdmin
                .from('hub_boarding_incidents')
                .select('id, hub_boarding_reservation_id, kind, severity, description, status, occurred_at')
                .eq('clinic_id', clinicId)
                .in('hub_boarding_reservation_id', rsvIds)
                .eq('status', 'open')
                .is('deleted_at', null))
            : Promise.resolve({ rows: [], ready: true }),
        rsvIds.length
            ? (0, hubBoardingDrawerController_1.safeList)(supabase_1.supabaseAdmin
                .from('hub_boarding_belongings')
                .select('hub_boarding_reservation_id, checkout_status, quantity')
                .eq('clinic_id', clinicId)
                .in('hub_boarding_reservation_id', rsvIds)
                .is('deleted_at', null))
            : Promise.resolve({ rows: [], ready: true }),
        (() => {
            let q = supabase_1.supabaseAdmin
                .from('hub_boarding_spaces')
                .select('id, unit_id, name, kind, mode, capacity, active, sort_order')
                .eq('clinic_id', clinicId)
                .eq('active', true)
                .is('deleted_at', null)
                .order('sort_order', { ascending: true });
            if (unitId)
                q = q.eq('unit_id', unitId);
            return (0, hubBoardingDrawerController_1.safeList)(q);
        })(),
        petIdsWithoutRsv.length
            ? (0, hubBoardingDrawerController_1.safeList)(supabase_1.supabaseAdmin
                .from('hub_pet_care_profiles')
                .select('*')
                .eq('clinic_id', clinicId)
                .in('pet_id', petIdsWithoutRsv))
            : Promise.resolve({ rows: [], ready: true }),
        (() => {
            let q = supabase_1.supabaseAdmin
                .from('hub_boarding_shift_handoffs')
                .select('*')
                .eq('clinic_id', clinicId)
                .order('created_at', { ascending: false })
                .limit(1);
            if (unitId)
                q = q.eq('unit_id', unitId);
            return (0, hubBoardingDrawerController_1.safeList)(q);
        })(),
    ]);
    const planByRsv = new Map(plans.rows.map((p) => [p.hub_boarding_reservation_id, p]));
    const profileByPet = new Map(profiles.rows.map((p) => [p.pet_id, p]));
    const tasksByRsv = new Map();
    for (const t of tasks.rows) {
        const k = t.hub_boarding_reservation_id;
        tasksByRsv.set(k, [...(tasksByRsv.get(k) ?? []), t]);
    }
    const incidentsByRsv = new Map();
    for (const i of incidents.rows) {
        const k = i.hub_boarding_reservation_id;
        incidentsByRsv.set(k, [...(incidentsByRsv.get(k) ?? []), i]);
    }
    const belongingsByRsv = new Map();
    for (const b of belongings.rows) {
        const k = b.hub_boarding_reservation_id;
        belongingsByRsv.set(k, [...(belongingsByRsv.get(k) ?? []), b]);
    }
    const spaceById = new Map(spaces.rows.map((s) => [s.id, s]));
    const shiftByKey = new Map(settings.daycare_shifts.map((s) => [s.key, s]));
    const stays = items.map((item) => {
        const rid = item.reservation_id;
        const plan = rid ? planByRsv.get(rid) ?? null : null;
        const stage = item.boarding_stage;
        let blockStatus = plan ? (plan.block_status ?? {}) : null;
        let handling = plan ? (0, boardingCare_1.normalizeHandling)(plan.handling) : null;
        if (!plan && item.pet_id) {
            const prof = profileByPet.get(item.pet_id);
            const inherited = (0, boardingCare_1.buildPlanFromProfile)(prof ? (0, boardingCare_1.normalizeProfileBlocks)(prof) : null);
            blockStatus = inherited.block_status;
            handling = inherited.blocks.handling;
        }
        const pendencies = (0, boardingCare_1.computePlanPendencies)(blockStatus ? { block_status: blockStatus } : null, item.mode);
        const stayTasks = rid ? tasksByRsv.get(rid) ?? [] : [];
        const openIncidents = rid ? incidentsByRsv.get(rid) ?? [] : [];
        const stayBelongings = rid ? belongingsByRsv.get(rid) ?? [] : [];
        const attention = (0, boardingCare_1.computeAttention)({
            stage,
            pendencies,
            tutorSubmissionPending: Boolean(plan?.tutor_submitted_at && !plan?.tutor_submission_reviewed_at),
            openIncidents: openIncidents.map((i) => ({ severity: String(i.severity) })),
            tasks: stayTasks.map((t) => ({
                kind: String(t.kind),
                status: String(t.status),
                scheduled_for: t.scheduled_for ?? null,
                outcome: t.outcome ?? null,
            })),
            isLate: item.is_late,
            missingBelongings: stayBelongings.filter((b) => b.checkout_status === 'missing').length,
            nowMs: now,
        });
        const pendingTasks = stayTasks.filter((t) => t.status === 'pending');
        const next = pendingTasks[0] ?? null;
        const space = item.space_id ? spaceById.get(item.space_id) ?? null : null;
        const shift = item.daycare_shift_key ? shiftByKey.get(item.daycare_shift_key) ?? null : null;
        const checkedOutAt = item.checked_out_at ?? null;
        return {
            key: rid ?? `appt:${item.appointment_id}`,
            reservation_id: rid,
            appointment_id: item.appointment_id,
            kind: item.kind,
            stage,
            mode: item.mode,
            is_walk_in: Boolean(item.is_walk_in),
            pet_id: item.pet_id,
            guardian_id: item.guardian_id,
            pet: item.pet ?? null,
            guardian: item.guardian ?? null,
            clinical_tags: item.clinical_tags ?? [],
            starts_at: item.starts_at,
            ends_at: item.ends_at,
            checked_in_at: item.checked_in_at ?? null,
            checked_out_at: checkedOutAt,
            nights_count: item.nights_count ?? 0,
            is_late: item.is_late,
            is_arrival: stage === 'reserved' && inRange(item.starts_at, from, to),
            is_departure: (stage === 'checked_in' && (inRange(item.ends_at, from, to) || item.is_late)) ||
                (stage === 'checked_out' && inRange(checkedOutAt, from, to)),
            handling,
            can_group_play: (0, boardingCare_1.canJoinGroupRecreation)(handling),
            plan_pendencies: pendencies,
            attention,
            tasks_summary: {
                total: stayTasks.length,
                done: stayTasks.filter((t) => t.status !== 'pending').length,
                pending: pendingTasks.length,
                overdue: pendingTasks.filter((t) => (0, boardingCare_1.isTaskOverdue)({ status: 'pending', scheduled_for: t.scheduled_for ?? null }, now)).length,
            },
            next_task: next
                ? { id: next.id, title: next.title, kind: next.kind, scheduled_for: next.scheduled_for ?? null }
                : null,
            open_incidents: openIncidents.map((i) => ({
                id: i.id,
                kind: i.kind,
                severity: i.severity,
                description: i.description,
                occurred_at: i.occurred_at,
            })),
            belongings_count: stayBelongings.reduce((s, b) => s + Number(b.quantity ?? 1), 0),
            space: space ? { id: space.id, name: space.name } : null,
            daycare_shift: shift ? { key: shift.key, label: shift.label } : null,
            daycare_period: item.daycare_period ?? null,
            daily_rate_cents: item.daily_rate_cents ?? null,
            notes: item.notes ?? null,
        };
    });
    const active = stays.filter((s) => s.stage === 'reserved' || s.stage === 'checked_in');
    const present = stays.filter((s) => s.stage === 'checked_in');
    const petName = new Map(stays.map((s) => [s.reservation_id, String(s.pet?.name ?? 'Pet')]));
    const stayByRsv = new Map(stays.map((s) => [s.reservation_id, s]));
    const taskList = tasks.rows
        .filter((t) => stayByRsv.get(t.hub_boarding_reservation_id)?.stage === 'checked_in')
        .map((t) => {
        const stay = stayByRsv.get(t.hub_boarding_reservation_id);
        const status = String(t.status ?? 'pending');
        const scheduledFor = t.scheduled_for ?? null;
        return {
            id: t.id,
            clinic_id: t.clinic_id,
            hub_boarding_reservation_id: t.hub_boarding_reservation_id,
            kind: t.kind,
            title: String(t.title ?? ''),
            details: (0, boardingCare_1.taskDetailsDisplayText)(t.details),
            task_date: t.task_date,
            scheduled_for: scheduledFor,
            status,
            outcome: t.outcome ?? null,
            last_notes: t.last_notes ?? null,
            executed_at: t.executed_at ?? null,
            pet_name: petName.get(t.hub_boarding_reservation_id) ?? 'Pet',
            mode: stay?.mode ?? null,
            can_group_play: stay?.can_group_play ?? true,
            space_name: stay?.space?.name ?? null,
            overdue: (0, boardingCare_1.isTaskOverdue)({ status, scheduled_for: scheduledFor }, now),
        };
    });
    const spaceOccupancy = spaces.rows.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        mode: s.mode,
        capacity: Number(s.capacity ?? 1),
        current: present.filter((p) => p.space?.id === s.id).length,
        pets: present.filter((p) => p.space?.id === s.id).map((p) => String(p.pet?.name ?? 'Pet')),
    }));
    return {
        date,
        generated_at: new Date(now).toISOString(),
        boarding_types_configured: boardingTypesConfigured,
        reservations_table_exists: reservationsTableExists,
        migrations_ready: tasks.ready && plans.ready,
        stays,
        tasks: taskList,
        counts: {
            present: present.length,
            arrivals: stays.filter((s) => s.is_arrival).length,
            departures: stays.filter((s) => s.is_departure && s.stage === 'checked_in').length,
            departed: stays.filter((s) => s.stage === 'checked_out' && s.is_departure).length,
            attention: active.filter((s) => s.attention.length > 0).length,
            hotel: active.filter((s) => s.mode === 'hotel').length,
            daycare: active.filter((s) => s.mode === 'daycare').length,
            tasks_pending: taskList.filter((t) => t.status === 'pending').length,
            tasks_overdue: taskList.filter((t) => t.overdue).length,
        },
        occupancy: {
            hotel: { current: present.filter((s) => s.mode === 'hotel').length, max: settings.hotel_slots },
            daycare: { current: present.filter((s) => s.mode === 'daycare').length, max: settings.daycare_slots_per_shift },
            spaces: spaceOccupancy,
        },
        settings,
        last_handoff: lastHandoff.rows[0] ?? null,
    };
}
// ─── GET /boarding/ops-board ──────────────────────────────────────────────
const getHubBoardingOpsBoard = async (req, res) => {
    try {
        const parsed = hubBoardingSchemas_1.opsBoardQuerySchema.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const board = await buildOpsBoard({
            clinicId: parsed.data.clinic_id,
            unitId: parsed.data.unit_id ?? null,
            date: parsed.data.date ?? (0, boardingPricing_1.todayYmdSaoPaulo)(),
        });
        return res.json(board);
    }
    catch (e) {
        console.error('getHubBoardingOpsBoard', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar o painel' });
    }
};
exports.getHubBoardingOpsBoard = getHubBoardingOpsBoard;
// ─── Passagem de turno ────────────────────────────────────────────────────
const getHubBoardingHandoffs = async (req, res) => {
    try {
        const parsed = hubBoardingSchemas_1.handoffsQuerySchema.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, unit_id, limit } = parsed.data;
        let q = supabase_1.supabaseAdmin
            .from('hub_boarding_shift_handoffs')
            .select('*')
            .eq('clinic_id', clinic_id)
            .order('created_at', { ascending: false })
            .limit(limit ?? 10);
        if (unit_id)
            q = q.eq('unit_id', unit_id);
        const { rows, ready } = await (0, hubBoardingDrawerController_1.safeList)(q);
        const ids = [
            ...new Set(rows.flatMap((r) => [r.created_by_user_id, r.acknowledged_by_user_id]).filter(Boolean)),
        ];
        const names = await (0, hubBoardingDrawerController_1.resolveStaffNamesByUserIds)(clinic_id, ids);
        return res.json({
            handoffs: rows.map((r) => ({
                ...r,
                created_by_name: names.get(r.created_by_user_id) ?? null,
                acknowledged_by_name: names.get(r.acknowledged_by_user_id) ?? null,
            })),
            migrations_ready: ready,
        });
    }
    catch (e) {
        console.error('getHubBoardingHandoffs', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar passagens de turno' });
    }
};
exports.getHubBoardingHandoffs = getHubBoardingHandoffs;
const postHubBoardingHandoff = async (req, res) => {
    try {
        const parsed = hubBoardingSchemas_1.createHandoffSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, unit_id, shift_label, notes } = parsed.data;
        const board = await buildOpsBoard({ clinicId: clinic_id, unitId: unit_id ?? null, date: (0, boardingPricing_1.todayYmdSaoPaulo)() });
        const petNameOf = (s) => String(s.pet?.name ?? 'Pet');
        const snapshot = (0, boardingCare_1.buildHandoffSnapshot)({
            nowIso: board.generated_at,
            stays: board.stays
                .filter((s) => s.stage === 'checked_in' || s.stage === 'reserved')
                .map((s) => ({ pet_name: petNameOf(s), stage: s.stage, attention: s.attention })),
            tasks: board.tasks.map((t) => ({
                pet_name: String(t.pet_name),
                title: String(t.title),
                scheduled_for: t.scheduled_for ?? null,
                status: String(t.status),
            })),
            incidents: board.stays.flatMap((s) => s.open_incidents.map((i) => ({
                pet_name: petNameOf(s),
                description: String(i.description),
                severity: String(i.severity),
                status: 'open',
            }))),
        });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_shift_handoffs')
            .insert({
            clinic_id,
            unit_id: unit_id ?? null,
            shift_label: shift_label?.trim() || null,
            notes: notes?.trim() || null,
            snapshot,
            created_by_user_id: req.user?.id ?? null,
        })
            .select('*')
            .single();
        if (error) {
            if ((0, boardingCareService_1.missingTable)(error))
                return res.status(503).json({ error: boardingCareService_1.BOARDING_MIGRATION_HINT });
            return res.status(500).json({ error: error.message });
        }
        return res.status(201).json({ handoff: data });
    }
    catch (e) {
        console.error('postHubBoardingHandoff', e);
        return res.status(500).json({ error: e?.message || 'Erro ao registrar passagem de turno' });
    }
};
exports.postHubBoardingHandoff = postHubBoardingHandoff;
const postHubBoardingHandoffAcknowledge = async (req, res) => {
    try {
        const { id } = req.params;
        const clinic = hubBoardingSchemas_1.uuidStr.safeParse(req.body?.clinic_id);
        if (!id || !hubBoardingDrawerController_1.UUID_RE.test(id))
            return res.status(400).json({ error: 'Passagem inválida' });
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_shift_handoffs')
            .update({ acknowledged_at: new Date().toISOString(), acknowledged_by_user_id: req.user?.id ?? null })
            .eq('id', id)
            .eq('clinic_id', clinic.data)
            .is('acknowledged_at', null)
            .select('*')
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(409).json({ error: 'Esta passagem já recebeu ciência' });
        return res.json({ handoff: data });
    }
    catch (e) {
        console.error('postHubBoardingHandoffAcknowledge', e);
        return res.status(500).json({ error: e?.message || 'Erro ao dar ciência' });
    }
};
exports.postHubBoardingHandoffAcknowledge = postHubBoardingHandoffAcknowledge;
// ─── Relatório ao tutor ───────────────────────────────────────────────────
const getHubBoardingTutorReport = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !hubBoardingDrawerController_1.UUID_RE.test(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        const parsed = hubBoardingSchemas_1.tutorReportQuerySchema.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, kind } = parsed.data;
        const reservation = await (0, boardingCareService_1.loadReservation)(clinic_id, id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        const date = kind === 'daily' ? parsed.data.date ?? (0, boardingPricing_1.todayYmdSaoPaulo)() : null;
        const [{ data: pet }, { data: guardian }, { data: clinic }, tasks, incidents, media] = await Promise.all([
            supabase_1.supabaseAdmin.from('hub_pets').select('name').eq('id', reservation.pet_id).maybeSingle(),
            reservation.guardian_id
                ? supabase_1.supabaseAdmin.from('hub_guardians').select('full_name, phone').eq('id', reservation.guardian_id).maybeSingle()
                : Promise.resolve({ data: null }),
            supabase_1.supabaseAdmin.from('clinics').select('name').eq('id', clinic_id).maybeSingle(),
            (0, hubBoardingDrawerController_1.safeList)(supabase_1.supabaseAdmin
                .from('hub_boarding_tasks')
                .select('kind, title, status, outcome, task_date, scheduled_for, last_notes')
                .eq('clinic_id', clinic_id)
                .eq('hub_boarding_reservation_id', id)),
            (0, hubBoardingDrawerController_1.safeList)(supabase_1.supabaseAdmin
                .from('hub_boarding_incidents')
                .select('description, severity, status, occurred_at, action_taken')
                .eq('clinic_id', clinic_id)
                .eq('hub_boarding_reservation_id', id)
                .is('deleted_at', null)
                .order('occurred_at', { ascending: true })),
            (0, hubBoardingDrawerController_1.safeList)(supabase_1.supabaseAdmin
                .from('hub_boarding_media')
                .select('url, created_at')
                .eq('clinic_id', clinic_id)
                .eq('hub_boarding_reservation_id', id)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })),
        ]);
        const photoUrls = media.rows
            .filter((m) => !date || (0, boardingBilling_1.boardingLocalParts)(m.created_at)?.ymd === date)
            .map((m) => m.url);
        const firstName = (guardian?.full_name ?? '').trim().split(/\s+/)[0] || null;
        const body = (0, boardingCare_1.buildTutorReportText)({
            kind,
            petName: String(pet?.name ?? 'seu pet'),
            guardianFirstName: firstName,
            clinicName: clinic?.name ?? null,
            reportDate: date,
            tasks: tasks.rows,
            incidents: incidents.rows,
            photoUrls,
        });
        return res.json({ body, kind, report_date: date, guardian_phone: guardian?.phone ?? null, photos_count: photoUrls.length });
    }
    catch (e) {
        console.error('getHubBoardingTutorReport', e);
        return res.status(500).json({ error: e?.message || 'Erro ao montar o relatório' });
    }
};
exports.getHubBoardingTutorReport = getHubBoardingTutorReport;
const postHubBoardingTutorReport = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !hubBoardingDrawerController_1.UUID_RE.test(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        const parsed = hubBoardingSchemas_1.createTutorReportSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, ...rest } = parsed.data;
        const reservation = await (0, boardingCareService_1.loadReservation)(clinic_id, id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_tutor_reports')
            .insert({
            clinic_id,
            hub_boarding_reservation_id: id,
            ...rest,
            report_date: rest.report_date ?? null,
            sent_by_user_id: req.user?.id ?? null,
        })
            .select('*')
            .single();
        if (error) {
            if ((0, boardingCareService_1.missingTable)(error))
                return res.status(503).json({ error: boardingCareService_1.BOARDING_MIGRATION_HINT });
            return res.status(500).json({ error: error.message });
        }
        return res.status(201).json({ report: data });
    }
    catch (e) {
        console.error('postHubBoardingTutorReport', e);
        return res.status(500).json({ error: e?.message || 'Erro ao registrar envio' });
    }
};
exports.postHubBoardingTutorReport = postHubBoardingTutorReport;
// ─── Acomodações ──────────────────────────────────────────────────────────
const getHubBoardingSpaces = async (req, res) => {
    try {
        const parsed = hubBoardingSchemas_1.spacesQuerySchema.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, unit_id, include_inactive } = parsed.data;
        let q = supabase_1.supabaseAdmin
            .from('hub_boarding_spaces')
            .select('*')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });
        if (unit_id)
            q = q.eq('unit_id', unit_id);
        if (include_inactive !== 'true')
            q = q.eq('active', true);
        const { rows, ready } = await (0, hubBoardingDrawerController_1.safeList)(q);
        let presentQ = supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('*')
            .eq('clinic_id', clinic_id)
            .eq('status', 'checked_in')
            .is('deleted_at', null);
        if (unit_id)
            presentQ = presentQ.eq('unit_id', unit_id);
        const { data: present } = await presentQ;
        const countBySpace = new Map();
        for (const r of (present ?? [])) {
            const sid = r.space_id;
            if (sid)
                countBySpace.set(sid, (countBySpace.get(sid) ?? 0) + 1);
        }
        return res.json({
            spaces: rows.map((s) => ({ ...s, current: countBySpace.get(s.id) ?? 0 })),
            migrations_ready: ready,
        });
    }
    catch (e) {
        console.error('getHubBoardingSpaces', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar acomodações' });
    }
};
exports.getHubBoardingSpaces = getHubBoardingSpaces;
const postHubBoardingSpace = async (req, res) => {
    try {
        const parsed = hubBoardingSchemas_1.createSpaceSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_spaces')
            .insert({ ...parsed.data, name: parsed.data.name.trim(), notes: parsed.data.notes?.trim() || null })
            .select('*')
            .single();
        if (error) {
            if ((0, boardingCareService_1.missingTable)(error))
                return res.status(503).json({ error: boardingCareService_1.BOARDING_MIGRATION_HINT });
            return res.status(500).json({ error: error.message });
        }
        return res.status(201).json({ space: data });
    }
    catch (e) {
        console.error('postHubBoardingSpace', e);
        return res.status(500).json({ error: e?.message || 'Erro ao criar acomodação' });
    }
};
exports.postHubBoardingSpace = postHubBoardingSpace;
const patchHubBoardingSpace = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !hubBoardingDrawerController_1.UUID_RE.test(id))
            return res.status(400).json({ error: 'Acomodação inválida' });
        const parsed = hubBoardingSchemas_1.patchSpaceSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, ...rest } = parsed.data;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_spaces')
            .update(rest)
            .eq('id', id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .select('*')
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(404).json({ error: 'Acomodação não encontrada' });
        return res.json({ space: data });
    }
    catch (e) {
        console.error('patchHubBoardingSpace', e);
        return res.status(500).json({ error: e?.message || 'Erro ao salvar acomodação' });
    }
};
exports.patchHubBoardingSpace = patchHubBoardingSpace;
const deleteHubBoardingSpace = async (req, res) => {
    try {
        const { id } = req.params;
        const clinic = hubBoardingSchemas_1.uuidStr.safeParse(req.query.clinic_id ?? req.body?.clinic_id);
        if (!id || !hubBoardingDrawerController_1.UUID_RE.test(id))
            return res.status(400).json({ error: 'Acomodação inválida' });
        if (!clinic.success)
            return res.status(400).json({ error: 'clinic_id inválido' });
        const { count } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id', { count: 'exact', head: true })
            .eq('clinic_id', clinic.data)
            .eq('space_id', id)
            .eq('status', 'checked_in')
            .is('deleted_at', null);
        if ((count ?? 0) > 0) {
            return res.status(409).json({ error: 'Há pets hospedados nesta acomodação. Remaneje antes de arquivar.' });
        }
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_spaces')
            .update({ deleted_at: new Date().toISOString(), active: false })
            .eq('id', id)
            .eq('clinic_id', clinic.data);
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('deleteHubBoardingSpace', e);
        return res.status(500).json({ error: e?.message || 'Erro ao arquivar acomodação' });
    }
};
exports.deleteHubBoardingSpace = deleteHubBoardingSpace;
