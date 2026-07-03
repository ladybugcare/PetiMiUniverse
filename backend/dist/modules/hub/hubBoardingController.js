"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHubBoardingCalendar = exports.getHubBoardingOccupancy = exports.patchHubBoardingUnitSettings = exports.getHubBoardingUnitSettings = exports.patchHubBoardingReservation = exports.createHubBoardingReservation = exports.openHubBoardingReservationFromAppointment = exports.getHubBoardingDayBoard = void 0;
const supabase_1 = require("../../config/supabase");
const hubComandasController_1 = require("./hubComandasController");
const groomingPetTags_1 = require("./groomingPetTags");
const hubDayBoardPets_1 = require("./hubDayBoardPets");
const boardingOperational_1 = require("./boardingOperational");
const hubBoardingSchemas_1 = require("./hubBoardingSchemas");
const RESERVATION_SELECT = `
  id, clinic_id, unit_id, pet_id, guardian_id, hub_appointment_id,
  mode, status, expected_check_in, expected_check_out,
  checked_in_at, checked_out_at, daily_rate_cents, notes,
  created_at, updated_at
`;
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
// ─── GET /boarding/day-board ───────────────────────────────────────────────
const getHubBoardingDayBoard = async (req, res) => {
    try {
        const parsed = hubBoardingSchemas_1.dayBoardQuerySchema.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, unit_id, mode } = parsed.data;
        const { from, to, dateYmd } = (0, boardingOperational_1.resolveDayBoardRange)(parsed.data);
        const boardingTypeIds = await getBoardingServiceTypeIds(clinic_id);
        const boardingTypeSet = new Set(boardingTypeIds);
        // Agendamentos do dia com overlap temporal
        let apptQ = supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id, clinic_id, unit_id, pet_id, guardian_id, starts_at, ends_at, status, title, hub_service_type_id, appointment_kind, notes')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .lt('starts_at', to)
            .gt('ends_at', from)
            .order('starts_at', { ascending: true });
        if (unit_id)
            apptQ = apptQ.eq('unit_id', unit_id);
        const { data: appointmentsRaw, error: apptErr } = await apptQ;
        if (apptErr)
            return res.status(500).json({ error: apptErr.message });
        const apptRowsRaw = (appointmentsRaw ?? []);
        const apptIdsAll = apptRowsRaw.map((a) => a.id);
        // Linhas de serviço (multi-serviço)
        const lineTypeIdsByAppt = new Map();
        if (apptIdsAll.length > 0) {
            const { data: lineRows, error: lineErr } = await supabase_1.supabaseAdmin
                .from('hub_appointment_services')
                .select('appointment_id, hub_service_type_id')
                .in('appointment_id', apptIdsAll);
            if (lineErr)
                return res.status(500).json({ error: lineErr.message });
            for (const row of lineRows ?? []) {
                const aid = row.appointment_id;
                const stid = row.hub_service_type_id;
                const list = lineTypeIdsByAppt.get(aid) ?? [];
                list.push(stid);
                lineTypeIdsByAppt.set(aid, list);
            }
        }
        // Filtrar somente agendamentos de boarding (por kind OU por service_group)
        const boardingAppts = apptRowsRaw.filter((a) => (0, boardingOperational_1.appointmentMatchesBoardingTypes)(a, boardingTypeSet, lineTypeIdsByAppt));
        const boardingApptIds = boardingAppts.map((a) => a.id);
        const boardingTypesConfigured = boardingTypeIds.length > 0 || boardingAppts.length > 0;
        // Reservas ativas (Fase 2: hub_boarding_reservations)
        const reservationByApptId = new Map();
        const walkInReservations = [];
        let reservationsTableExists = true;
        {
            let rsvQ = supabase_1.supabaseAdmin
                .from('hub_boarding_reservations')
                .select(RESERVATION_SELECT)
                .eq('clinic_id', clinic_id)
                .is('deleted_at', null)
                .not('status', 'in', '("cancelled","no_show")');
            if (unit_id)
                rsvQ = rsvQ.eq('unit_id', unit_id);
            const { data: rsvData, error: rsvErr } = await rsvQ;
            if (rsvErr) {
                if (rsvErr.message?.includes('hub_boarding_reservations')) {
                    reservationsTableExists = false;
                }
                else {
                    return res.status(500).json({ error: rsvErr.message });
                }
            }
            else {
                const allRsv = (rsvData ?? []);
                for (const r of allRsv) {
                    const aid = r.hub_appointment_id;
                    if (aid) {
                        reservationByApptId.set(aid, r);
                    }
                    else {
                        // walk-in: reserva sem agendamento criada no dia ou check-in no dia
                        const createdAt = r.created_at;
                        const checkedInAt = r.checked_in_at;
                        const inDay = (checkedInAt && checkedInAt >= from && checkedInAt <= to) ||
                            (createdAt >= from && createdAt <= to);
                        if (inDay)
                            walkInReservations.push(r);
                    }
                }
            }
        }
        // Pets, tutores
        const petIds = new Set();
        const guIds = new Set();
        for (const a of boardingAppts) {
            if (a.pet_id)
                petIds.add(a.pet_id);
            if (a.guardian_id)
                guIds.add(a.guardian_id);
        }
        for (const r of walkInReservations) {
            if (r.pet_id)
                petIds.add(r.pet_id);
            if (r.guardian_id)
                guIds.add(r.guardian_id);
        }
        for (const r of reservationByApptId.values()) {
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
        for (const r of reservationByApptId.values()) {
            const gid = r.guardian_id;
            if (!r.pet_id && gid)
                guardiansMissingPet.add(gid);
        }
        const petByGuardian = await (0, hubDayBoardPets_1.resolvePrimaryPetIdsByGuardians)(clinic_id, guardiansMissingPet);
        for (const pid of petByGuardian.values())
            petIds.add(pid);
        const [gusRes] = await Promise.all([
            guIds.size
                ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', [...guIds])
                : Promise.resolve({ data: [] }),
        ]);
        const petMap = await (0, hubDayBoardPets_1.fetchHubPetsMapByIds)(petIds);
        const guMap = new Map((gusRes.data ?? []).map((g) => [g.id, g]));
        // Flags clínicas
        const flagsByPet = new Map();
        if (petIds.size) {
            const { data: fr, error: frErr } = await supabase_1.supabaseAdmin
                .from('hub_pet_clinical_flags')
                .select('pet_id, flag_key, label')
                .eq('clinic_id', clinic_id)
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
            return (0, groomingPetTags_1.buildGroomingDisplayTags)(flagsByPet.get(pid) ?? [], petRow?.notes ?? null);
        };
        const nowMs = Date.now();
        const items = [];
        // Itens de agendamentos de boarding
        for (const a of boardingAppts) {
            const apptId = a.id;
            const reservation = reservationByApptId.get(apptId);
            const guardianId = reservation?.guardian_id ?? a.guardian_id;
            let petId = (0, hubDayBoardPets_1.coalesceAppointmentPetId)(a.pet_id, reservation?.pet_id);
            if (!petId && guardianId)
                petId = petByGuardian.get(guardianId) ?? null;
            const apptMode = (0, boardingOperational_1.modeFromAppointmentKind)(a.appointment_kind);
            const apptStatus = a.status;
            // Filtro de aba (hotel / daycare)
            if (mode && mode !== 'all' && apptMode !== mode)
                continue;
            const boardingStage = reservation
                ? reservation.status
                : (0, boardingOperational_1.stageFromAppointmentStatus)(apptStatus);
            const startsAt = reservation
                ? reservation.expected_check_in ?? a.starts_at
                : a.starts_at;
            const endsAt = reservation
                ? reservation.expected_check_out ?? a.ends_at
                : a.ends_at;
            const checkedInAt = reservation?.checked_in_at ?? null;
            const checkedOutAt = reservation?.checked_out_at ?? null;
            const nightsCount = apptMode === 'hotel' ? (0, boardingOperational_1.calcBoardingNights)(checkedInAt, checkedOutAt) : checkedInAt ? 1 : 0;
            const isLate = boardingStage === 'checked_in' &&
                checkedOutAt === null &&
                endsAt &&
                new Date(endsAt).getTime() < nowMs;
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
                daily_rate_cents: reservation?.daily_rate_cents ?? null,
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
            const petId = r.pet_id;
            const rMode = r.mode;
            if (mode && mode !== 'all' && rMode !== mode)
                continue;
            const checkedInAt = r.checked_in_at ?? null;
            const checkedOutAt = r.checked_out_at ?? null;
            const nightsCount = rMode === 'hotel' ? (0, boardingOperational_1.calcBoardingNights)(checkedInAt, checkedOutAt) : checkedInAt ? 1 : 0;
            items.push({
                kind: 'reservation',
                reservation_id: r.id,
                appointment_id: null,
                boarding_stage: r.status,
                mode: rMode,
                appointment_status: null,
                is_walk_in: true,
                is_late: false,
                starts_at: r.expected_check_in ?? r.created_at,
                ends_at: r.expected_check_out ?? r.created_at,
                daily_rate_cents: r.daily_rate_cents ?? null,
                nights_count: nightsCount,
                notes: r.notes,
                pet: petMap.get(petId) ?? null,
                guardian: r.guardian_id ? guMap.get(r.guardian_id) : null,
                pet_id: petId,
                guardian_id: r.guardian_id ?? null,
                clinical_tags: tagsForPet(petId),
            });
        }
        items.sort((a, b) => {
            const ta = new Date(a.starts_at || 0).getTime();
            const tb = new Date(b.starts_at || 0).getTime();
            return ta - tb;
        });
        return res.json({
            items,
            date: dateYmd,
            clinic_id,
            boarding_types_configured: boardingTypesConfigured,
        });
    }
    catch (e) {
        console.error('getHubBoardingDayBoard', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar painel de Hotel & Creche' });
    }
};
exports.getHubBoardingDayBoard = getHubBoardingDayBoard;
// ─── POST /boarding/reservations/open-from-appointment ────────────────────
const openHubBoardingReservationFromAppointment = async (req, res) => {
    try {
        const parsed = hubBoardingSchemas_1.openFromApptSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, hub_appointment_id } = parsed.data;
        // Idempotência: retorna reserva existente
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
        // Busca agendamento para snapshot de dados
        const { data: appt, error: apptErr } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('pet_id, guardian_id, unit_id, starts_at, ends_at, appointment_kind')
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
        const mode = appt.appointment_kind === 'daycare_block' ? 'daycare' : 'hotel';
        const now = new Date().toISOString();
        const { data: created, error: insErr } = await supabase_1.supabaseAdmin
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
        if (insErr)
            return res.status(500).json({ error: insErr.message });
        // Sincroniza status do agendamento
        await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .update({ status: 'in_progress' })
            .eq('id', hub_appointment_id)
            .eq('clinic_id', clinic_id);
        return res.status(201).json({ reservation: created, created: true });
    }
    catch (e) {
        console.error('openHubBoardingReservationFromAppointment', e);
        return res.status(500).json({ error: e?.message || 'Erro ao abrir reserva' });
    }
};
exports.openHubBoardingReservationFromAppointment = openHubBoardingReservationFromAppointment;
// ─── POST /boarding/reservations (walk-in) ────────────────────────────────
const createHubBoardingReservation = async (req, res) => {
    try {
        const parsed = hubBoardingSchemas_1.createReservationSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, ...rest } = parsed.data;
        const { data: created, error: insErr } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .insert({ clinic_id, ...rest, status: 'checked_in', checked_in_at: new Date().toISOString() })
            .select(RESERVATION_SELECT)
            .single();
        if (insErr)
            return res.status(500).json({ error: insErr.message });
        return res.status(201).json({ reservation: created });
    }
    catch (e) {
        console.error('createHubBoardingReservation', e);
        return res.status(500).json({ error: e?.message || 'Erro ao criar reserva' });
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
        const { clinic_id, status: newStatus, ...rest } = parsed.data;
        // Busca reserva atual para validar transição
        const { data: current, error: fetchErr } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id, status, hub_appointment_id')
            .eq('id', id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (fetchErr)
            return res.status(500).json({ error: fetchErr.message });
        if (!current)
            return res.status(404).json({ error: 'Reserva não encontrada' });
        if (newStatus) {
            const currentStatus = current.status;
            if (!(0, boardingOperational_1.isValidStatusTransition)(currentStatus, newStatus)) {
                return res.status(422).json({
                    error: `Transição inválida: ${currentStatus} → ${newStatus}`,
                });
            }
        }
        const updatePayload = { ...rest };
        if (newStatus)
            updatePayload.status = newStatus;
        // Auto-preenche timestamps de transição
        if (newStatus === 'checked_in' && !rest.checked_in_at) {
            updatePayload.checked_in_at = new Date().toISOString();
        }
        if (newStatus === 'checked_out' && !rest.checked_out_at) {
            updatePayload.checked_out_at = new Date().toISOString();
        }
        const { data: updated, error: upErr } = await supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .update(updatePayload)
            .eq('id', id)
            .eq('clinic_id', clinic_id)
            .select(RESERVATION_SELECT)
            .single();
        if (upErr)
            return res.status(500).json({ error: upErr.message });
        // Sincroniza status do agendamento vinculado
        const apptId = current.hub_appointment_id;
        if (apptId && newStatus) {
            const apptStatus = newStatus === 'checked_in'
                ? 'in_progress'
                : newStatus === 'checked_out'
                    ? 'done'
                    : newStatus === 'cancelled'
                        ? 'cancelled'
                        : undefined;
            if (apptStatus) {
                await supabase_1.supabaseAdmin
                    .from('hub_appointments')
                    .update({ status: apptStatus })
                    .eq('id', apptId)
                    .eq('clinic_id', clinic_id);
            }
        }
        if (newStatus === 'checked_out') {
            void (0, hubComandasController_1.syncOpenComandasAfterBoardingCheckedOut)(clinic_id, id);
        }
        return res.json({ reservation: updated });
    }
    catch (e) {
        console.error('patchHubBoardingReservation', e);
        return res.status(500).json({ error: e?.message || 'Erro ao atualizar reserva' });
    }
};
exports.patchHubBoardingReservation = patchHubBoardingReservation;
// ─── Configurações de capacidade por unidade ────────────────────────────────
const getHubBoardingUnitSettings = async (req, res) => {
    const parsed = hubBoardingSchemas_1.unitSettingsQuerySchema.safeParse(req.query);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, unit_id } = parsed.data;
    try {
        let q = supabase_1.supabaseAdmin
            .from('hub_unit_boarding_settings')
            .select('unit_id, clinic_id, hotel_slots, daycare_slots_per_shift, checkout_cutoff_time, updated_at')
            .eq('clinic_id', clinic_id);
        if (unit_id)
            q = q.eq('unit_id', unit_id);
        const { data, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ settings: data ?? [] });
    }
    catch (e) {
        console.error('getHubBoardingUnitSettings', e);
        return res.status(500).json({ error: e?.message || 'Erro ao buscar configurações' });
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
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ settings: data });
    }
    catch (e) {
        console.error('patchHubBoardingUnitSettings', e);
        return res.status(500).json({ error: e?.message || 'Erro ao salvar configurações' });
    }
};
exports.patchHubBoardingUnitSettings = patchHubBoardingUnitSettings;
// ─── Ocupação (sem bloqueio — só alerta) ────────────────────────────────────
const getHubBoardingOccupancy = async (req, res) => {
    const parsed = hubBoardingSchemas_1.occupancyQuerySchema.safeParse(req.query);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { clinic_id, unit_id, mode } = parsed.data;
    try {
        const dateYmd = parsed.data.date ?? parsed.data.from?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
        const { from, to } = parsed.data.from && parsed.data.to
            ? { from: parsed.data.from, to: parsed.data.to }
            : (0, boardingOperational_1.dayBoundsFromYmdSaoPaulo)(dateYmd);
        // Reservas ativas no intervalo (overlap)
        let rQ = supabase_1.supabaseAdmin
            .from('hub_boarding_reservations')
            .select('id, mode', { count: 'exact', head: false })
            .eq('clinic_id', clinic_id)
            .in('status', ['reserved', 'checked_in'])
            .lt('expected_check_in', to)
            .gt('expected_check_out', from);
        if (unit_id)
            rQ = rQ.eq('unit_id', unit_id);
        if (mode && mode !== 'all')
            rQ = rQ.eq('mode', mode);
        const { data: reservations, error: rErr } = await rQ;
        if (rErr)
            return res.status(500).json({ error: rErr.message });
        // Configuração de capacidade
        let settingsQ = supabase_1.supabaseAdmin
            .from('hub_unit_boarding_settings')
            .select('hotel_slots, daycare_slots_per_shift')
            .eq('clinic_id', clinic_id);
        if (unit_id)
            settingsQ = settingsQ.eq('unit_id', unit_id);
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
    }
    catch (e) {
        console.error('getHubBoardingOccupancy', e);
        return res.status(500).json({ error: e?.message || 'Erro ao calcular ocupação' });
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
        // Reservas que se sobrepõem ao intervalo
        let rQ = supabase_1.supabaseAdmin
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
        if (unit_id)
            rQ = rQ.eq('unit_id', unit_id);
        if (mode && mode !== 'all')
            rQ = rQ.eq('mode', mode);
        const { data, error } = await rQ;
        if (error)
            return res.status(500).json({ error: error.message });
        const events = (data ?? []).map((r) => ({
            id: r.id,
            mode: r.mode,
            status: r.status,
            expected_check_in: r.expected_check_in,
            expected_check_out: r.expected_check_out,
            checked_in_at: r.checked_in_at,
            checked_out_at: r.checked_out_at,
            pet: r.hub_pets ?? null,
            guardian: r.hub_guardians ??
                null,
        }));
        return res.json({ events });
    }
    catch (e) {
        console.error('getHubBoardingCalendar', e);
        return res.status(500).json({ error: e?.message || 'Erro ao buscar calendário' });
    }
};
exports.getHubBoardingCalendar = getHubBoardingCalendar;
