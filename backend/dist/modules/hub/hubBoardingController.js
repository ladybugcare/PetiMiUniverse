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
exports.getHubBoardingCalendar = exports.getHubBoardingOccupancy = exports.patchHubBoardingUnitSettings = exports.getHubBoardingUnitSettings = exports.postHubBoardingRevertHandoffReady = exports.postHubBoardingReleaseForHandoff = exports.postHubBoardingStartCheckoutPrep = exports.patchHubBoardingReservation = exports.createHubBoardingReservation = exports.openHubBoardingReservationFromAppointment = exports.getHubBoardingDayBoard = void 0;
exports.loadBoardingDayItems = loadBoardingDayItems;
const supabase_1 = require("../../config/supabase");
const hubComandasController_1 = require("./hubComandasController");
const hubNotifyEvents_1 = require("./hubNotifyEvents");
const groomingPetTags_1 = require("./groomingPetTags");
const hubDayBoardPets_1 = require("./hubDayBoardPets");
const boardingOperational_1 = require("./boardingOperational");
const hubBoardingSchemas_1 = require("./hubBoardingSchemas");
const boardingCareService_1 = require("./boardingCareService");
const boardingPricing_1 = require("./boardingPricing");
const boardingBilling_1 = require("./boardingBilling");
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
function stripNewColumns(payload) {
    return Object.fromEntries(Object.entries(payload).filter(([k]) => BASE_RESERVATION_COLUMNS.has(k)));
}
async function writeReservation(op, payload, filter) {
    const run = async (p) => {
        if (op === 'insert') {
            return supabase_1.supabaseAdmin.from('hub_boarding_reservations').insert(p).select(RESERVATION_SELECT).single();
        }
        return supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .update(p)
            .eq('id', filter.id)
            .eq('clinic_id', filter.clinicId)
            .select(RESERVATION_SELECT)
            .single();
    };
    let { data, error } = await run(payload);
    if (error && /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? '')) {
        ({ data, error } = await run(stripNewColumns(payload)));
    }
    if (error)
        throw new Error(error.message);
    return data;
}
function sendBoardingError(res, e, fallback, tag) {
    if (e instanceof boardingCareService_1.BoardingHttpError) {
        return res.status(e.status).json({ error: e.message, ...(e.extra ?? {}) });
    }
    console.error(tag, e);
    return res.status(500).json({ error: e?.message || fallback });
}
async function getBoardingServiceTypeIds(clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id')
        .eq('clinic_id', clinicId)
        .in('service_group', boardingOperational_1.BOARDING_SERVICE_GROUPS)
        .is('deleted_at', null);
    if (error)
        throw error;
    return (data ?? []).map((r) => r.id);
}
async function loadBoardingDayItems(args) {
    const { clinicId, unitId, mode, from, to } = args;
    const boardingTypeIds = await getBoardingServiceTypeIds(clinicId);
    const boardingTypeSet = new Set(boardingTypeIds);
    let apptQ = supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, clinic_id, unit_id, pet_id, guardian_id, starts_at, ends_at, status, title, hub_service_type_id, appointment_kind, notes')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .lt('starts_at', to)
        .gt('ends_at', from)
        .order('starts_at', { ascending: true });
    if (unitId)
        apptQ = apptQ.eq('unit_id', unitId);
    const { data: appointmentsRaw, error: apptErr } = await apptQ;
    if (apptErr)
        throw new Error(apptErr.message);
    const apptRowsRaw = (appointmentsRaw ?? []);
    const apptIdsAll = apptRowsRaw.map((a) => a.id);
    const lineTypeIdsByAppt = new Map();
    if (apptIdsAll.length > 0) {
        const { data: lineRows, error: lineErr } = await supabase_1.supabaseAdmin
            .from('hub_appointment_services')
            .select('appointment_id, hub_service_type_id')
            .in('appointment_id', apptIdsAll);
        if (lineErr)
            throw new Error(lineErr.message);
        for (const row of lineRows ?? []) {
            const aid = row.appointment_id;
            const stid = row.hub_service_type_id;
            const list = lineTypeIdsByAppt.get(aid) ?? [];
            list.push(stid);
            lineTypeIdsByAppt.set(aid, list);
        }
    }
    const boardingAppts = apptRowsRaw.filter((a) => (0, boardingOperational_1.appointmentMatchesBoardingTypes)(a, boardingTypeSet, lineTypeIdsByAppt));
    const boardingApptIdSet = new Set(boardingAppts.map((a) => a.id));
    const boardingTypesConfigured = boardingTypeIds.length > 0 || boardingAppts.length > 0;
    // Estadias que cobrem o dia (inclui hóspedes de vários dias e reservas futuras do dia).
    const { rows: overlapping, tableExists: reservationsTableExists } = await (0, boardingCareService_1.loadReservationsOverlapping)({
        clinicId,
        unitId,
        from,
        to,
    });
    const reservationByApptId = new Map();
    const standaloneReservations = [];
    for (const r of overlapping) {
        if (r.hub_appointment_id && boardingApptIdSet.has(r.hub_appointment_id)) {
            reservationByApptId.set(r.hub_appointment_id, r);
        }
        else {
            standaloneReservations.push(r);
        }
    }
    // Agendamentos do dia com reserva já existente fora da sobreposição (ex.: check-out mais cedo).
    const apptIdsWithoutRsv = boardingAppts
        .map((a) => a.id)
        .filter((id) => !reservationByApptId.has(id));
    if (reservationsTableExists && apptIdsWithoutRsv.length) {
        const { data: extraRsv } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select(RESERVATION_SELECT)
            .eq('clinic_id', clinicId)
            .in('hub_appointment_id', apptIdsWithoutRsv)
            .is('deleted_at', null);
        for (const r of (extraRsv ?? [])) {
            if (r.hub_appointment_id)
                reservationByApptId.set(r.hub_appointment_id, r);
        }
    }
    const petIds = new Set();
    const guIds = new Set();
    for (const a of boardingAppts) {
        if (a.pet_id)
            petIds.add(a.pet_id);
        if (a.guardian_id)
            guIds.add(a.guardian_id);
    }
    for (const r of [...standaloneReservations, ...reservationByApptId.values()]) {
        if (r.pet_id)
            petIds.add(r.pet_id);
        if (r.guardian_id)
            guIds.add(r.guardian_id);
    }
    const guardiansMissingPet = new Set();
    for (const a of boardingAppts) {
        if (!a.pet_id && a.guardian_id)
            guardiansMissingPet.add(a.guardian_id);
    }
    const petByGuardian = await (0, hubDayBoardPets_1.resolvePrimaryPetIdsByGuardians)(clinicId, guardiansMissingPet);
    for (const pid of petByGuardian.values())
        petIds.add(pid);
    const { data: gusData } = guIds.size
        ? await supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', [...guIds])
        : { data: [] };
    const petMap = await (0, hubDayBoardPets_1.fetchHubPetsMapByIds)(petIds);
    const guMap = new Map((gusData ?? []).map((g) => [g.id, g]));
    const flagsByPet = new Map();
    if (petIds.size) {
        const { data: fr, error: frErr } = await supabase_1.supabaseAdmin
            .from('hub_pet_clinical_flags')
            .select('pet_id, flag_key, label')
            .eq('clinic_id', clinicId)
            .in('pet_id', [...petIds])
            .eq('active', true)
            .is('deleted_at', null);
        if (!frErr && fr) {
            for (const row of fr) {
                const pid = row.pet_id;
                const list = flagsByPet.get(pid) ?? [];
                list.push({ flag_key: String(row.flag_key), label: String(row.label || '') });
                flagsByPet.set(pid, list);
            }
        }
    }
    const tagsForPet = (pid) => {
        if (!pid)
            return [];
        const petRow = petMap.get(pid);
        return (0, groomingPetTags_1.buildGroomingDisplayTags)(flagsByPet.get(pid) ?? [], petRow?.notes ?? null, petRow?.behavior_tags ?? null);
    };
    const nowMs = Date.now();
    const nightsFor = (rMode, checkedInAt, checkedOutAt) => rMode === 'hotel' ? (0, boardingOperational_1.calcBoardingNights)(checkedInAt, checkedOutAt) : checkedInAt ? 1 : 0;
    const reservationExtras = (r) => ({
        space_id: r?.space_id ?? null,
        daycare_shift_key: r?.daycare_shift_key ?? null,
        daycare_period: r?.daycare_period ?? null,
        hub_service_type_id: r?.hub_service_type_id ?? null,
        checked_in_at: r?.checked_in_at ?? null,
        checked_out_at: r?.checked_out_at ?? null,
    });
    const items = [];
    for (const a of boardingAppts) {
        const apptId = a.id;
        const reservation = reservationByApptId.get(apptId) ?? null;
        const guardianId = reservation?.guardian_id ?? a.guardian_id;
        let petId = (0, hubDayBoardPets_1.coalesceAppointmentPetId)(a.pet_id, reservation?.pet_id ?? null);
        if (!petId && guardianId)
            petId = petByGuardian.get(guardianId) ?? null;
        const apptMode = reservation?.mode ??
            (0, boardingOperational_1.modeFromAppointmentKind)(a.appointment_kind);
        if (mode && mode !== 'all' && apptMode !== mode)
            continue;
        const apptStatus = a.status;
        const boardingStage = reservation ? reservation.status : (0, boardingOperational_1.stageFromAppointmentStatus)(apptStatus);
        const startsAt = reservation?.expected_check_in ?? a.starts_at;
        const endsAt = reservation?.expected_check_out ?? a.ends_at;
        const checkedOutAt = reservation?.checked_out_at ?? null;
        const isLate = boardingStage === 'checked_in' && checkedOutAt === null && endsAt && new Date(endsAt).getTime() < nowMs;
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
        if (mode && mode !== 'all' && rMode !== mode)
            continue;
        const endsAt = r.expected_check_out ?? null;
        const isLate = (r.status === 'checked_in' ||
            r.status === 'checkout_preparing' ||
            r.status === 'ready_for_handoff') &&
            !r.checked_out_at &&
            endsAt != null &&
            new Date(endsAt).getTime() < nowMs;
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
const getHubBoardingDayBoard = async (req, res) => {
    try {
        const parsed = hubBoardingSchemas_1.dayBoardQuerySchema.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, unit_id, mode } = parsed.data;
        const { from, to, dateYmd } = (0, boardingOperational_1.resolveDayBoardRange)(parsed.data);
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
    }
    catch (e) {
        return sendBoardingError(res, e, 'Erro ao carregar painel de Hotel & Creche', 'getHubBoardingDayBoard');
    }
};
exports.getHubBoardingDayBoard = getHubBoardingDayBoard;
// ─── POST /boarding/reservations/open-from-appointment ────────────────────
const openHubBoardingReservationFromAppointment = async (req, res) => {
    try {
        const { force_capacity, ...openBody } = (req.body ?? {});
        const parsed = hubBoardingSchemas_1.openFromApptSchema.safeParse(openBody);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, hub_appointment_id } = parsed.data;
        const force = force_capacity === true;
        const { data: existing, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select(RESERVATION_SELECT)
            .eq('hub_appointment_id', hub_appointment_id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (exErr)
            return res.status(500).json({ error: exErr.message });
        if (existing)
            return res.json({ reservation: existing, created: false });
        const { data: appt, error: apptErr } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('pet_id, guardian_id, unit_id, starts_at, ends_at, appointment_kind, hub_service_type_id')
            .eq('id', hub_appointment_id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (apptErr)
            return res.status(500).json({ error: apptErr.message });
        if (!appt)
            return res.status(404).json({ error: 'Agendamento não encontrado' });
        if (!appt.pet_id)
            return res.status(422).json({ error: 'Agendamento sem pet associado' });
        let mode = appt.appointment_kind === 'daycare_block' ? 'daycare' : 'hotel';
        if (appt.appointment_kind !== 'daycare_block' && appt.appointment_kind !== 'hotel_stay') {
            const svcId = appt.hub_service_type_id ?? null;
            if (svcId) {
                const { data: st } = await supabase_1.supabaseAdmin
                    .from('hub_service_types')
                    .select('service_group')
                    .eq('id', svcId)
                    .maybeSingle();
                if (String(st?.service_group ?? '').trim() === 'creche')
                    mode = 'daycare';
            }
        }
        const capacity = await (0, boardingCareService_1.checkCapacityForCheckIn)({
            clinicId: clinic_id,
            unitId: appt.unit_id ?? null,
            mode,
        });
        (0, boardingCareService_1.assertCapacityAllowed)(capacity, force);
        const rate = await (0, boardingPricing_1.resolveBoardingRateFromAppointment)({
            clinicId: clinic_id,
            appointmentId: hub_appointment_id,
            primaryServiceTypeId: appt.hub_service_type_id ?? null,
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
        await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .update({ status: 'in_progress' })
            .eq('id', hub_appointment_id)
            .eq('clinic_id', clinic_id);
        await (0, boardingCareService_1.prepareStayCare)(created);
        void (0, hubNotifyEvents_1.notifyHubBoardingCheckin)({
            clinicId: clinic_id,
            unitId: appt.unit_id ?? null,
            petId: appt.pet_id,
            reservationId: created.id,
            excludeUserIds: req.user?.id ? [req.user.id] : undefined,
        });
        return res.status(201).json({ reservation: created, created: true, capacity });
    }
    catch (e) {
        return sendBoardingError(res, e, 'Erro ao abrir reserva', 'openHubBoardingReservationFromAppointment');
    }
};
exports.openHubBoardingReservationFromAppointment = openHubBoardingReservationFromAppointment;
// ─── POST /boarding/reservations (nova hospedagem: entrada agora ou reserva futura) ──
const createHubBoardingReservation = async (req, res) => {
    try {
        const force = req.body?.force_capacity === true;
        const body = { ...(req.body ?? {}) };
        delete body.force_capacity;
        const parsed = hubBoardingSchemas_1.createReservationSchema.safeParse(body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
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
            capacity = await (0, boardingCareService_1.checkCapacityForCheckIn)({
                clinicId: clinic_id,
                unitId: rest.unit_id ?? null,
                mode: rest.mode,
                spaceId: rest.space_id ?? null,
                shiftKey: rest.daycare_shift_key ?? null,
            });
            (0, boardingCareService_1.assertCapacityAllowed)(capacity, force);
        }
        const payload = { clinic_id, ...rest, status };
        if (status === 'checked_in')
            payload.checked_in_at = nowIso;
        if (rest.mode === 'daycare' && !rest.daycare_period)
            payload.daycare_period = 'full_day';
        if (rest.daily_rate_cents != null) {
            payload.rate_source = 'manual';
        }
        else {
            const refIso = rest.expected_check_in ?? nowIso;
            const rate = await (0, boardingPricing_1.resolveBoardingRateFromServiceType)({
                clinicId: clinic_id,
                petId: rest.pet_id,
                mode: rest.mode,
                serviceTypeId: rest.hub_service_type_id ?? null,
                daycarePeriod: payload.daycare_period ?? null,
                refYmd: (0, boardingBilling_1.boardingLocalParts)(refIso)?.ymd ?? (0, boardingPricing_1.todayYmdSaoPaulo)(),
            });
            if (rate) {
                payload.daily_rate_cents = rate.daily_rate_cents;
                payload.hub_service_type_id = rate.hub_service_type_id;
                payload.rate_source = rate.rate_source;
            }
        }
        const reservation = await writeReservation('insert', payload);
        await (0, boardingCareService_1.prepareStayCare)(reservation);
        if (status === 'checked_in') {
            void (0, hubNotifyEvents_1.notifyHubBoardingCheckin)({
                clinicId: clinic_id,
                unitId: reservation.unit_id ?? null,
                petId: reservation.pet_id ?? null,
                reservationId: reservation.id,
                excludeUserIds: req.user?.id ? [req.user.id] : undefined,
            });
        }
        return res.status(201).json({ reservation, capacity });
    }
    catch (e) {
        return sendBoardingError(res, e, 'Erro ao criar reserva', 'createHubBoardingReservation');
    }
};
exports.createHubBoardingReservation = createHubBoardingReservation;
// ─── PATCH /boarding/reservations/:id ─────────────────────────────────────
const patchHubBoardingReservation = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
            return res.status(400).json({ error: 'ID de reserva inválido' });
        }
        const parsed = hubBoardingSchemas_1.patchReservationSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, status: newStatus, reprice, force_capacity, ...rest } = parsed.data;
        const current = await (0, boardingCareService_1.loadReservation)(clinic_id, id);
        if (!current)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        const previousStatus = current.status;
        if (newStatus && newStatus !== previousStatus && !(0, boardingOperational_1.isValidStatusTransition)(previousStatus, newStatus)) {
            return res.status(422).json({ error: `Transição inválida: ${previousStatus} → ${newStatus}` });
        }
        if (newStatus === 'checked_out') {
            return res.status(422).json({
                error: 'O check-out fecha na Operação da Recepção após liberar o pet. Use Liberar para recepção e depois Entreguei/Embarquei.',
            });
        }
        if (newStatus === 'checkout_preparing' || newStatus === 'ready_for_handoff') {
            return res.status(422).json({
                error: 'Use os endpoints de preparação/liberação da estadia para este status.',
            });
        }
        const updatePayload = { ...rest };
        if (newStatus)
            updatePayload.status = newStatus;
        const nowIso = new Date().toISOString();
        if (newStatus === 'checked_in' && !rest.checked_in_at && previousStatus !== 'checked_in') {
            updatePayload.checked_in_at = nowIso;
        }
        const enteringNow = newStatus === 'checked_in' && previousStatus !== 'checked_in';
        const spaceChanged = rest.space_id !== undefined && rest.space_id !== current.space_id && rest.space_id != null;
        let capacity = null;
        if (enteringNow || (spaceChanged && (newStatus ?? previousStatus) === 'checked_in')) {
            capacity = await (0, boardingCareService_1.checkCapacityForCheckIn)({
                clinicId: clinic_id,
                unitId: current.unit_id,
                mode: current.mode,
                reservationId: id,
                spaceId: rest.space_id ?? current.space_id ?? null,
                shiftKey: rest.daycare_shift_key ?? current.daycare_shift_key ?? null,
            });
            if (!enteringNow)
                capacity = { ...capacity, over: false };
            (0, boardingCareService_1.assertCapacityAllowed)(capacity, force_capacity);
        }
        if (rest.daily_rate_cents !== undefined && !reprice)
            updatePayload.rate_source = 'manual';
        const pricingChanged = reprice ||
            (rest.daily_rate_cents === undefined &&
                ((rest.hub_service_type_id !== undefined && rest.hub_service_type_id !== current.hub_service_type_id) ||
                    (rest.daycare_period !== undefined && rest.daycare_period !== current.daycare_period)));
        if (pricingChanged) {
            const rate = await (0, boardingPricing_1.resolveBoardingRateFromServiceType)({
                clinicId: clinic_id,
                petId: current.pet_id,
                mode: current.mode,
                serviceTypeId: rest.hub_service_type_id ?? current.hub_service_type_id ?? null,
                daycarePeriod: (rest.daycare_period ?? current.daycare_period) ?? null,
                refYmd: (0, boardingBilling_1.boardingLocalParts)(current.checked_in_at ?? current.expected_check_in ?? nowIso)?.ymd ?? (0, boardingPricing_1.todayYmdSaoPaulo)(),
            });
            if (rate) {
                updatePayload.daily_rate_cents = rate.daily_rate_cents;
                updatePayload.hub_service_type_id = rate.hub_service_type_id;
                updatePayload.rate_source = rate.rate_source;
            }
        }
        const updated = (await writeReservation('update', updatePayload, { id, clinicId: clinic_id }));
        const apptId = current.hub_appointment_id;
        if (apptId && newStatus && newStatus !== previousStatus) {
            const apptStatus = newStatus === 'checked_in' ? 'in_progress' : newStatus === 'cancelled' ? 'cancelled' : undefined;
            if (apptStatus) {
                await supabase_1.supabaseAdmin.from('hub_appointments').update({ status: apptStatus }).eq('id', apptId).eq('clinic_id', clinic_id);
            }
        }
        // Tarefas acompanham a estadia: datas mudaram → refaz pendentes; cancelou → remove o que ficou.
        try {
            if (newStatus === 'cancelled' || newStatus === 'no_show') {
                await (0, boardingCareService_1.dropPendingTasksAfter)(clinic_id, id, null);
            }
            else if (enteringNow ||
                rest.expected_check_in !== undefined ||
                rest.expected_check_out !== undefined ||
                rest.checked_in_at !== undefined) {
                await (0, boardingCareService_1.syncReservationTasks)(updated);
            }
        }
        catch (taskErr) {
            console.error('patchHubBoardingReservation tasks', taskErr);
        }
        if ((rest.daily_rate_cents !== undefined || pricingChanged) &&
            (newStatus ?? previousStatus) === 'checked_out') {
            void (0, hubComandasController_1.syncOpenComandasAfterBoardingCheckedOut)(clinic_id, id);
        }
        if (newStatus && newStatus !== previousStatus) {
            const notifyArgs = {
                clinicId: clinic_id,
                unitId: current.unit_id,
                petId: current.pet_id,
                reservationId: id,
                excludeUserIds: req.user?.id ? [req.user.id] : undefined,
            };
            if (newStatus === 'checked_in')
                void (0, hubNotifyEvents_1.notifyHubBoardingCheckin)(notifyArgs);
        }
        if (newStatus && newStatus !== previousStatus && current.pet_id) {
            try {
                const { syncReceptionHandoffsForPet } = await Promise.resolve().then(() => __importStar(require('./receptionHandoffService')));
                await syncReceptionHandoffsForPet(clinic_id, current.pet_id);
            }
            catch (syncErr) {
                console.error('patchHubBoardingReservation reception sync', syncErr);
            }
        }
        return res.json({ reservation: updated, capacity });
    }
    catch (e) {
        return sendBoardingError(res, e, 'Erro ao atualizar reserva', 'patchHubBoardingReservation');
    }
};
exports.patchHubBoardingReservation = patchHubBoardingReservation;
async function staffIdForUser(clinicId, userId) {
    if (!userId)
        return null;
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_staff_members')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();
    return data?.id ?? null;
}
async function assertExitChargeAllowed(clinicId, unitId, petId) {
    const settings = await (0, boardingCareService_1.loadUnitSettings)(clinicId, unitId);
    if (!settings.block_exit_if_charge_pending)
        return;
    const pending = await (0, boardingCareService_1.petHasOpenBoardingCharge)(clinicId, petId);
    if (pending) {
        throw new boardingCareService_1.BoardingHttpError(409, 'Há cobrança em aberto no Caixa. Quite a comanda antes de liberar a saída.');
    }
}
/** POST /boarding/reservations/:id/start-checkout-prep */
const postHubBoardingStartCheckoutPrep = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
            return res.status(400).json({ error: 'ID de reserva inválido' });
        }
        const parsed = hubBoardingSchemas_1.startCheckoutPrepSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id } = parsed.data;
        const current = await (0, boardingCareService_1.loadReservation)(clinic_id, id);
        if (!current)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        if (current.status !== 'checked_in' && current.status !== 'checkout_preparing') {
            return res.status(422).json({ error: `Não é possível preparar saída a partir de ${current.status}` });
        }
        if (current.status === 'checkout_preparing') {
            return res.json({ reservation: current });
        }
        const updated = (await writeReservation('update', { status: 'checkout_preparing' }, { id, clinicId: clinic_id }));
        try {
            const { syncReceptionHandoffsForPet } = await Promise.resolve().then(() => __importStar(require('./receptionHandoffService')));
            await syncReceptionHandoffsForPet(clinic_id, current.pet_id);
        }
        catch (syncErr) {
            console.error('postHubBoardingStartCheckoutPrep sync', syncErr);
        }
        return res.json({ reservation: updated });
    }
    catch (e) {
        return sendBoardingError(res, e, 'Erro ao iniciar preparação de saída', 'postHubBoardingStartCheckoutPrep');
    }
};
exports.postHubBoardingStartCheckoutPrep = postHubBoardingStartCheckoutPrep;
/** POST /boarding/reservations/:id/release-for-handoff */
const postHubBoardingReleaseForHandoff = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
            return res.status(400).json({ error: 'ID de reserva inválido' });
        }
        const parsed = hubBoardingSchemas_1.releaseForHandoffSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, force_belongings, force_belongings_reason } = parsed.data;
        const current = await (0, boardingCareService_1.loadReservation)(clinic_id, id);
        if (!current)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        if (current.status !== 'checked_in' && current.status !== 'checkout_preparing' && current.status !== 'ready_for_handoff') {
            return res.status(422).json({ error: `Não é possível liberar a saída a partir de ${current.status}` });
        }
        if (current.status === 'ready_for_handoff') {
            return res.json({ reservation: current });
        }
        await assertExitChargeAllowed(clinic_id, current.unit_id, current.pet_id);
        const { data: belongings, error: bErr } = await supabase_1.supabaseAdmin
            .from('hub_boarding_belongings')
            .select('id, checkout_status')
            .eq('clinic_id', clinic_id)
            .eq('hub_boarding_reservation_id', id)
            .is('deleted_at', null);
        if (bErr && !(0, boardingCareService_1.missingTable)(bErr))
            throw new Error(bErr.message);
        const pendingBelongings = (belongings ?? []).filter((b) => b.checkout_status === 'pending');
        if (pendingBelongings.length > 0 && !force_belongings) {
            return res.status(422).json({
                error: `Há ${pendingBelongings.length} pertence(s) sem conferir. Confira ou force a liberação.`,
                pending_belongings: pendingBelongings.length,
            });
        }
        if (pendingBelongings.length > 0 && force_belongings && !force_belongings_reason?.trim()) {
            return res.status(400).json({ error: 'Informe o motivo para liberar com pertences pendentes.' });
        }
        const nowIso = new Date().toISOString();
        const staffId = await staffIdForUser(clinic_id, req.user?.id);
        const releasePayload = {
            status: 'ready_for_handoff',
            handoff_ready_at: nowIso,
            handoff_ready_by_staff_id: staffId,
        };
        if (pendingBelongings.length > 0 && force_belongings_reason?.trim()) {
            releasePayload.notes = `${current.notes ? `${current.notes}\n` : ''}[Liberação com pertences pendentes] ${force_belongings_reason.trim()}`;
        }
        const updated = (await writeReservation('update', releasePayload, { id, clinicId: clinic_id }));
        try {
            const { syncReceptionHandoffsForPet } = await Promise.resolve().then(() => __importStar(require('./receptionHandoffService')));
            await syncReceptionHandoffsForPet(clinic_id, current.pet_id);
        }
        catch (syncErr) {
            console.error('postHubBoardingReleaseForHandoff sync', syncErr);
        }
        return res.json({ reservation: updated });
    }
    catch (e) {
        return sendBoardingError(res, e, 'Erro ao liberar para a recepção', 'postHubBoardingReleaseForHandoff');
    }
};
exports.postHubBoardingReleaseForHandoff = postHubBoardingReleaseForHandoff;
/** POST /boarding/reservations/:id/revert-handoff-ready */
const postHubBoardingRevertHandoffReady = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
            return res.status(400).json({ error: 'ID de reserva inválido' });
        }
        const parsed = hubBoardingSchemas_1.revertHandoffReadySchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id } = parsed.data;
        const current = await (0, boardingCareService_1.loadReservation)(clinic_id, id);
        if (!current)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        if (current.status !== 'ready_for_handoff') {
            return res.status(422).json({ error: 'Só é possível voltar a preparação a partir de pronto para recepção.' });
        }
        const updated = (await writeReservation('update', {
            status: 'checkout_preparing',
            handoff_ready_at: null,
            handoff_ready_by_staff_id: null,
        }, { id, clinicId: clinic_id }));
        try {
            const { syncReceptionHandoffsForPet } = await Promise.resolve().then(() => __importStar(require('./receptionHandoffService')));
            await syncReceptionHandoffsForPet(clinic_id, current.pet_id);
        }
        catch (syncErr) {
            console.error('postHubBoardingRevertHandoffReady sync', syncErr);
        }
        return res.json({ reservation: updated });
    }
    catch (e) {
        return sendBoardingError(res, e, 'Erro ao voltar preparação de saída', 'postHubBoardingRevertHandoffReady');
    }
};
exports.postHubBoardingRevertHandoffReady = postHubBoardingRevertHandoffReady;
// ─── Configurações da unidade ───────────────────────────────────────────────
const getHubBoardingUnitSettings = async (req, res) => {
    const parsed = hubBoardingSchemas_1.unitSettingsQuerySchema.safeParse(req.query);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, unit_id } = parsed.data;
    try {
        let q = supabase_1.supabaseAdmin.from('hub_unit_boarding_settings').select('*').eq('clinic_id', clinic_id);
        if (unit_id)
            q = q.eq('unit_id', unit_id);
        const { data, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ settings: data ?? [] });
    }
    catch (e) {
        return sendBoardingError(res, e, 'Erro ao buscar configurações', 'getHubBoardingUnitSettings');
    }
};
exports.getHubBoardingUnitSettings = getHubBoardingUnitSettings;
const patchHubBoardingUnitSettings = async (req, res) => {
    const parsed = hubBoardingSchemas_1.unitSettingsPatchSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, unit_id, ...fields } = parsed.data;
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_unit_boarding_settings')
            .upsert({ unit_id, clinic_id, ...fields }, { onConflict: 'unit_id' })
            .select()
            .single();
        if (error) {
            if ((0, boardingCareService_1.missingTable)(error) || /column/i.test(error.message ?? '')) {
                return res.status(503).json({
                    error: 'Configurações novas de Hotel & Creche indisponíveis. Execute as migrações 127 e 131 no Supabase.',
                });
            }
            return res.status(500).json({ error: error.message });
        }
        if (fields.meal_slot_times || fields.recreation_windows) {
            try {
                await (0, boardingCareService_1.resyncOpenStayTasks)(clinic_id, unit_id);
            }
            catch (err) {
                console.error('resyncOpenStayTasks', err);
            }
        }
        return res.json({ settings: data });
    }
    catch (e) {
        return sendBoardingError(res, e, 'Erro ao salvar configurações', 'patchHubBoardingUnitSettings');
    }
};
exports.patchHubBoardingUnitSettings = patchHubBoardingUnitSettings;
// ─── Ocupação ───────────────────────────────────────────────────────────────
const getHubBoardingOccupancy = async (req, res) => {
    const parsed = hubBoardingSchemas_1.occupancyQuerySchema.safeParse(req.query);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, unit_id, mode } = parsed.data;
    try {
        const dateYmd = parsed.data.date ?? parsed.data.from?.slice(0, 10) ?? (0, boardingPricing_1.todayYmdSaoPaulo)();
        const { from, to } = parsed.data.from && parsed.data.to
            ? { from: parsed.data.from, to: parsed.data.to }
            : (0, boardingOperational_1.dayBoundsFromYmdSaoPaulo)(dateYmd);
        const { rows } = await (0, boardingCareService_1.loadReservationsOverlapping)({ clinicId: clinic_id, unitId: unit_id, from, to });
        const active = rows.filter((r) => (r.status === 'reserved' ||
            r.status === 'checked_in' ||
            r.status === 'checkout_preparing' ||
            r.status === 'ready_for_handoff') &&
            (!mode || mode === 'all' || r.mode === mode));
        const settings = await (0, boardingCareService_1.loadUnitSettings)(clinic_id, unit_id);
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
                over_capacity: daycareMax != null
                    ? shifts.length
                        ? shifts.some((s) => s.over_capacity)
                        : daycareCount > daycareMax
                    : false,
                shifts,
            },
            overbooking_policy: settings.overbooking_policy,
        });
    }
    catch (e) {
        return sendBoardingError(res, e, 'Erro ao calcular ocupação', 'getHubBoardingOccupancy');
    }
};
exports.getHubBoardingOccupancy = getHubBoardingOccupancy;
// ─── Calendário de reservas futuras ─────────────────────────────────────────
const getHubBoardingCalendar = async (req, res) => {
    const parsed = hubBoardingSchemas_1.calendarQuerySchema.safeParse(req.query);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, unit_id, from, to, mode } = parsed.data;
    try {
        const fromTs = new Date(`${from}T00:00:00-03:00`).toISOString();
        const toTs = new Date(`${to}T23:59:59.999-03:00`).toISOString();
        const { rows } = await (0, boardingCareService_1.loadReservationsOverlapping)({ clinicId: clinic_id, unitId: unit_id, from: fromTs, to: toTs });
        const filtered = rows.filter((r) => !mode || mode === 'all' || r.mode === mode);
        const petIds = new Set(filtered.map((r) => r.pet_id));
        const guIds = [...new Set(filtered.map((r) => r.guardian_id).filter(Boolean))];
        const [{ data: pets }, { data: gus }] = await Promise.all([
            petIds.size
                ? supabase_1.supabaseAdmin.from('hub_pets').select('id, name, size_tier').in('id', [...petIds])
                : Promise.resolve({ data: [] }),
            guIds.length
                ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', guIds)
                : Promise.resolve({ data: [] }),
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
    }
    catch (e) {
        return sendBoardingError(res, e, 'Erro ao buscar calendário', 'getHubBoardingCalendar');
    }
};
exports.getHubBoardingCalendar = getHubBoardingCalendar;
