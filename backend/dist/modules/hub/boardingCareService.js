"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.boardingStayWindow = exports.EMPTY_UNIT_SETTINGS = exports.BoardingHttpError = exports.BOARDING_MIGRATION_HINT = void 0;
exports.missingTable = missingTable;
exports.normalizeUnitSettings = normalizeUnitSettings;
exports.loadUnitSettings = loadUnitSettings;
exports.loadCareProfileRow = loadCareProfileRow;
exports.loadCareProfile = loadCareProfile;
exports.loadReservation = loadReservation;
exports.loadCarePlanRow = loadCarePlanRow;
exports.ensureCarePlan = ensureCarePlan;
exports.planBlocksFromRow = planBlocksFromRow;
exports.planStatusFromRow = planStatusFromRow;
exports.syncReservationTasks = syncReservationTasks;
exports.resyncOpenStayTasks = resyncOpenStayTasks;
exports.dropPendingTasksAfter = dropPendingTasksAfter;
exports.completeBoardingReservationCheckout = completeBoardingReservationCheckout;
exports.petHasOpenBoardingCharge = petHasOpenBoardingCharge;
exports.prepareStayCare = prepareStayCare;
exports.checkCapacityForCheckIn = checkCapacityForCheckIn;
exports.assertCapacityAllowed = assertCapacityAllowed;
exports.loadReservationsOverlapping = loadReservationsOverlapping;
/**
 * Acesso a banco de Hotel & Creche: ficha/plano de cuidados, geração de tarefas,
 * configurações da unidade e capacidade. Regras puras ficam em boardingCare.ts.
 */
const supabase_1 = require("../../config/supabase");
const supabaseSchemaErrors_1 = require("../../utils/supabaseSchemaErrors");
const boardingCare_1 = require("./boardingCare");
const boardingBilling_1 = require("./boardingBilling");
const boardingOperational_1 = require("./boardingOperational");
Object.defineProperty(exports, "boardingStayWindow", { enumerable: true, get: function () { return boardingOperational_1.boardingStayWindow; } });
exports.BOARDING_MIGRATION_HINT = 'Execute as migrações 123 a 132 de backend/database_migrations/petimi_hub (Hotel & Creche) no Supabase.';
class BoardingHttpError extends Error {
    status;
    extra;
    constructor(status, message, extra) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}
exports.BoardingHttpError = BoardingHttpError;
function missingTable(err) {
    return (0, supabaseSchemaErrors_1.isMissingPostgrestRelation)(err) || Boolean(err?.message?.includes('does not exist'));
}
exports.EMPTY_UNIT_SETTINGS = {
    unit_id: null,
    hotel_slots: null,
    daycare_slots_per_shift: null,
    checkout_cutoff_time: null,
    daycare_shifts: [],
    recreation_windows: [],
    recreation_capacity: null,
    overbooking_policy: 'warn',
    meal_slot_times: (0, boardingCare_1.resolveMealSlotTimes)(null),
    block_exit_if_charge_pending: false,
};
function normalizeUnitSettings(row) {
    if (!row)
        return { ...exports.EMPTY_UNIT_SETTINGS };
    return {
        unit_id: row.unit_id ?? null,
        hotel_slots: row.hotel_slots ?? null,
        daycare_slots_per_shift: row.daycare_slots_per_shift ?? null,
        checkout_cutoff_time: row.checkout_cutoff_time ?? null,
        daycare_shifts: Array.isArray(row.daycare_shifts) ? row.daycare_shifts : [],
        recreation_windows: Array.isArray(row.recreation_windows) ? row.recreation_windows : [],
        recreation_capacity: row.recreation_capacity ?? null,
        overbooking_policy: row.overbooking_policy === 'block' ? 'block' : 'warn',
        meal_slot_times: (0, boardingCare_1.resolveMealSlotTimes)(row.meal_slot_times),
        block_exit_if_charge_pending: row.block_exit_if_charge_pending === true,
    };
}
async function loadUnitSettings(clinicId, unitId) {
    let q = supabase_1.supabaseAdmin.from('hub_unit_boarding_settings').select('*').eq('clinic_id', clinicId);
    if (unitId)
        q = q.eq('unit_id', unitId);
    const { data, error } = await q.limit(1);
    if (error) {
        if (missingTable(error))
            return { ...exports.EMPTY_UNIT_SETTINGS };
        throw new Error(error.message);
    }
    return normalizeUnitSettings(data?.[0] ?? null);
}
// ─── Ficha de cuidados ────────────────────────────────────────────────────
async function loadCareProfileRow(clinicId, petId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pet_care_profiles')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId)
        .maybeSingle();
    if (error) {
        if (missingTable(error))
            return null;
        throw new Error(error.message);
    }
    return data ?? null;
}
async function loadCareProfile(clinicId, petId) {
    const row = await loadCareProfileRow(clinicId, petId);
    return row ? (0, boardingCare_1.normalizeProfileBlocks)(row) : null;
}
async function loadReservation(clinicId, reservationId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('*')
        .eq('id', reservationId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    return data ?? null;
}
async function loadCarePlanRow(clinicId, reservationId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_boarding_care_plans')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('hub_boarding_reservation_id', reservationId)
        .maybeSingle();
    if (error) {
        if (missingTable(error))
            return null;
        throw new Error(error.message);
    }
    return data ?? null;
}
/** Garante o plano da estadia; nasce herdando a ficha do pet. Retorna null se a migração não rodou. */
async function ensureCarePlan(reservation) {
    const existing = await loadCarePlanRow(reservation.clinic_id, reservation.id);
    if (existing)
        return existing;
    const profile = await loadCareProfile(reservation.clinic_id, reservation.pet_id);
    const { blocks, block_status } = (0, boardingCare_1.buildPlanFromProfile)(profile);
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_boarding_care_plans')
        .insert({
        clinic_id: reservation.clinic_id,
        hub_boarding_reservation_id: reservation.id,
        pet_id: reservation.pet_id,
        ...blocks,
        block_status,
    })
        .select('*')
        .single();
    if (error) {
        if (missingTable(error))
            return null;
        // Corrida: outro request criou o plano primeiro.
        if (error.code === '23505')
            return loadCarePlanRow(reservation.clinic_id, reservation.id);
        throw new Error(error.message);
    }
    return data;
}
function planBlocksFromRow(row) {
    return row ? (0, boardingCare_1.normalizePlanBlocks)(row) : null;
}
function planStatusFromRow(row) {
    return (row?.block_status ?? {});
}
// ─── Tarefas ──────────────────────────────────────────────────────────────
function taskWindow(r) {
    const start = r.checked_in_at ?? r.expected_check_in ?? null;
    if (!start)
        return null;
    if (r.checked_out_at)
        return { start, end: r.checked_out_at };
    if (r.expected_check_out)
        return { start, end: r.expected_check_out };
    if (r.mode === 'daycare') {
        const ymd = (0, boardingBilling_1.boardingLocalParts)(start)?.ymd;
        return { start, end: ymd ? new Date(`${ymd}T23:59:00-03:00`).toISOString() : null };
    }
    return { start, end: null };
}
/**
 * Reconcilia as tarefas da estadia com o plano atual.
 * Executadas nunca mudam; pendentes são atualizadas, criadas ou removidas.
 */
async function syncReservationTasks(reservation, opts) {
    if (!['reserved', 'checked_in'].includes(reservation.status))
        return null;
    const planRow = opts?.plan !== undefined ? opts.plan : await ensureCarePlan(reservation);
    if (!planRow)
        return null;
    const window = taskWindow(reservation);
    if (!window)
        return null;
    const settings = opts?.settings ?? (await loadUnitSettings(reservation.clinic_id, reservation.unit_id));
    const desired = (0, boardingCare_1.generatePlanTasks)({
        plan: (0, boardingCare_1.normalizePlanBlocks)(planRow),
        start: window.start,
        end: window.end,
        recreationWindows: settings.recreation_windows,
        mealSlotTimes: settings.meal_slot_times,
    });
    const { data: existingRows, error: exErr } = await supabase_1.supabaseAdmin
        .from('hub_boarding_tasks')
        .select('id, plan_key, task_date, status, source, title, scheduled_for, details')
        .eq('clinic_id', reservation.clinic_id)
        .eq('hub_boarding_reservation_id', reservation.id);
    if (exErr) {
        if (missingTable(exErr))
            return null;
        throw new Error(exErr.message);
    }
    const { toInsert, toUpdate, toDelete } = (0, boardingCare_1.diffPlanTasks)((existingRows ?? []), desired);
    if (toDelete.length) {
        const { error } = await supabase_1.supabaseAdmin.from('hub_boarding_tasks').delete().in('id', toDelete).eq('status', 'pending');
        if (error)
            throw new Error(error.message);
    }
    for (const u of toUpdate) {
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_boarding_tasks')
            .update({ title: u.spec.title, details: u.spec.details, scheduled_for: u.spec.scheduled_for })
            .eq('id', u.id)
            .eq('status', 'pending');
        if (error)
            throw new Error(error.message);
    }
    if (toInsert.length) {
        const { error } = await supabase_1.supabaseAdmin.from('hub_boarding_tasks').upsert(toInsert.map((s) => ({
            clinic_id: reservation.clinic_id,
            hub_boarding_reservation_id: reservation.id,
            pet_id: reservation.pet_id,
            kind: s.kind,
            source: 'plan',
            title: s.title,
            details: s.details,
            scheduled_for: s.scheduled_for,
            task_date: s.task_date,
            plan_key: s.plan_key,
        })), { onConflict: 'hub_boarding_reservation_id,plan_key,task_date', ignoreDuplicates: true });
        if (error)
            throw new Error(error.message);
    }
    await supabase_1.supabaseAdmin
        .from('hub_boarding_care_plans')
        .update({ tasks_generated_at: new Date().toISOString() })
        .eq('id', planRow.id);
    return { inserted: toInsert.length, updated: toUpdate.length, deleted: toDelete.length };
}
/** Reaplica o plano nas estadias abertas da unidade (ex.: horário dos períodos mudou). */
async function resyncOpenStayTasks(clinicId, unitId) {
    const settings = await loadUnitSettings(clinicId, unitId);
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('unit_id', unitId)
        .in('status', ['reserved', 'checked_in', 'checkout_preparing', 'ready_for_handoff'])
        .is('deleted_at', null);
    if (error) {
        if (missingTable(error))
            return;
        throw new Error(error.message);
    }
    for (const row of data ?? []) {
        try {
            await syncReservationTasks(row, { settings });
        }
        catch (e) {
            console.error('resyncOpenStayTasks', row.id, e);
        }
    }
}
/** No check-out (ou cancelamento), remove as tarefas pendentes que ficaram para depois. */
async function dropPendingTasksAfter(clinicId, reservationId, afterIso) {
    let q = supabase_1.supabaseAdmin
        .from('hub_boarding_tasks')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('hub_boarding_reservation_id', reservationId)
        .eq('status', 'pending');
    if (afterIso)
        q = q.gt('scheduled_for', afterIso);
    const { error } = await q;
    if (error && !missingTable(error))
        throw new Error(error.message);
}
/**
 * Fecha a estadia após entrega/embarque na recepção (ou L&T já concluído).
 * Idempotente se já estiver `checked_out`.
 */
async function completeBoardingReservationCheckout(opts) {
    const current = await loadReservation(opts.clinicId, opts.reservationId);
    if (!current)
        return { ok: true, alreadyDone: true, reservation: null };
    if (current.status === 'checked_out') {
        return { ok: true, alreadyDone: true, reservation: current };
    }
    if (current.status === 'cancelled' || current.status === 'no_show') {
        return { ok: true, alreadyDone: true, reservation: current };
    }
    const nowIso = opts.checkedOutAt ?? new Date().toISOString();
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .update({ status: 'checked_out', checked_out_at: nowIso })
        .eq('id', opts.reservationId)
        .eq('clinic_id', opts.clinicId)
        .is('deleted_at', null)
        .select('*')
        .maybeSingle();
    if (error)
        throw new Error(error.message);
    const updated = data ?? current;
    if (current.hub_appointment_id) {
        await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .update({ status: 'done' })
            .eq('id', current.hub_appointment_id)
            .eq('clinic_id', opts.clinicId);
    }
    await dropPendingTasksAfter(opts.clinicId, opts.reservationId, updated.checked_out_at ?? nowIso);
    try {
        const { syncOpenComandasAfterBoardingCheckedOut } = await Promise.resolve().then(() => __importStar(require('./hubComandasController')));
        void syncOpenComandasAfterBoardingCheckedOut(opts.clinicId, opts.reservationId);
    }
    catch {
        /* comanda é best-effort */
    }
    try {
        const { notifyHubBoardingCheckout } = await Promise.resolve().then(() => __importStar(require('./hubNotifyEvents')));
        void notifyHubBoardingCheckout({
            clinicId: opts.clinicId,
            unitId: current.unit_id,
            petId: current.pet_id,
            reservationId: opts.reservationId,
        });
    }
    catch {
        /* notificação é best-effort */
    }
    return { ok: true, alreadyDone: false, reservation: updated };
}
async function petHasOpenBoardingCharge(clinicId, petId) {
    if (!petId)
        return false;
    const { count, error } = await supabase_1.supabaseAdmin
        .from('hub_comandas')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('pet_id', petId)
        .is('deleted_at', null)
        .in('financial_status', ['open', 'awaiting_balance']);
    if (error)
        throw new Error(error.message);
    return (count ?? 0) > 0;
}
/** Plano + tarefas da estadia; falhas não interrompem o fluxo principal (check-in, reserva). */
async function prepareStayCare(reservation) {
    try {
        const plan = await ensureCarePlan(reservation);
        if (plan)
            await syncReservationTasks(reservation, { plan });
    }
    catch (e) {
        console.error('prepareStayCare', reservation.id, e);
    }
}
/** Ocupação simultânea depois de colocar esta estadia (pets presentes no momento). */
async function checkCapacityForCheckIn(args) {
    const settings = await loadUnitSettings(args.clinicId, args.unitId);
    let q = supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('*')
        .eq('clinic_id', args.clinicId)
        .eq('status', 'checked_in')
        .is('deleted_at', null);
    if (args.unitId)
        q = q.eq('unit_id', args.unitId);
    const { data, error } = await q;
    if (error)
        throw new Error(error.message);
    const present = (data ?? []).filter((r) => r.id !== args.reservationId);
    const sameMode = present.filter((r) => r.mode === args.mode);
    const sameShift = args.mode === 'daycare' && args.shiftKey
        ? sameMode.filter((r) => (r.daycare_shift_key ?? null) === args.shiftKey)
        : sameMode;
    const current = sameShift.length + 1;
    const max = args.mode === 'hotel' ? settings.hotel_slots : settings.daycare_slots_per_shift;
    let space = null;
    if (args.spaceId) {
        const { data: sp } = await supabase_1.supabaseAdmin
            .from('hub_boarding_spaces')
            .select('id, name, capacity')
            .eq('id', args.spaceId)
            .eq('clinic_id', args.clinicId)
            .maybeSingle();
        if (sp) {
            const inSpace = present.filter((r) => r.space_id === args.spaceId).length + 1;
            space = {
                id: sp.id,
                name: String(sp.name),
                current: inSpace,
                capacity: Number(sp.capacity ?? 1),
                over: inSpace > Number(sp.capacity ?? 1),
            };
        }
    }
    return {
        mode: args.mode,
        current,
        max,
        over: max != null && current > max,
        policy: settings.overbooking_policy,
        space,
    };
}
/** Aplica a política da unidade: "bloquear" impede; "alertar" exige confirmação explícita. */
function assertCapacityAllowed(check, force) {
    const over = check.over || Boolean(check.space?.over);
    if (!over)
        return;
    const where = check.space?.over
        ? `${check.space.name} está com ${check.space.capacity} de ${check.space.capacity} lugares ocupados`
        : `capacidade de ${check.mode === 'hotel' ? 'hotel' : 'creche'} (${check.max}) atingida`;
    if (check.policy === 'block') {
        throw new BoardingHttpError(409, `Check-in bloqueado: ${where}.`, { capacity: check, code: 'CAPACITY_BLOCKED' });
    }
    if (!force) {
        throw new BoardingHttpError(409, `Atenção: ${where}. Confirme para continuar.`, {
            capacity: check,
            code: 'CAPACITY_WARNING',
        });
    }
}
// ─── Estadias do intervalo ────────────────────────────────────────────────
/** Reservas que cobrem o intervalo (vários dias inclusos). */
async function loadReservationsOverlapping(args) {
    let q = supabase_1.supabaseAdmin
        .from('hub_boarding_reservations')
        .select('*')
        .eq('clinic_id', args.clinicId)
        .is('deleted_at', null)
        .or(`status.in.(reserved,checked_in),checked_out_at.gte.${args.from}`);
    if (!args.includeInactive)
        q = q.not('status', 'in', '("cancelled","no_show")');
    if (args.unitId)
        q = q.eq('unit_id', args.unitId);
    const { data, error } = await q;
    if (error) {
        if (error.message?.includes('hub_boarding_reservations'))
            return { rows: [], tableExists: false };
        throw new Error(error.message);
    }
    const nowIso = new Date().toISOString();
    const rows = (data ?? []).filter((r) => (0, boardingOperational_1.reservationOverlapsRange)(r, args.from, args.to, nowIso));
    return { rows, tableExists: true };
}
