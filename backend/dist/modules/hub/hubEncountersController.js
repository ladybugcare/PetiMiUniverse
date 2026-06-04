"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeHubEncounter = exports.patchHubEncounter = exports.openHubEncounterFromAppointment = exports.createHubEncounter = exports.getHubEncounter = exports.listHubEncounters = exports.getHubEncountersDayBoard = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const uuidStr = zod_1.z.string().uuid();
const encounterStatusSchema = zod_1.z.enum(['waiting', 'in_progress', 'completed', 'cancelled']);
const jsonObject = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional();
const anamnesisSchema = zod_1.z
    .object({
    chief_complaint_detail: zod_1.z.string().optional(),
    history: zod_1.z.string().optional(),
    diet: zod_1.z.string().optional(),
    behavior: zod_1.z.string().optional(),
    medications: zod_1.z.string().optional(),
})
    .passthrough()
    .optional();
const physicalExamSchema = zod_1.z
    .object({
    weight_kg: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    temperature_c: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    heart_rate: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    respiratory_rate: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    hydration: zod_1.z.string().optional().nullable(),
    mucosa: zod_1.z.string().optional().nullable(),
    notes: zod_1.z.string().optional().nullable(),
})
    .passthrough()
    .optional();
const diagnosisSchema = zod_1.z
    .object({
    suspicions: zod_1.z.string().optional().nullable(),
    conclusion: zod_1.z.string().optional().nullable(),
    cid_code: zod_1.z.string().optional().nullable(),
})
    .passthrough()
    .optional();
const OPERATIONAL_CLINICAL_SERVICE_GROUPS = ['clinica', 'internacao', 'cirurgia'];
const dayBoardQuerySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: zod_1.z.string().datetime({ offset: true }).optional(),
    to: zod_1.z.string().datetime({ offset: true }).optional(),
    unit_id: uuidStr.optional(),
    status: encounterStatusSchema.optional(),
    hub_staff_member_id: zod_1.z.string().optional(),
})
    .refine((d) => (d.from && d.to) || d.date, { message: 'Informe date ou from e to' });
const createEncounterSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    pet_id: uuidStr,
    guardian_id: uuidStr.optional().nullable(),
    hub_appointment_id: uuidStr.optional().nullable(),
    hub_staff_member_id: uuidStr.optional().nullable(),
    chief_complaint: zod_1.z.string().trim().max(4000).optional().nullable(),
    summary_notes: zod_1.z.string().trim().max(8000).optional().nullable(),
})
    .strict();
const patchEncounterSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    status: encounterStatusSchema.optional(),
    chief_complaint: zod_1.z.string().trim().max(4000).optional().nullable(),
    summary_notes: zod_1.z.string().trim().max(8000).optional().nullable(),
    anamnesis: anamnesisSchema,
    physical_exam: physicalExamSchema,
    diagnosis: diagnosisSchema,
    hub_staff_member_id: uuidStr.optional().nullable(),
})
    .strict();
const ENCOUNTER_SELECT = `
  id, clinic_id, unit_id, pet_id, guardian_id, hub_appointment_id, hub_staff_member_id,
  status, chief_complaint, summary_notes, anamnesis, physical_exam, diagnosis,
  started_at, completed_at, created_at, updated_at
`;
async function getOperationalClinicalServiceTypeIds(clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id')
        .eq('clinic_id', clinicId)
        .in('service_group', [...OPERATIONAL_CLINICAL_SERVICE_GROUPS])
        .is('deleted_at', null);
    if (error)
        throw error;
    return (data ?? []).map((r) => r.id);
}
/** Fallback quando o cliente envia só `date` (YYYY-MM-DD) — dia civil em America/Sao_Paulo. */
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
function appointmentMatchesClinicalTypes(appt, clinicalTypeIds, lineTypeIdsByAppt) {
    const primary = appt.hub_service_type_id;
    if (primary && clinicalTypeIds.has(primary))
        return true;
    const lines = lineTypeIdsByAppt.get(appt.id) ?? [];
    return lines.some((id) => clinicalTypeIds.has(id));
}
async function enrichEncounter(row) {
    const petId = row.pet_id;
    const guId = row.guardian_id;
    const staffId = row.hub_staff_member_id;
    const apptId = row.hub_appointment_id;
    const [petRes, guRes, staffRes, apptRes] = await Promise.all([
        supabase_1.supabaseAdmin
            .from('hub_pets')
            .select('id, name, species, breed, size_tier, birth_date, coat_type')
            .eq('id', petId)
            .maybeSingle(),
        guId
            ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name').eq('id', guId).maybeSingle()
            : Promise.resolve({ data: null }),
        staffId
            ? supabase_1.supabaseAdmin.from('hub_staff_members').select('id, full_name').eq('id', staffId).maybeSingle()
            : Promise.resolve({ data: null }),
        apptId
            ? supabase_1.supabaseAdmin
                .from('hub_appointments')
                .select('id, starts_at, ends_at, status, hub_service_type_id, title')
                .eq('id', apptId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
    ]);
    let serviceType = null;
    const appt = apptRes.data;
    if (appt?.hub_service_type_id) {
        const { data: st } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, name, service_group')
            .eq('id', appt.hub_service_type_id)
            .maybeSingle();
        serviceType = st;
    }
    return {
        ...row,
        pet: petRes.data,
        guardian: guRes.data,
        staff_member: staffRes.data,
        appointment: appt,
        service_type: serviceType,
    };
}
async function enrichEncounters(rows) {
    return Promise.all(rows.map((r) => enrichEncounter(r)));
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
/** GET /encounters/day-board — fila do dia (agenda clínica + atendimentos avulsos). */
const getHubEncountersDayBoard = async (req, res) => {
    try {
        const parsed = dayBoardQuerySchema.safeParse(req.query);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const { clinic_id, unit_id, status, hub_staff_member_id } = parsed.data;
        const { from, to, dateYmd } = resolveDayBoardRange(parsed.data);
        const clinicalTypeIds = await getOperationalClinicalServiceTypeIds(clinic_id);
        const clinicalTypeSet = new Set(clinicalTypeIds);
        const clinicalTypesConfigured = clinicalTypeIds.length > 0;
        if (!clinicalTypesConfigured) {
            return res.json({
                items: [],
                date: dateYmd,
                clinic_id,
                clinical_types_configured: false,
            });
        }
        let apptQ = supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id, clinic_id, unit_id, pet_id, guardian_id, hub_staff_member_id, starts_at, ends_at, status, title, hub_service_type_id')
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
        let encQ = supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select(ENCOUNTER_SELECT)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .gte('started_at', from)
            .lte('started_at', to)
            .order('started_at', { ascending: true });
        if (unit_id)
            encQ = encQ.eq('unit_id', unit_id);
        if (status)
            encQ = encQ.eq('status', status);
        if (hub_staff_member_id === '__na__')
            encQ = encQ.is('hub_staff_member_id', null);
        else if (hub_staff_member_id)
            encQ = encQ.eq('hub_staff_member_id', hub_staff_member_id);
        const [{ data: appointmentsRaw, error: apptErr }, { data: encountersRaw, error: encErr }] = await Promise.all([
            apptQ,
            encQ,
        ]);
        if (apptErr)
            return res.status(500).json({ error: apptErr.message });
        if (encErr)
            return res.status(500).json({ error: encErr.message });
        const apptRowsRaw = (appointmentsRaw ?? []);
        const apptIdsAll = apptRowsRaw.map((a) => a.id);
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
        const appointments = apptRowsRaw.filter((a) => appointmentMatchesClinicalTypes(a, clinicalTypeSet, lineTypeIdsByAppt));
        const clinicalApptIds = new Set(appointments.map((a) => a.id));
        const encounters = (encountersRaw ?? []).filter((e) => {
            const aid = e.hub_appointment_id;
            if (!aid)
                return true;
            return clinicalApptIds.has(aid);
        });
        const encByAppt = new Map();
        for (const e of (encounters ?? [])) {
            const aid = e.hub_appointment_id;
            if (aid)
                encByAppt.set(aid, e);
        }
        const apptIds = (appointments ?? []).map((a) => a.id);
        const stMap = new Map();
        if (apptIds.length) {
            const stIds = [
                ...new Set((appointments ?? [])
                    .map((a) => a.hub_service_type_id)
                    .filter(Boolean)),
            ];
            if (stIds.length) {
                const { data: sts } = await supabase_1.supabaseAdmin.from('hub_service_types').select('id, name').in('id', stIds);
                for (const st of sts ?? [])
                    stMap.set(st.id, st);
            }
        }
        const petIds = new Set();
        const guIds = new Set();
        const staffIds = new Set();
        for (const a of (appointments ?? [])) {
            if (a.pet_id)
                petIds.add(a.pet_id);
            if (a.guardian_id)
                guIds.add(a.guardian_id);
            if (a.hub_staff_member_id)
                staffIds.add(a.hub_staff_member_id);
        }
        for (const e of (encounters ?? [])) {
            petIds.add(e.pet_id);
            if (e.guardian_id)
                guIds.add(e.guardian_id);
            if (e.hub_staff_member_id)
                staffIds.add(e.hub_staff_member_id);
        }
        const [petsRes, gusRes, staffRes] = await Promise.all([
            petIds.size
                ? supabase_1.supabaseAdmin
                    .from('hub_pets')
                    .select('id, name, species, breed, size_tier, birth_date')
                    .in('id', [...petIds])
                : Promise.resolve({ data: [] }),
            guIds.size
                ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name').in('id', [...guIds])
                : Promise.resolve({ data: [] }),
            staffIds.size
                ? supabase_1.supabaseAdmin.from('hub_staff_members').select('id, full_name').in('id', [...staffIds])
                : Promise.resolve({ data: [] }),
        ]);
        const petMap = new Map((petsRes.data ?? []).map((p) => [p.id, p]));
        const guMap = new Map((gusRes.data ?? []).map((g) => [g.id, g]));
        const staffMap = new Map((staffRes.data ?? []).map((s) => [s.id, s]));
        const items = [];
        const seenEncounterIds = new Set();
        for (const a of (appointments ?? [])) {
            const apptId = a.id;
            const enc = encByAppt.get(apptId);
            if (enc) {
                seenEncounterIds.add(enc.id);
                const enriched = await enrichEncounter(enc);
                items.push({
                    kind: 'encounter',
                    encounter_id: enc.id,
                    appointment_id: apptId,
                    ...enriched,
                });
            }
            else {
                items.push({
                    kind: 'appointment_slot',
                    appointment_id: apptId,
                    starts_at: a.starts_at,
                    ends_at: a.ends_at,
                    appointment_status: a.status,
                    title: a.title,
                    service_type: stMap.get(a.hub_service_type_id) ?? null,
                    pet: a.pet_id ? petMap.get(a.pet_id) : null,
                    guardian: a.guardian_id ? guMap.get(a.guardian_id) : null,
                    staff_member: a.hub_staff_member_id ? staffMap.get(a.hub_staff_member_id) : null,
                    pet_id: a.pet_id,
                    guardian_id: a.guardian_id,
                    hub_staff_member_id: a.hub_staff_member_id,
                });
            }
        }
        for (const e of (encounters ?? [])) {
            if (seenEncounterIds.has(e.id))
                continue;
            const enriched = await enrichEncounter(e);
            items.push({ kind: 'encounter', encounter_id: e.id, ...enriched });
        }
        items.sort((a, b) => {
            const ta = new Date(a.starts_at || a.started_at || a.appointment?.starts_at || 0).getTime();
            const tb = new Date(b.starts_at || b.started_at || b.appointment?.starts_at || 0).getTime();
            return ta - tb;
        });
        return res.json({
            items,
            date: dateYmd,
            clinic_id,
            clinical_types_configured: true,
        });
    }
    catch (e) {
        console.error('getHubEncountersDayBoard', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar fila clínica' });
    }
};
exports.getHubEncountersDayBoard = getHubEncountersDayBoard;
const listHubEncounters = async (req, res) => {
    try {
        const clinic_id = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic_id.success)
            return res.status(400).json({ error: 'clinic_id obrigatório' });
        const pet_id = req.query.pet_id ? uuidStr.safeParse(req.query.pet_id) : null;
        let q = supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select(ENCOUNTER_SELECT)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null)
            .order('started_at', { ascending: false })
            .limit(100);
        if (pet_id?.success)
            q = q.eq('pet_id', pet_id.data);
        const { data, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        const enriched = await enrichEncounters((data ?? []));
        return res.json({ encounters: enriched });
    }
    catch (e) {
        console.error('listHubEncounters', e);
        return res.status(500).json({ error: e?.message || 'Erro ao listar atendimentos' });
    }
};
exports.listHubEncounters = listHubEncounters;
const getHubEncounter = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const clinic_id = uuidStr.safeParse(req.query.clinic_id);
        if (!id.success || !clinic_id.success) {
            return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select(ENCOUNTER_SELECT)
            .eq('id', id.data)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(404).json({ error: 'Atendimento não encontrado' });
        const encounter = await enrichEncounter(data);
        return res.json({ encounter });
    }
    catch (e) {
        console.error('getHubEncounter', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar atendimento' });
    }
};
exports.getHubEncounter = getHubEncounter;
const createHubEncounter = async (req, res) => {
    try {
        const parsed = createEncounterSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        if (!(await assertPetInClinic(b.clinic_id, b.pet_id))) {
            return res.status(400).json({ error: 'Pet inválido' });
        }
        if (b.hub_appointment_id) {
            const { data: existing } = await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .select('id')
                .eq('hub_appointment_id', b.hub_appointment_id)
                .is('deleted_at', null)
                .maybeSingle();
            if (existing) {
                return res.status(409).json({ error: 'Já existe atendimento para este agendamento', encounter_id: existing.id });
            }
        }
        const now = new Date().toISOString();
        const insert = {
            clinic_id: b.clinic_id,
            unit_id: b.unit_id ?? null,
            pet_id: b.pet_id,
            guardian_id: b.guardian_id ?? null,
            hub_appointment_id: b.hub_appointment_id ?? null,
            hub_staff_member_id: b.hub_staff_member_id ?? null,
            status: 'in_progress',
            chief_complaint: b.chief_complaint ?? null,
            summary_notes: b.summary_notes ?? null,
            started_at: now,
        };
        const { data, error } = await supabase_1.supabaseAdmin.from('hub_encounters').insert(insert).select(ENCOUNTER_SELECT).single();
        if (error)
            return res.status(500).json({ error: error.message });
        if (b.hub_appointment_id) {
            await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update({ status: 'in_progress' })
                .eq('id', b.hub_appointment_id)
                .eq('clinic_id', b.clinic_id);
        }
        const encounter = await enrichEncounter(data);
        return res.status(201).json({ encounter });
    }
    catch (e) {
        console.error('createHubEncounter', e);
        return res.status(500).json({ error: e?.message || 'Erro ao criar atendimento' });
    }
};
exports.createHubEncounter = createHubEncounter;
/** POST /encounters/open-from-appointment */
const openHubEncounterFromAppointment = async (req, res) => {
    try {
        const body = zod_1.z
            .object({ clinic_id: uuidStr, hub_appointment_id: uuidStr })
            .strict()
            .safeParse(req.body);
        if (!body.success)
            return res.status(400).json({ error: body.error.flatten() });
        const { clinic_id, hub_appointment_id } = body.data;
        const { data: existing } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select(ENCOUNTER_SELECT)
            .eq('hub_appointment_id', hub_appointment_id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (existing) {
            const encounter = await enrichEncounter(existing);
            return res.json({ encounter, created: false });
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
        const now = new Date().toISOString();
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .insert({
            clinic_id,
            unit_id: appt.unit_id,
            pet_id: appt.pet_id,
            guardian_id: appt.guardian_id,
            hub_appointment_id,
            hub_staff_member_id: appt.hub_staff_member_id,
            status: 'in_progress',
            chief_complaint: appt.notes,
            started_at: now,
        })
            .select(ENCOUNTER_SELECT)
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .update({ status: 'in_progress' })
            .eq('id', hub_appointment_id);
        const encounter = await enrichEncounter(data);
        return res.status(201).json({ encounter, created: true });
    }
    catch (e) {
        console.error('openHubEncounterFromAppointment', e);
        return res.status(500).json({ error: e?.message || 'Erro ao abrir atendimento' });
    }
};
exports.openHubEncounterFromAppointment = openHubEncounterFromAppointment;
const patchHubEncounter = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        if (!id.success)
            return res.status(400).json({ error: 'id inválido' });
        const parsed = patchEncounterSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        const patch = {};
        if (b.status !== undefined)
            patch.status = b.status;
        if (b.chief_complaint !== undefined)
            patch.chief_complaint = b.chief_complaint;
        if (b.summary_notes !== undefined)
            patch.summary_notes = b.summary_notes;
        if (b.hub_staff_member_id !== undefined)
            patch.hub_staff_member_id = b.hub_staff_member_id;
        if (b.anamnesis !== undefined)
            patch.anamnesis = b.anamnesis;
        if (b.physical_exam !== undefined)
            patch.physical_exam = b.physical_exam;
        if (b.diagnosis !== undefined)
            patch.diagnosis = b.diagnosis;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .update(patch)
            .eq('id', id.data)
            .eq('clinic_id', b.clinic_id)
            .is('deleted_at', null)
            .select(ENCOUNTER_SELECT)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(404).json({ error: 'Atendimento não encontrado' });
        const encounter = await enrichEncounter(data);
        return res.json({ encounter });
    }
    catch (e) {
        console.error('patchHubEncounter', e);
        return res.status(500).json({ error: e?.message || 'Erro ao atualizar atendimento' });
    }
};
exports.patchHubEncounter = patchHubEncounter;
const completeHubEncounter = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const clinic_id = uuidStr.safeParse(req.body?.clinic_id ?? req.query.clinic_id);
        if (!id.success || !clinic_id.success) {
            return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
        }
        const now = new Date().toISOString();
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .update({ status: 'completed', completed_at: now })
            .eq('id', id.data)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null)
            .select(ENCOUNTER_SELECT)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(404).json({ error: 'Atendimento não encontrado' });
        const enc = data;
        if (enc.hub_appointment_id) {
            await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update({ status: 'done' })
                .eq('id', enc.hub_appointment_id);
        }
        await supabase_1.supabaseAdmin.from('hub_encounter_events').insert({
            clinic_id: clinic_id.data,
            pet_id: enc.pet_id,
            hub_encounter_id: id.data,
            event_type: 'consultation',
            title: 'Consulta finalizada',
            body: enc.chief_complaint ?? null,
            event_at: now,
        });
        const encounter = await enrichEncounter(enc);
        return res.json({ encounter });
    }
    catch (e) {
        console.error('completeHubEncounter', e);
        return res.status(500).json({ error: e?.message || 'Erro ao finalizar atendimento' });
    }
};
exports.completeHubEncounter = completeHubEncounter;
