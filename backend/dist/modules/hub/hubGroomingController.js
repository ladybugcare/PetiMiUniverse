"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.advanceHubGroomingSession = exports.listHubGroomingSessionEvents = exports.postHubGroomingSessionEvent = exports.patchHubGroomingSession = exports.createHubGroomingSession = exports.openHubGroomingSessionFromAppointment = exports.getHubGroomingDayBoard = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const groomingStages_1 = require("./groomingStages");
const groomingPetTags_1 = require("./groomingPetTags");
const uuidStr = zod_1.z.string().uuid();
const GROOMING_SERVICE_GROUP = 'banho_tosa';
const groomingStageSchema = zod_1.z.enum(groomingStages_1.GROOMING_STAGES);
const SESSION_SELECT = `
  id, clinic_id, unit_id, pet_id, guardian_id, hub_appointment_id, hub_staff_member_id,
  grooming_stage, priority, checked_in_at, started_at, ready_at, delivered_at, closed_at,
  paused_at,
  tutor_notes_snapshot, operational_notes, checklist, created_at, updated_at
`;
const dayBoardQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: zod_1.z.string().datetime({ offset: true }).optional(),
    to: zod_1.z.string().datetime({ offset: true }).optional(),
    unit_id: uuidStr.optional(),
    hub_staff_member_id: zod_1.z.string().optional(),
})
    .refine((d) => (d.from && d.to) || d.date, { message: 'Informe date ou from e to' });
function dayBoundsFromYmdSaoPaulo(dateYmd) {
    const from = new Date(`${dateYmd}T00:00:00-03:00`);
    const to = new Date(`${dateYmd}T23:59:59.999-03:00`);
    return { from: from.toISOString(), to: to.toISOString() };
}
function resolveDayBoardRange(query) {
    if (query.from && query.to) {
        const dateYmd = query.date ?? query.from.slice(0, 10);
        return { from: query.from, to: query.to, dateYmd };
    }
    const dateYmd = query.date;
    const bounds = dayBoundsFromYmdSaoPaulo(dateYmd);
    return { ...bounds, dateYmd };
}
async function getGroomingServiceTypeIds(clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('service_group', GROOMING_SERVICE_GROUP)
        .is('deleted_at', null);
    if (error)
        throw error;
    return (data ?? []).map((r) => r.id);
}
function appointmentMatchesGroomingTypes(appt, groomingTypeIds, lineTypeIdsByAppt) {
    const primary = appt.hub_service_type_id;
    if (primary && groomingTypeIds.has(primary))
        return true;
    const lines = lineTypeIdsByAppt.get(appt.id) ?? [];
    return lines.some((id) => groomingTypeIds.has(id));
}
function stripDiacritics(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
/** Heurística para filtro «só banho» (sem tosquia no nome/código dos tipos de grooming do item). */
function classifyGroomingServiceMix(serviceLines, primarySt, stMap) {
    const tosaPattern = (text) => {
        const t = stripDiacritics(text.toLowerCase());
        return (/\btosa\b/.test(t) ||
            /\btosqui/.test(t) ||
            /\bmaquina\b/.test(t) ||
            /\btesoura\b/.test(t) ||
            t.includes('banho_tosa'));
    };
    const candidates = [];
    for (const l of serviceLines) {
        const st = stMap.get(l.hub_service_type_id);
        if (st?.service_group === GROOMING_SERVICE_GROUP)
            candidates.push({ st, lineName: l.name });
    }
    if (candidates.length === 0 && primarySt?.service_group === GROOMING_SERVICE_GROUP) {
        candidates.push({ st: primarySt, lineName: primarySt.name });
    }
    if (candidates.length === 0)
        return 'unknown';
    for (const { st, lineName } of candidates) {
        const blob = `${st.code ?? ''} ${st.name} ${lineName}`;
        if (st.code === 'banho_tosa' || tosaPattern(blob))
            return 'with_tosa';
    }
    return 'banho_only';
}
async function assertPetInClinic(clinicId, petId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_pets')
        .select('id')
        .eq('id', petId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    return !!data;
}
async function logGroomingEvent(opts) {
    await supabase_1.supabaseAdmin.from('hub_grooming_events').insert({
        clinic_id: opts.clinic_id,
        hub_grooming_session_id: opts.session_id,
        event_type: opts.event_type,
        title: opts.title ?? groomingStages_1.GROOMING_EVENT_TITLES[opts.event_type] ?? opts.event_type,
        body: opts.body ?? null,
        payload: opts.payload ?? {},
        created_by_staff_id: opts.created_by_staff_id ?? null,
    });
}
function stageTimestampsPatch(stage, now) {
    const patch = {};
    if (stage === 'checked_in')
        patch.checked_in_at = now;
    if (stage === 'in_service')
        patch.started_at = now;
    if (stage === 'ready')
        patch.ready_at = now;
    if (stage === 'delivered')
        patch.delivered_at = now;
    if (stage === 'closed')
        patch.closed_at = now;
    return patch;
}
async function syncAppointmentStatusForStage(clinicId, appointmentId, stage) {
    if (!appointmentId)
        return;
    const nextStatus = (0, groomingStages_1.appointmentStatusForGroomingStage)(stage);
    if (!nextStatus)
        return;
    await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .update({ status: nextStatus })
        .eq('id', appointmentId)
        .eq('clinic_id', clinicId);
}
function buildServiceLinesForAppointment(apptId, a, lineRowsByAppt, stMap) {
    const lineDefs = lineRowsByAppt.get(apptId) ?? [];
    const serviceLines = [];
    for (const l of lineDefs) {
        const st = stMap.get(l.hub_service_type_id);
        if (!st || st.service_group !== GROOMING_SERVICE_GROUP)
            continue;
        serviceLines.push({
            id: l.id,
            hub_service_type_id: st.id,
            name: st.name,
            duration_minutes: st.default_duration_minutes,
            executed_at: l.executed_at ?? null,
        });
    }
    const primarySt = a.hub_service_type_id ? stMap.get(a.hub_service_type_id) : null;
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
const getHubGroomingDayBoard = async (req, res) => {
    try {
        const parsed = dayBoardQuerySchema.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
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
        let apptQ = supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id, clinic_id, unit_id, pet_id, guardian_id, hub_staff_member_id, starts_at, ends_at, status, title, hub_service_type_id, appointment_kind, notes, description')
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .lt('starts_at', to)
            .gt('ends_at', from)
            .order('starts_at', { ascending: true });
        if (unit_id)
            apptQ = apptQ.eq('unit_id', unit_id);
        if (hub_staff_member_id === '__na__')
            apptQ = apptQ.is('hub_staff_member_id', null);
        else if (hub_staff_member_id)
            apptQ = apptQ.eq('hub_staff_member_id', hub_staff_member_id);
        const { data: appointmentsRaw, error: apptErr } = await apptQ;
        if (apptErr)
            return res.status(500).json({ error: apptErr.message });
        const apptRowsRaw = (appointmentsRaw ?? []);
        const apptIdsAll = apptRowsRaw.map((a) => a.id);
        const lineTypeIdsByAppt = new Map();
        const lineRowsByAppt = new Map();
        if (apptIdsAll.length > 0) {
            const { data: lineRows, error: lineErr } = await supabase_1.supabaseAdmin
                .from('hub_appointment_services')
                .select('id, appointment_id, hub_service_type_id, order_index, executed_at')
                .in('appointment_id', apptIdsAll)
                .order('order_index', { ascending: true });
            if (lineErr)
                return res.status(500).json({ error: lineErr.message });
            for (const row of lineRows ?? []) {
                const aid = row.appointment_id;
                const stid = row.hub_service_type_id;
                const list = lineTypeIdsByAppt.get(aid) ?? [];
                list.push(stid);
                lineTypeIdsByAppt.set(aid, list);
                const lines = lineRowsByAppt.get(aid) ?? [];
                lines.push({
                    id: row.id,
                    hub_service_type_id: stid,
                    order_index: row.order_index,
                    executed_at: row.executed_at ?? null,
                });
                lineRowsByAppt.set(aid, lines);
            }
        }
        const appointments = apptRowsRaw.filter((a) => appointmentMatchesGroomingTypes(a, groomingTypeSet, lineTypeIdsByAppt));
        const groomingApptIds = appointments.map((a) => a.id);
        let sessQ = supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select(SESSION_SELECT)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null);
        if (unit_id)
            sessQ = sessQ.eq('unit_id', unit_id);
        if (hub_staff_member_id === '__na__')
            sessQ = sessQ.is('hub_staff_member_id', null);
        else if (hub_staff_member_id)
            sessQ = sessQ.eq('hub_staff_member_id', hub_staff_member_id);
        const { data: sessionsRaw, error: sessErr } = await sessQ;
        if (sessErr) {
            if (sessErr.message?.includes('hub_grooming_sessions')) {
                return res.status(503).json({
                    error: 'Tabela hub_grooming_sessions não encontrada. Execute create_hub_grooming_sessions.sql no Supabase.',
                });
            }
            return res.status(500).json({ error: sessErr.message });
        }
        const sessionsForDay = (sessionsRaw ?? []).filter((s) => {
            const aid = s.hub_appointment_id;
            if (aid && groomingApptIds.includes(aid))
                return true;
            const checkedIn = s.checked_in_at;
            if (checkedIn && checkedIn >= from && checkedIn <= to)
                return true;
            const created = s.created_at;
            return !aid && created >= from && created <= to;
        });
        const sessionByApptId = new Map();
        for (const s of sessionsForDay) {
            const aid = s.hub_appointment_id;
            if (aid)
                sessionByApptId.set(aid, s);
        }
        const allStIds = new Set();
        for (const a of appointments) {
            if (a.hub_service_type_id)
                allStIds.add(a.hub_service_type_id);
            for (const id of lineTypeIdsByAppt.get(a.id) ?? [])
                allStIds.add(id);
        }
        const stMap = new Map();
        if (allStIds.size > 0) {
            const { data: sts, error: stErr } = await supabase_1.supabaseAdmin
                .from('hub_service_types')
                .select('id, name, code, service_group, default_duration_minutes')
                .in('id', [...allStIds]);
            if (stErr)
                return res.status(500).json({ error: stErr.message });
            for (const st of sts ?? [])
                stMap.set(st.id, st);
        }
        const petIds = new Set();
        const guIds = new Set();
        const staffIds = new Set();
        for (const a of appointments) {
            if (a.pet_id)
                petIds.add(a.pet_id);
            if (a.guardian_id)
                guIds.add(a.guardian_id);
            if (a.hub_staff_member_id)
                staffIds.add(a.hub_staff_member_id);
        }
        for (const s of sessionsForDay) {
            petIds.add(s.pet_id);
            if (s.guardian_id)
                guIds.add(s.guardian_id);
            if (s.hub_staff_member_id)
                staffIds.add(s.hub_staff_member_id);
        }
        const [petsRes, gusRes, staffRes] = await Promise.all([
            petIds.size
                ? supabase_1.supabaseAdmin
                    .from('hub_pets')
                    .select('id, name, species, breed, size_tier, birth_date, coat_type, notes, avatar_url')
                    .in('id', [...petIds])
                : Promise.resolve({ data: [] }),
            guIds.size
                ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name, phone').in('id', [...guIds])
                : Promise.resolve({ data: [] }),
            staffIds.size
                ? supabase_1.supabaseAdmin.from('hub_staff_members').select('id, full_name').in('id', [...staffIds])
                : Promise.resolve({ data: [] }),
        ]);
        const petMap = new Map((petsRes.data ?? []).map((p) => [p.id, p]));
        const guMap = new Map((gusRes.data ?? []).map((g) => [g.id, g]));
        const staffMap = new Map((staffRes.data ?? []).map((s) => [s.id, s]));
        const closedCountsByPet = new Map();
        if (petIds.size) {
            const { data: closedRows, error: crErr } = await supabase_1.supabaseAdmin
                .from('hub_grooming_sessions')
                .select('pet_id')
                .eq('clinic_id', clinic_id)
                .in('pet_id', [...petIds])
                .not('closed_at', 'is', null)
                .is('deleted_at', null);
            if (!crErr && closedRows) {
                for (const row of closedRows) {
                    const pid = row.pet_id;
                    closedCountsByPet.set(pid, (closedCountsByPet.get(pid) ?? 0) + 1);
                }
            }
        }
        const enrichPet = (pid) => {
            if (!pid)
                return null;
            const raw = petMap.get(pid);
            if (!raw)
                return null;
            const closedCount = closedCountsByPet.get(pid) ?? 0;
            return { ...raw, is_first_grooming_visit: closedCount === 0 };
        };
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
        const seenSessionIds = new Set();
        for (const a of appointments) {
            const apptId = a.id;
            const session = sessionByApptId.get(apptId);
            const { serviceLines, primarySt, estimated_duration_minutes } = buildServiceLinesForAppointment(apptId, a, lineRowsByAppt, stMap);
            const grooming_service_mix = classifyGroomingServiceMix(serviceLines, primarySt ?? null, stMap);
            const startsAt = a.starts_at;
            const appointment_status = a.status;
            const grooming_stage = session
                ? session.grooming_stage
                : (0, groomingStages_1.boardStageFromAppointmentStatus)(appointment_status);
            const is_late = ['scheduled', 'checked_in', 'queued'].includes(grooming_stage) &&
                ['pending_confirm', 'confirmed', 'in_progress'].includes(appointment_status) &&
                new Date(startsAt).getTime() < nowMs;
            const staffId = session?.hub_staff_member_id ?? a.hub_staff_member_id;
            const petId = session?.pet_id ?? a.pet_id;
            if (session) {
                seenSessionIds.add(session.id);
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
                    paused_at: session.paused_at ?? null,
                    is_late,
                    operational_notes: session.operational_notes,
                    pet: enrichPet(petId),
                    guardian: (session.guardian_id ?? a.guardian_id)
                        ? guMap.get((session.guardian_id ?? a.guardian_id))
                        : null,
                    staff_member: staffId ? staffMap.get(staffId) : null,
                    pet_id: petId,
                    guardian_id: session.guardian_id ?? a.guardian_id,
                    hub_staff_member_id: staffId,
                    clinical_tags: tagsForPet(petId),
                });
            }
            else {
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
                    guardian: a.guardian_id ? guMap.get(a.guardian_id) : null,
                    staff_member: staffId ? staffMap.get(staffId) : null,
                    pet_id: petId,
                    guardian_id: a.guardian_id,
                    hub_staff_member_id: staffId,
                    clinical_tags: tagsForPet(petId),
                });
            }
        }
        for (const s of sessionsForDay) {
            if (seenSessionIds.has(s.id))
                continue;
            const petId = s.pet_id;
            const staffId = s.hub_staff_member_id;
            const checkedIn = s.checked_in_at || s.created_at;
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
                paused_at: s.paused_at ?? null,
                is_late: false,
                is_walk_in: true,
                operational_notes: s.operational_notes,
                pet: enrichPet(petId),
                guardian: s.guardian_id ? guMap.get(s.guardian_id) : null,
                staff_member: staffId ? staffMap.get(staffId) : null,
                pet_id: petId,
                guardian_id: s.guardian_id,
                hub_staff_member_id: staffId,
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
            grooming_types_configured: true,
        });
    }
    catch (e) {
        console.error('getHubGroomingDayBoard', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar fila de Banho & Tosa' });
    }
};
exports.getHubGroomingDayBoard = getHubGroomingDayBoard;
const openFromAppointmentSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    hub_appointment_id: uuidStr,
    grooming_stage: groomingStageSchema.optional(),
})
    .strict();
/** POST /grooming/sessions/open-from-appointment */
const openHubGroomingSessionFromAppointment = async (req, res) => {
    try {
        const parsed = openFromAppointmentSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, hub_appointment_id } = parsed.data;
        const targetStage = parsed.data.grooming_stage ?? 'checked_in';
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select(SESSION_SELECT)
            .eq('hub_appointment_id', hub_appointment_id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (existing) {
            return res.json({ session: existing, created: false });
        }
        const { data: appt, error: apptErr } = await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id, clinic_id, unit_id, pet_id, guardian_id, hub_staff_member_id, notes')
            .eq('id', hub_appointment_id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (apptErr)
            return res.status(500).json({ error: apptErr.message });
        if (!appt)
            return res.status(404).json({ error: 'Agendamento não encontrado' });
        if (!appt.pet_id)
            return res.status(400).json({ error: 'Agendamento sem pet associado' });
        let tutorSnapshot = null;
        if (appt.pet_id) {
            const { data: petRow } = await supabase_1.supabaseAdmin
                .from('hub_pets')
                .select('notes')
                .eq('id', appt.pet_id)
                .maybeSingle();
            tutorSnapshot = petRow?.notes ?? null;
        }
        const now = new Date().toISOString();
        const { data, error } = await supabase_1.supabaseAdmin
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
        if (error)
            return res.status(500).json({ error: error.message });
        await logGroomingEvent({
            clinic_id,
            session_id: data.id,
            event_type: 'check_in',
            body: appt.notes,
        });
        await syncAppointmentStatusForStage(clinic_id, hub_appointment_id, targetStage);
        return res.status(201).json({ session: data, created: true });
    }
    catch (e) {
        console.error('openHubGroomingSessionFromAppointment', e);
        return res.status(500).json({ error: e?.message || 'Erro ao abrir sessão' });
    }
};
exports.openHubGroomingSessionFromAppointment = openHubGroomingSessionFromAppointment;
const createSessionSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    pet_id: uuidStr,
    guardian_id: uuidStr.optional().nullable(),
    unit_id: uuidStr.optional().nullable(),
    hub_staff_member_id: uuidStr,
    operational_notes: zod_1.z.string().trim().max(8000).optional().nullable(),
})
    .strict();
/** POST /grooming/sessions — walk-in */
const createHubGroomingSession = async (req, res) => {
    try {
        const parsed = createSessionSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        if (!(await assertPetInClinic(b.clinic_id, b.pet_id))) {
            return res.status(400).json({ error: 'Pet inválido' });
        }
        const now = new Date().toISOString();
        const { data, error } = await supabase_1.supabaseAdmin
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
        if (error)
            return res.status(500).json({ error: error.message });
        await logGroomingEvent({
            clinic_id: b.clinic_id,
            session_id: data.id,
            event_type: 'check_in',
            created_by_staff_id: b.hub_staff_member_id,
        });
        return res.status(201).json({ session: data });
    }
    catch (e) {
        console.error('createHubGroomingSession', e);
        return res.status(500).json({ error: e?.message || 'Erro ao criar sessão' });
    }
};
exports.createHubGroomingSession = createHubGroomingSession;
const patchSessionSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    grooming_stage: groomingStageSchema.optional(),
    paused: zod_1.z.boolean().optional(),
    hub_staff_member_id: uuidStr.optional().nullable(),
    priority: zod_1.z.number().int().min(0).max(99).optional(),
    operational_notes: zod_1.z.string().trim().max(8000).optional().nullable(),
    checklist: zod_1.z.record(zod_1.z.string(), zod_1.z.object({ done: zod_1.z.boolean() }).strict()).optional(),
})
    .strict();
/** PATCH /grooming/sessions/:id */
const patchHubGroomingSession = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        if (!id.success)
            return res.status(400).json({ error: 'id inválido' });
        const parsed = patchSessionSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        if (b.grooming_stage !== undefined && b.paused !== undefined) {
            return res.status(400).json({ error: 'Envie grooming_stage ou paused, não ambos no mesmo pedido.' });
        }
        const { data: current, error: curErr } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select(SESSION_SELECT)
            .eq('id', id.data)
            .eq('clinic_id', b.clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (curErr)
            return res.status(500).json({ error: curErr.message });
        if (!current)
            return res.status(404).json({ error: 'Sessão não encontrada' });
        const patch = {};
        const now = new Date().toISOString();
        let shouldLogPause = false;
        let shouldLogResume = false;
        if (b.grooming_stage !== undefined) {
            const from = current.grooming_stage;
            const to = b.grooming_stage;
            if (!(0, groomingStages_1.canTransitionGroomingStage)(from, to)) {
                return res.status(400).json({
                    error: `Transição inválida: ${groomingStages_1.GROOMING_STAGE_LABELS[from]} → ${groomingStages_1.GROOMING_STAGE_LABELS[to]}`,
                });
            }
            patch.grooming_stage = to;
            Object.assign(patch, stageTimestampsPatch(to, now));
            patch.paused_at = null;
        }
        if (b.paused !== undefined) {
            const st = current.grooming_stage;
            const wasPaused = Boolean(current.paused_at);
            if (b.paused) {
                if (st !== 'in_service' && st !== 'finishing') {
                    return res.status(400).json({ error: 'Só é possível pausar durante atendimento ou finalização.' });
                }
                if (!wasPaused) {
                    patch.paused_at = now;
                    shouldLogPause = true;
                }
            }
            else if (wasPaused) {
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
        if (b.priority !== undefined)
            patch.priority = b.priority;
        if (b.operational_notes !== undefined)
            patch.operational_notes = b.operational_notes;
        if (b.checklist !== undefined) {
            const cur = current.checklist || {};
            patch.checklist = { ...cur, ...b.checklist };
        }
        if (Object.keys(patch).length === 0) {
            return res.json({ session: current });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .update(patch)
            .eq('id', id.data)
            .eq('clinic_id', b.clinic_id)
            .select(SESSION_SELECT)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(404).json({ error: 'Sessão não encontrada' });
        if (b.grooming_stage !== undefined) {
            await logGroomingEvent({
                clinic_id: b.clinic_id,
                session_id: id.data,
                event_type: 'stage_change',
                body: `${groomingStages_1.GROOMING_STAGE_LABELS[current.grooming_stage]} → ${groomingStages_1.GROOMING_STAGE_LABELS[b.grooming_stage]}`,
                payload: { from: current.grooming_stage, to: b.grooming_stage },
            });
            await syncAppointmentStatusForStage(b.clinic_id, current.hub_appointment_id, b.grooming_stage);
        }
        if (shouldLogPause) {
            await logGroomingEvent({ clinic_id: b.clinic_id, session_id: id.data, event_type: 'pause' });
        }
        if (shouldLogResume) {
            await logGroomingEvent({ clinic_id: b.clinic_id, session_id: id.data, event_type: 'resume' });
        }
        return res.json({ session: data });
    }
    catch (e) {
        console.error('patchHubGroomingSession', e);
        return res.status(500).json({ error: e?.message || 'Erro ao atualizar sessão' });
    }
};
exports.patchHubGroomingSession = patchHubGroomingSession;
const postEventSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    event_type: zod_1.z.enum([
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
    title: zod_1.z.string().trim().max(200).optional(),
    body: zod_1.z.string().trim().max(4000).optional().nullable(),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    created_by_staff_id: uuidStr.optional().nullable(),
})
    .strict();
/** POST /grooming/sessions/:id/events */
const postHubGroomingSessionEvent = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        if (!id.success)
            return res.status(400).json({ error: 'id inválido' });
        const parsed = postEventSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        const { data: session } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('id')
            .eq('id', id.data)
            .eq('clinic_id', b.clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (!session)
            return res.status(404).json({ error: 'Sessão não encontrada' });
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_grooming_events')
            .insert({
            clinic_id: b.clinic_id,
            hub_grooming_session_id: id.data,
            event_type: b.event_type,
            title: b.title ?? groomingStages_1.GROOMING_EVENT_TITLES[b.event_type] ?? b.event_type,
            body: b.body ?? null,
            payload: b.payload ?? {},
            created_by_staff_id: b.created_by_staff_id ?? null,
        })
            .select('id, event_type, title, body, payload, created_at, created_by_staff_id')
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.status(201).json({ event: data });
    }
    catch (e) {
        console.error('postHubGroomingSessionEvent', e);
        return res.status(500).json({ error: e?.message || 'Erro ao registrar evento' });
    }
};
exports.postHubGroomingSessionEvent = postHubGroomingSessionEvent;
/** GET /grooming/sessions/:id/events */
const listHubGroomingSessionEvents = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const clinic_id = uuidStr.safeParse(req.query.clinic_id);
        if (!id.success || !clinic_id.success) {
            return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_grooming_events')
            .select('id, event_type, title, body, payload, created_at, created_by_staff_id')
            .eq('hub_grooming_session_id', id.data)
            .eq('clinic_id', clinic_id.data)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ events: data ?? [] });
    }
    catch (e) {
        console.error('listHubGroomingSessionEvents', e);
        return res.status(500).json({ error: e?.message || 'Erro ao listar eventos' });
    }
};
exports.listHubGroomingSessionEvents = listHubGroomingSessionEvents;
/** POST /grooming/sessions/:id/advance — avança para o próximo estágio */
const advanceHubGroomingSession = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const body = zod_1.z.object({ clinic_id: uuidStr }).strict().safeParse(req.body);
        if (!id.success || !body.success)
            return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
        const { data: current } = await supabase_1.supabaseAdmin
            .from('hub_grooming_sessions')
            .select('grooming_stage')
            .eq('id', id.data)
            .eq('clinic_id', body.data.clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (!current)
            return res.status(404).json({ error: 'Sessão não encontrada' });
        const from = current.grooming_stage;
        const next = groomingStages_1.GROOMING_NEXT_STAGE[from];
        if (!next)
            return res.status(400).json({ error: 'Não há próximo estágio' });
        req.body = { clinic_id: body.data.clinic_id, grooming_stage: next };
        return (0, exports.patchHubGroomingSession)(req, res);
    }
    catch (e) {
        console.error('advanceHubGroomingSession', e);
        return res.status(500).json({ error: e?.message || 'Erro ao avançar estágio' });
    }
};
exports.advanceHubGroomingSession = advanceHubGroomingSession;
