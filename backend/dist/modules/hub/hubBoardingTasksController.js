"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postHubBoardingBatchActivity = exports.postHubBoardingTaskExecute = exports.postHubBoardingTask = exports.getHubBoardingTasks = void 0;
const crypto_1 = __importDefault(require("crypto"));
const supabase_1 = require("../../config/supabase");
const boardingCare_1 = require("./boardingCare");
const boardingBilling_1 = require("./boardingBilling");
const boardingCareService_1 = require("./boardingCareService");
const hubBoardingDrawerController_1 = require("./hubBoardingDrawerController");
const hubBoardingSchemas_1 = require("./hubBoardingSchemas");
const boardingPricing_1 = require("./boardingPricing");
const DEFAULT_BATCH_TITLES = {
    recreation: 'Recreação',
    walk: 'Passeio',
    custom: 'Atividade',
};
function ymdOf(iso) {
    return (0, boardingBilling_1.boardingLocalParts)(iso)?.ymd ?? iso.slice(0, 10);
}
// ─── GET /boarding/tasks ──────────────────────────────────────────────────
const getHubBoardingTasks = async (req, res) => {
    try {
        const parsed = hubBoardingSchemas_1.tasksQuerySchema.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, unit_id, reservation_id } = parsed.data;
        const date = parsed.data.date ?? (0, boardingPricing_1.todayYmdSaoPaulo)();
        let q = supabase_1.supabaseAdmin
            .from('hub_boarding_tasks')
            .select('*')
            .eq('clinic_id', clinic_id)
            .order('scheduled_for', { ascending: true, nullsFirst: false });
        if (reservation_id)
            q = q.eq('hub_boarding_reservation_id', reservation_id);
        else
            q = q.eq('task_date', date);
        const { data, error } = await q;
        if (error) {
            if ((0, boardingCareService_1.missingTable)(error))
                return res.json({ tasks: [], migrations_ready: false });
            return res.status(500).json({ error: error.message });
        }
        let tasks = (data ?? []);
        const rsvIds = [...new Set(tasks.map((t) => t.hub_boarding_reservation_id))];
        const { data: rsvs } = rsvIds.length
            ? await supabase_1.supabaseAdmin
                .from('hub_boarding_reservations')
                .select('id, unit_id, mode, status, pet_id')
                .in('id', rsvIds)
                .is('deleted_at', null)
            : { data: [] };
        const rsvById = new Map((rsvs ?? []).map((r) => [r.id, r]));
        tasks = tasks.filter((t) => {
            const r = rsvById.get(t.hub_boarding_reservation_id);
            if (!r)
                return false;
            if (unit_id && r.unit_id !== unit_id)
                return false;
            return r.status !== 'cancelled' && r.status !== 'no_show';
        });
        const now = Date.now();
        return res.json({
            tasks: tasks.map((t) => ({
                ...t,
                overdue: (0, boardingCare_1.isTaskOverdue)({ status: String(t.status), scheduled_for: t.scheduled_for ?? null }, now),
                reservation_status: rsvById.get(t.hub_boarding_reservation_id)?.status ?? null,
                mode: rsvById.get(t.hub_boarding_reservation_id)?.mode ?? null,
            })),
            date,
            migrations_ready: true,
        });
    }
    catch (e) {
        console.error('getHubBoardingTasks', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar tarefas' });
    }
};
exports.getHubBoardingTasks = getHubBoardingTasks;
// ─── POST /boarding/reservations/:id/tasks (avulsa) ───────────────────────
const postHubBoardingTask = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !hubBoardingDrawerController_1.UUID_RE.test(id))
            return res.status(400).json({ error: 'ID de reserva inválido' });
        const parsed = hubBoardingSchemas_1.createTaskSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, kind, title, scheduled_for, notes } = parsed.data;
        const reservation = await (0, boardingCareService_1.loadReservation)(clinic_id, id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        if (!['reserved', 'checked_in'].includes(reservation.status)) {
            return res.status(422).json({ error: 'Só é possível criar tarefas para estadias ativas' });
        }
        const when = scheduled_for ?? new Date().toISOString();
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_tasks')
            .insert({
            clinic_id,
            hub_boarding_reservation_id: id,
            pet_id: reservation.pet_id,
            kind,
            source: 'manual',
            title: title.trim(),
            details: notes?.trim() ? { notes: notes.trim() } : {},
            scheduled_for: when,
            task_date: ymdOf(when),
            created_by_user_id: req.user?.id ?? null,
        })
            .select('*')
            .single();
        if (error) {
            if ((0, boardingCareService_1.missingTable)(error))
                return res.status(503).json({ error: boardingCareService_1.BOARDING_MIGRATION_HINT });
            return res.status(500).json({ error: error.message });
        }
        return res.status(201).json({ task: data });
    }
    catch (e) {
        console.error('postHubBoardingTask', e);
        return res.status(500).json({ error: e?.message || 'Erro ao criar tarefa' });
    }
};
exports.postHubBoardingTask = postHubBoardingTask;
// ─── POST /boarding/tasks/:id/execute ─────────────────────────────────────
const postHubBoardingTaskExecute = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !hubBoardingDrawerController_1.UUID_RE.test(id))
            return res.status(400).json({ error: 'Tarefa inválida' });
        const parsed = hubBoardingSchemas_1.executeTaskSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, outcome, skip, undo, notes, executed_at } = parsed.data;
        const { data: task, error: tErr } = await supabase_1.supabaseAdmin
            .from('hub_boarding_tasks')
            .select('*')
            .eq('id', id)
            .eq('clinic_id', clinic_id)
            .maybeSingle();
        if (tErr) {
            if ((0, boardingCareService_1.missingTable)(tErr))
                return res.status(503).json({ error: boardingCareService_1.BOARDING_MIGRATION_HINT });
            return res.status(500).json({ error: tErr.message });
        }
        if (!task)
            return res.status(404).json({ error: 'Tarefa não encontrada' });
        const reservation = await (0, boardingCareService_1.loadReservation)(clinic_id, task.hub_boarding_reservation_id);
        if (!reservation)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        if (reservation.status !== 'checked_in' && reservation.status !== 'checked_out') {
            return res.status(422).json({ error: 'Registre as tarefas depois do check-in' });
        }
        const userId = req.user?.id ?? null;
        const at = executed_at ?? new Date().toISOString();
        let update;
        let execOutcome = null;
        if (undo) {
            update = { status: 'pending', outcome: null, executed_at: null, executed_by_user_id: null, last_notes: null };
        }
        else if (skip) {
            update = { status: 'skipped', outcome: null, executed_at: at, executed_by_user_id: userId, last_notes: notes?.trim() || null };
        }
        else {
            if (!outcome || !(0, boardingCare_1.isValidOutcome)(String(task.kind), outcome)) {
                return res.status(400).json({ error: 'Resultado inválido para esta tarefa' });
            }
            execOutcome = outcome;
            update = { status: 'done', outcome, executed_at: at, executed_by_user_id: userId, last_notes: notes?.trim() || null };
        }
        const { data: saved, error: upErr } = await supabase_1.supabaseAdmin
            .from('hub_boarding_tasks')
            .update(update)
            .eq('id', id)
            .select('*')
            .single();
        if (upErr)
            return res.status(500).json({ error: upErr.message });
        await supabase_1.supabaseAdmin.from('hub_boarding_task_executions').insert({
            clinic_id,
            hub_boarding_task_id: id,
            hub_boarding_reservation_id: reservation.id,
            outcome: skip ? 'skipped' : execOutcome,
            undone: Boolean(undo),
            notes: notes?.trim() || null,
            executed_at: at,
            executed_by_user_id: userId,
        });
        return res.json({ task: saved });
    }
    catch (e) {
        console.error('postHubBoardingTaskExecute', e);
        return res.status(500).json({ error: e?.message || 'Erro ao registrar tarefa' });
    }
};
exports.postHubBoardingTaskExecute = postHubBoardingTaskExecute;
// ─── POST /boarding/tasks/batch-activity ──────────────────────────────────
/**
 * Atividade coletiva (recreação, passeio em grupo): um registro individual por pet.
 * Alimentação e medicação nunca entram aqui.
 */
const postHubBoardingBatchActivity = async (req, res) => {
    try {
        const parsed = hubBoardingSchemas_1.batchActivitySchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, reservation_ids, kind, title, outcome, notes } = parsed.data;
        if (!boardingCare_1.BATCH_TASK_KINDS.includes(kind)) {
            return res.status(400).json({ error: 'Alimentação e medicação precisam de registro individual' });
        }
        const at = parsed.data.executed_at ?? new Date().toISOString();
        const atMs = new Date(at).getTime();
        const date = ymdOf(at);
        const userId = req.user?.id ?? null;
        const batchId = crypto_1.default.randomUUID();
        const { data: rsvs, error: rErr } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('*')
            .eq('clinic_id', clinic_id)
            .in('id', reservation_ids)
            .is('deleted_at', null);
        if (rErr)
            return res.status(500).json({ error: rErr.message });
        const reservations = (rsvs ?? []);
        const [{ data: plans }, { data: pending, error: pErr }, { data: pets }] = await Promise.all([
            supabase_1.supabaseAdmin
                .from('hub_boarding_care_plans')
                .select('hub_boarding_reservation_id, handling')
                .in('hub_boarding_reservation_id', reservation_ids),
            supabase_1.supabaseAdmin
                .from('hub_boarding_tasks')
                .select('id, hub_boarding_reservation_id, scheduled_for')
                .eq('clinic_id', clinic_id)
                .in('hub_boarding_reservation_id', reservation_ids)
                .eq('kind', kind)
                .eq('task_date', date)
                .eq('status', 'pending'),
            supabase_1.supabaseAdmin.from('hub_pets').select('id, name').in('id', reservations.map((r) => r.pet_id)),
        ]);
        if (pErr) {
            if ((0, boardingCareService_1.missingTable)(pErr))
                return res.status(503).json({ error: boardingCareService_1.BOARDING_MIGRATION_HINT });
            return res.status(500).json({ error: pErr.message });
        }
        const handlingByRsv = new Map((plans ?? []).map((p) => [p.hub_boarding_reservation_id, (0, boardingCare_1.normalizeHandling)(p.handling)]));
        const petName = new Map((pets ?? []).map((p) => [p.id, String(p.name)]));
        const done = [];
        const skipped = [];
        for (const rid of reservation_ids) {
            const r = reservations.find((x) => x.id === rid);
            if (!r) {
                skipped.push({ reservation_id: rid, pet_name: '', reason: 'Reserva não encontrada' });
                continue;
            }
            const name = petName.get(r.pet_id) ?? 'Pet';
            if (r.status !== 'checked_in') {
                skipped.push({ reservation_id: rid, pet_name: name, reason: 'Não está hospedado agora' });
                continue;
            }
            if (kind === 'recreation' && !(0, boardingCare_1.canJoinGroupRecreation)(handlingByRsv.get(rid))) {
                skipped.push({ reservation_id: rid, pet_name: name, reason: 'Manejo não permite recreação em grupo' });
                continue;
            }
            // Usa a tarefa programada mais próxima (até 3h de diferença); senão cria uma do lote.
            const candidates = (pending ?? [])
                .filter((t) => t.hub_boarding_reservation_id === rid)
                .map((t) => ({ id: t.id, diff: Math.abs(new Date(t.scheduled_for ?? at).getTime() - atMs) }))
                .filter((t) => t.diff <= 3 * 3600_000)
                .sort((a, b) => a.diff - b.diff);
            let taskId = candidates[0]?.id ?? null;
            const doneFields = {
                status: 'done',
                outcome,
                executed_at: at,
                executed_by_user_id: userId,
                last_notes: notes?.trim() || null,
            };
            if (taskId) {
                const { error } = await supabase_1.supabaseAdmin.from('hub_boarding_tasks').update(doneFields).eq('id', taskId);
                if (error) {
                    skipped.push({ reservation_id: rid, pet_name: name, reason: error.message });
                    continue;
                }
            }
            else {
                const { data: created, error } = await supabase_1.supabaseAdmin
                    .from('hub_boarding_tasks')
                    .insert({
                    clinic_id,
                    hub_boarding_reservation_id: rid,
                    pet_id: r.pet_id,
                    kind,
                    source: 'batch',
                    title: title?.trim() || DEFAULT_BATCH_TITLES[kind],
                    details: {},
                    scheduled_for: at,
                    task_date: date,
                    created_by_user_id: userId,
                    ...doneFields,
                })
                    .select('id')
                    .single();
                if (error || !created) {
                    skipped.push({ reservation_id: rid, pet_name: name, reason: error?.message ?? 'Erro ao registrar' });
                    continue;
                }
                taskId = created.id;
            }
            await supabase_1.supabaseAdmin.from('hub_boarding_task_executions').insert({
                clinic_id,
                hub_boarding_task_id: taskId,
                hub_boarding_reservation_id: rid,
                outcome,
                notes: notes?.trim() || null,
                batch_id: batchId,
                executed_at: at,
                executed_by_user_id: userId,
            });
            done.push({ reservation_id: rid, task_id: taskId });
        }
        return res.json({ done, skipped, batch_id: batchId });
    }
    catch (e) {
        console.error('postHubBoardingBatchActivity', e);
        return res.status(500).json({ error: e?.message || 'Erro ao registrar atividade em grupo' });
    }
};
exports.postHubBoardingBatchActivity = postHubBoardingBatchActivity;
