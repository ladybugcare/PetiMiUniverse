"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHubEncounterVersions = exports.amendHubEncounter = exports.completeHubEncounter = exports.patchHubEncounter = exports.openHubEncounterFromAppointment = exports.createHubEncounter = exports.getHubEncounter = exports.listHubEncounters = exports.getHubEncountersDayBoard = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubClinicalCasesController_1 = require("./hubClinicalCasesController");
const hubClinicalTimelineController_1 = require("./hubClinicalTimelineController");
const hubComandasController_1 = require("./hubComandasController");
/** Grava um snapshot versionado do documento clínico em hub_clinical_document_versions. */
async function saveEncounterSnapshot(opts) {
    const { data: latest } = await supabase_1.supabaseAdmin
        .from('hub_clinical_document_versions')
        .select('version_no')
        .eq('entity_id', opts.encounter_id)
        .order('version_no', { ascending: false })
        .limit(1)
        .maybeSingle();
    const nextVersion = latest ? latest.version_no + 1 : 1;
    await supabase_1.supabaseAdmin.from('hub_clinical_document_versions').insert({
        clinic_id: opts.clinic_id,
        entity_type: 'encounter',
        entity_id: opts.encounter_id,
        version_no: nextVersion,
        document: opts.document,
        changed_by: opts.changed_by ?? null,
        change_reason: opts.change_reason ?? null,
    });
}
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
async function fetchPrimaryGuardianIdForPet(petId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pet_guardians')
        .select('guardian_id')
        .eq('pet_id', petId)
        .eq('role', 'primary')
        .limit(1)
        .maybeSingle();
    if (error || !data)
        return null;
    return data.guardian_id ?? null;
}
async function guardianInClinic(clinicId, guardianId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_guardians')
        .select('id')
        .eq('id', guardianId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error || !data)
        return false;
    return true;
}
/** Tutor vinculado ao pet (papel primário ou secundário). */
async function guardianLinkedToPet(petId, guardianId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pet_guardians')
        .select('id')
        .eq('pet_id', petId)
        .eq('guardian_id', guardianId)
        .limit(1)
        .maybeSingle();
    if (error || !data)
        return false;
    return true;
}
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
const encounterTypeSchema = zod_1.z.enum(['consultation', 'return', 'emergency', 'procedure']);
const createEncounterSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    // Para emergência, pet_id é opcional (pode ser identificado depois).
    // Para demais tipos permanece obrigatório (validado pelo refine abaixo).
    pet_id: uuidStr.optional().nullable(),
    guardian_id: uuidStr.optional().nullable(),
    hub_appointment_id: uuidStr.optional().nullable(),
    hub_staff_member_id: uuidStr.optional().nullable(),
    /** Walk-in: serviço nas áreas Clínica / Internação / Cirurgia (opcional na API; recomendado na UI). */
    hub_service_type_id: uuidStr.optional().nullable(),
    /**
     * @deprecated Use o fluxo `POST /appointments` (status `checked_in`) seguido de
     * `POST /encounters/open-from-appointment`. O campo ainda é aceito por compatibilidade
     * mas não deve ser usado por novos clientes.
     *
     * Quando true, cria um slot em `hub_appointments` (categoria `clinical_walk_in` ou `clinical_emergency`)
     * no horário atual e vincula ao atendimento. Exige `hub_service_type_id`; não combinar com `hub_appointment_id`.
     */
    link_agenda_slot: zod_1.z.boolean().optional(),
    chief_complaint: zod_1.z.string().trim().max(4000).optional().nullable(),
    summary_notes: zod_1.z.string().trim().max(8000).optional().nullable(),
    // Caso clínico: enviar hub_case_id para associar a caso existente,
    // create_new_case=true para forçar caso novo, ou omitir para auto-caso.
    hub_case_id: uuidStr.optional().nullable(),
    create_new_case: zod_1.z.boolean().optional(),
    encounter_type: encounterTypeSchema.optional().default('consultation'),
})
    .strict()
    .refine((d) => d.encounter_type === 'emergency' || !!d.pet_id, {
    message: 'pet_id é obrigatório para atendimentos não-emergência',
    path: ['pet_id'],
});
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
    guardian_id: uuidStr.optional().nullable(),
    // Campos de identificação posterior (urgência sem pet/tutor).
    pet_id: uuidStr.optional().nullable(),
    hub_case_id: uuidStr.optional().nullable(),
})
    .strict();
const amendEncounterSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    change_reason: zod_1.z.string().trim().min(1).max(1000),
    changed_by: uuidStr.optional().nullable(),
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
  hub_case_id, encounter_type,
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
/** Serviço da clínica, na mesma matriz operacional do painel de atendimentos. */
async function assertOperationalClinicalServiceType(clinicId, serviceTypeId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, service_group')
        .eq('id', serviceTypeId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (!data)
        return false;
    const g = String(data.service_group || '');
    return OPERATIONAL_CLINICAL_SERVICE_GROUPS.includes(g);
}
/** Cria agendamento «encaixe» na agenda principal e retorna o id (com linha em hub_appointment_services). */
async function createLinkedClinicalAgendaAppointment(params) {
    const { data: st, error: stErr } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, name, default_duration_minutes')
        .eq('id', params.hub_service_type_id)
        .eq('clinic_id', params.clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
    if (stErr || !st) {
        throw new Error('Tipo de serviço não encontrado para o encaixe na agenda.');
    }
    const rawDur = st.default_duration_minutes;
    const durMin = Math.min(480, Math.max(15, typeof rawDur === 'number' && rawDur > 0 ? rawDur : 30));
    const start = new Date();
    const end = new Date(start.getTime() + durMin * 60_000);
    const cc = params.chief_complaint?.trim() ?? '';
    const title = cc.length > 0 ? cc.slice(0, 240) : String(st.name || 'Atendimento clínico');
    const insertAppt = {
        clinic_id: params.clinic_id,
        unit_id: params.unit_id,
        hub_service_type_id: params.hub_service_type_id,
        hub_staff_member_id: params.hub_staff_member_id,
        pet_id: params.pet_id,
        guardian_id: params.guardian_id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: 'in_progress',
        resource_label: null,
        notes: cc.length > 0 ? cc : null,
        appointment_kind: params.appointment_kind,
        title,
        description: null,
        financial_notes: null,
        series_id: null,
        series_occurrence_date: null,
        pricing_porte_tier: null,
        pricing_coat_type: null,
    };
    const { data: apptRow, error: apptErr } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .insert(insertAppt)
        .select('id')
        .single();
    if (apptErr || !apptRow) {
        throw new Error(apptErr?.message || 'Não foi possível criar o registro na agenda.');
    }
    const apptId = apptRow.id;
    const { error: svcErr } = await supabase_1.supabaseAdmin.from('hub_appointment_services').insert({
        appointment_id: apptId,
        hub_service_type_id: params.hub_service_type_id,
        duration_minutes: durMin,
        order_index: 0,
    });
    if (svcErr) {
        await supabase_1.supabaseAdmin.from('hub_appointments').delete().eq('id', apptId);
        throw new Error(svcErr.message);
    }
    return apptId;
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
    const petId = row.pet_id ?? null;
    const guId = row.guardian_id;
    const staffId = row.hub_staff_member_id;
    const apptId = row.hub_appointment_id;
    const caseId = row.hub_case_id;
    const [petRes, guRes, staffRes, apptRes, caseRes] = await Promise.all([
        petId
            ? supabase_1.supabaseAdmin
                .from('hub_pets')
                .select('id, name, species, breed, size_tier, birth_date, coat_type')
                .eq('id', petId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        guId
            ? supabase_1.supabaseAdmin.from('hub_guardians').select('id, full_name').eq('id', guId).maybeSingle()
            : Promise.resolve({ data: null }),
        staffId
            ? supabase_1.supabaseAdmin.from('hub_staff_members').select('id, full_name').eq('id', staffId).maybeSingle()
            : Promise.resolve({ data: null }),
        apptId
            ? supabase_1.supabaseAdmin
                .from('hub_appointments')
                .select('id, starts_at, ends_at, status, hub_service_type_id, title, appointment_kind')
                .eq('id', apptId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        caseId
            ? supabase_1.supabaseAdmin
                .from('hub_clinical_cases')
                .select('id, title, status, opened_at, closed_at')
                .eq('id', caseId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
    ]);
    let serviceType = null;
    const appt = apptRes.data;
    const serviceTypeIdToLoad = appt?.hub_service_type_id || null;
    if (serviceTypeIdToLoad) {
        const { data: st } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, name, service_group')
            .eq('id', serviceTypeIdToLoad)
            .maybeSingle();
        serviceType = st;
    }
    const clinicId = row.clinic_id;
    const encId = row.id;
    const adj = clinicId
        ? (await (0, hubComandasController_1.financialAdjustmentFlagsForEncounters)(clinicId, [encId])).get(encId)
        : undefined;
    return {
        ...row,
        pet: petRes.data,
        guardian: guRes.data,
        staff_member: staffRes.data,
        appointment: appt,
        service_type: serviceType,
        case: caseRes.data,
        financial_adjustment_pending: adj?.financial_adjustment_pending ?? false,
        comanda_id: adj?.comanda_id ?? null,
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
/**
 * Resolve a identidade faturável do atendimento: (guardian_id + pet_id) diretos no encounter
 * OU derivados do caso clínico vinculado (pet_id do caso + tutor principal ou snapshot).
 * Retorna null quando a identidade não puder ser resolvida.
 */
async function resolveBillingIdentity(enc) {
    if (enc.guardian_id && enc.pet_id) {
        return { guardian_id: enc.guardian_id, pet_id: enc.pet_id };
    }
    if (!enc.hub_case_id)
        return null;
    const { data: caseRow } = await supabase_1.supabaseAdmin
        .from('hub_clinical_cases')
        .select('id, pet_id, guardian_id_snapshot')
        .eq('id', enc.hub_case_id)
        .eq('clinic_id', enc.clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
    if (!caseRow)
        return null;
    const casePetId = caseRow.pet_id;
    if (!casePetId)
        return null;
    const effectivePetId = enc.pet_id ?? casePetId;
    let effectiveGuardianId = enc.guardian_id ?? caseRow.guardian_id_snapshot;
    if (!effectiveGuardianId) {
        effectiveGuardianId = await fetchPrimaryGuardianIdForPet(effectivePetId);
    }
    if (!effectiveGuardianId)
        return null;
    return { pet_id: effectivePetId, guardian_id: effectiveGuardianId };
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
            .select('id, clinic_id, unit_id, pet_id, guardian_id, hub_staff_member_id, starts_at, ends_at, status, title, notes, appointment_kind, hub_service_type_id')
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
            if (e.pet_id)
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
                    appointment_kind: a.appointment_kind,
                    title: a.title,
                    notes: a.notes,
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
        const apptIdsForAdj = [
            ...new Set(items.map((it) => it.appointment_id).filter(Boolean)),
        ];
        const adjByAppt = await (0, hubComandasController_1.financialAdjustmentFlagsForAppointments)(clinic_id, apptIdsForAdj);
        for (const item of items) {
            const aid = item.appointment_id;
            if (!aid)
                continue;
            const f = adjByAppt.get(aid);
            if (f?.financial_adjustment_pending) {
                item.financial_adjustment_pending = true;
                item.comanda_id = f.comanda_id;
            }
        }
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
        const encounterType = b.encounter_type ?? 'consultation';
        const isEmergency = encounterType === 'emergency';
        const hasPet = !!b.pet_id;
        if (b.hub_service_type_id) {
            if (!(await assertOperationalClinicalServiceType(b.clinic_id, b.hub_service_type_id))) {
                return res.status(400).json({
                    error: 'O tipo de serviço deve ser da área Clínica, Internação ou Cirurgia.',
                });
            }
        }
        if (b.link_agenda_slot && b.hub_appointment_id) {
            return res.status(400).json({ error: 'Não combine link_agenda_slot com hub_appointment_id.' });
        }
        if (b.link_agenda_slot && !b.hub_service_type_id) {
            return res.status(400).json({ error: 'Para criar o encaixe na agenda principal, informe hub_service_type_id.' });
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
        // Ramo emergência sem pet: pula validações de pet/tutor e não cria caso.
        let resolvedGuardianId = null;
        let caseId = null;
        if (hasPet) {
            if (!(await assertPetInClinic(b.clinic_id, b.pet_id))) {
                return res.status(400).json({ error: 'Pet inválido' });
            }
            resolvedGuardianId = b.guardian_id ?? null;
            if (!resolvedGuardianId) {
                resolvedGuardianId = await fetchPrimaryGuardianIdForPet(b.pet_id);
            }
            if (!resolvedGuardianId) {
                if (!isEmergency) {
                    return res.status(400).json({
                        error: 'É obrigatório ter um tutor responsável cadastrado e selecionado. Vincule o tutor ao pet na ficha do cliente ou escolha o tutor antes de iniciar o atendimento.',
                    });
                }
                // Emergência com pet mas sem tutor: segue sem tutor (será identificado depois).
            }
            else {
                if (!(await guardianInClinic(b.clinic_id, resolvedGuardianId))) {
                    return res.status(400).json({ error: 'Tutor inválido para esta clínica' });
                }
                if (!(await guardianLinkedToPet(b.pet_id, resolvedGuardianId))) {
                    return res.status(400).json({ error: 'O tutor informado não está vinculado a este pet' });
                }
            }
            // Resolve ou cria o caso clínico apenas quando há pet.
            try {
                caseId = await (0, hubClinicalCasesController_1.resolveOrCreateClinicalCase)({
                    clinic_id: b.clinic_id,
                    unit_id: b.unit_id,
                    pet_id: b.pet_id,
                    guardian_id: resolvedGuardianId,
                    primary_veterinarian_id: b.hub_staff_member_id,
                    chief_complaint: b.chief_complaint,
                    started_at: now,
                    hub_case_id: b.hub_case_id,
                    create_new_case: b.create_new_case,
                });
            }
            catch (caseErr) {
                return res.status(400).json({ error: caseErr?.message || 'Erro ao resolver caso clínico' });
            }
        }
        else {
            // Emergência sem pet: guarda hub_case_id se o cliente enviar um explicitamente (não criamos, só vinculamos).
            caseId = b.hub_case_id ?? null;
        }
        let effectiveApptId = b.hub_appointment_id ?? null;
        if (b.link_agenda_slot && b.hub_service_type_id) {
            try {
                effectiveApptId = await createLinkedClinicalAgendaAppointment({
                    clinic_id: b.clinic_id,
                    unit_id: b.unit_id ?? null,
                    pet_id: b.pet_id ?? null,
                    guardian_id: resolvedGuardianId,
                    hub_staff_member_id: b.hub_staff_member_id ?? null,
                    hub_service_type_id: b.hub_service_type_id,
                    chief_complaint: b.chief_complaint ?? null,
                    appointment_kind: encounterType === 'emergency' ? 'clinical_emergency' : 'clinical_walk_in',
                });
            }
            catch (slotErr) {
                return res.status(400).json({ error: slotErr.message || 'Erro ao criar encaixe na agenda' });
            }
        }
        const insert = {
            clinic_id: b.clinic_id,
            unit_id: b.unit_id ?? null,
            pet_id: b.pet_id ?? null,
            guardian_id: resolvedGuardianId,
            hub_appointment_id: effectiveApptId,
            hub_staff_member_id: b.hub_staff_member_id ?? null,
            hub_case_id: caseId,
            encounter_type: encounterType,
            status: 'in_progress',
            chief_complaint: b.chief_complaint ?? null,
            summary_notes: b.summary_notes ?? null,
            started_at: now,
        };
        const { data, error } = await supabase_1.supabaseAdmin.from('hub_encounters').insert(insert).select(ENCOUNTER_SELECT).single();
        if (error)
            return res.status(500).json({ error: error.message });
        if (effectiveApptId) {
            await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update({ status: 'in_progress' })
                .eq('id', effectiveApptId)
                .eq('clinic_id', b.clinic_id);
        }
        const enc = data;
        // Só registra no timeline quando o pet já foi identificado.
        if (hasPet && caseId) {
            void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
                clinic_id: b.clinic_id,
                pet_id: b.pet_id,
                hub_case_id: caseId,
                hub_encounter_id: enc.id,
                event_type: 'encounter_created',
                ref_type: 'encounter',
                ref_id: enc.id,
                title: 'Atendimento iniciado',
                body: b.chief_complaint ?? null,
            });
        }
        const encounter = await enrichEncounter(enc);
        return res.status(201).json({ encounter });
    }
    catch (e) {
        console.error('createHubEncounter', e);
        return res.status(500).json({ error: e?.message || 'Erro ao criar atendimento' });
    }
};
exports.createHubEncounter = createHubEncounter;
/** POST /encounters/open-from-appointment
 *
 * Único ponto de criação de encounter a partir de um slot na agenda clínica.
 * Aceita overrides opcionais de caso clínico que têm precedência sobre os
 * campos intake_* do agendamento (usados pelo modal "Iniciar atendimento").
 * Para appointment_kind === 'clinical_emergency', permite ausência de pet_id.
 */
const openHubEncounterFromAppointment = async (req, res) => {
    try {
        const body = zod_1.z
            .object({
            clinic_id: uuidStr,
            hub_appointment_id: uuidStr,
            hub_case_id: uuidStr.optional().nullable(),
            create_new_case: zod_1.z.boolean().optional(),
            new_case_title: zod_1.z.string().max(200).optional().nullable(),
        })
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
            .select('id, clinic_id, unit_id, pet_id, guardian_id, hub_staff_member_id, notes, appointment_kind, intake_hub_case_id, intake_create_new_case, intake_new_case_title')
            .eq('id', hub_appointment_id)
            .eq('clinic_id', clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (apptErr)
            return res.status(500).json({ error: apptErr.message });
        if (!appt)
            return res.status(404).json({ error: 'Agendamento não encontrado' });
        const apptRow = appt;
        const apptKind = apptRow.appointment_kind ?? 'standard';
        const isEmergency = apptKind === 'clinical_emergency';
        const petId = apptRow.pet_id ?? null;
        if (!petId && !isEmergency) {
            return res.status(400).json({
                error: 'Agendamento sem pet associado. Informe o pet antes de iniciar o atendimento.',
            });
        }
        const encounterType = isEmergency ? 'emergency' : 'consultation';
        const now = new Date().toISOString();
        // Overrides do body têm precedência sobre os campos intake_* do agendamento
        const intakeCaseId = body.data.hub_case_id !== undefined
            ? body.data.hub_case_id
            : (apptRow.intake_hub_case_id ?? null);
        const intakeCreateNew = body.data.create_new_case !== undefined
            ? body.data.create_new_case
            : apptRow.intake_create_new_case === true;
        const intakeNewTitle = body.data.new_case_title !== undefined
            ? body.data.new_case_title
            : (apptRow.intake_new_case_title ?? null);
        let caseId = null;
        let resolvedGuardianId = null;
        if (petId) {
            let apptGuardianId = apptRow.guardian_id ?? null;
            if (!apptGuardianId) {
                apptGuardianId = await fetchPrimaryGuardianIdForPet(petId);
            }
            if (!apptGuardianId) {
                return res.status(400).json({
                    error: 'Agendamento sem tutor e o pet não possui tutor principal. Informe o tutor no agendamento ou vincule-o ao pet antes de abrir o atendimento.',
                });
            }
            resolvedGuardianId = apptGuardianId;
            try {
                caseId = await (0, hubClinicalCasesController_1.resolveOrCreateClinicalCase)({
                    clinic_id,
                    unit_id: apptRow.unit_id,
                    pet_id: petId,
                    guardian_id: apptGuardianId,
                    primary_veterinarian_id: apptRow.hub_staff_member_id,
                    chief_complaint: apptRow.notes,
                    started_at: now,
                    hub_case_id: intakeCaseId,
                    create_new_case: intakeCreateNew,
                    new_case_title: intakeNewTitle,
                });
            }
            catch (caseErr) {
                return res.status(400).json({ error: caseErr?.message || 'Erro ao resolver caso clínico' });
            }
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .insert({
            clinic_id,
            unit_id: apptRow.unit_id,
            pet_id: petId,
            guardian_id: resolvedGuardianId,
            hub_appointment_id,
            hub_staff_member_id: apptRow.hub_staff_member_id,
            hub_case_id: caseId,
            encounter_type: encounterType,
            status: 'in_progress',
            chief_complaint: apptRow.notes,
            started_at: now,
        })
            .select(ENCOUNTER_SELECT)
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        await supabase_1.supabaseAdmin
            .from('hub_appointments')
            .update({
            status: 'in_progress',
            intake_hub_case_id: null,
            intake_create_new_case: null,
            intake_new_case_title: null,
        })
            .eq('id', hub_appointment_id)
            .eq('clinic_id', clinic_id);
        if (petId) {
            await (0, hubClinicalTimelineController_1.recordTimelineEvent)({
                clinic_id,
                pet_id: petId,
                hub_case_id: caseId ?? null,
                hub_encounter_id: data.id,
                event_type: 'encounter_created',
                title: 'Atendimento iniciado',
                ref_type: 'encounter',
                ref_id: data.id,
            });
        }
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
        const { data: existingRow, error: exErr } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('id, pet_id, guardian_id, clinic_id, status, hub_case_id')
            .eq('id', id.data)
            .eq('clinic_id', b.clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (exErr)
            return res.status(500).json({ error: exErr.message });
        if (!existingRow)
            return res.status(404).json({ error: 'Atendimento não encontrado' });
        const existing = existingRow;
        if (existing.status === 'completed') {
            return res.status(400).json({ error: 'Use o endpoint de emenda para editar atendimentos já finalizados.' });
        }
        // Validação de guardian_id: não remover, mas permitir primeira atribuição a partir de null.
        if (b.guardian_id !== undefined) {
            const gid = b.guardian_id;
            if (gid === null) {
                return res.status(400).json({
                    error: 'Não é permitido remover o tutor pelo PATCH. Use outro tutor vinculado ao pet.',
                });
            }
            if (!(await guardianInClinic(b.clinic_id, gid))) {
                return res.status(400).json({ error: 'Tutor inválido para esta clínica' });
            }
            // Só valida vínculo pet-tutor se o atendimento já tiver um pet identificado.
            if (existing.pet_id) {
                if (!(await guardianLinkedToPet(existing.pet_id, gid))) {
                    return res.status(400).json({
                        error: 'Este tutor não está vinculado a este pet. Vincule na ficha do cliente ou do pet antes de associar.',
                    });
                }
            }
        }
        // Validação e cópia de identidade ao setar pet_id.
        if (b.pet_id !== undefined && b.pet_id !== null) {
            if (!(await assertPetInClinic(b.clinic_id, b.pet_id))) {
                return res.status(400).json({ error: 'Pet inválido para esta clínica' });
            }
        }
        // Ao setar hub_case_id: validar caso e copiar pet_id/guardian_id quando ainda ausentes no encounter.
        if (b.hub_case_id !== undefined && b.hub_case_id !== null) {
            const { data: caseRow } = await supabase_1.supabaseAdmin
                .from('hub_clinical_cases')
                .select('id, pet_id, guardian_id_snapshot')
                .eq('id', b.hub_case_id)
                .eq('clinic_id', b.clinic_id)
                .is('deleted_at', null)
                .maybeSingle();
            if (!caseRow) {
                return res.status(400).json({ error: 'Caso clínico inválido para esta clínica' });
            }
            const cRow = caseRow;
            // Copiar pet_id do caso para o encounter se ainda não tiver.
            if (!existing.pet_id && cRow.pet_id) {
                if (b.pet_id === undefined) {
                    b.pet_id = cRow.pet_id;
                }
            }
            // Copiar guardian quando o encounter ainda não tiver.
            if (!existing.guardian_id && cRow.guardian_id_snapshot) {
                if (b.guardian_id === undefined) {
                    // Aplica somente se o guardian ainda pertence à clínica.
                    if (await guardianInClinic(b.clinic_id, cRow.guardian_id_snapshot)) {
                        b.guardian_id = cRow.guardian_id_snapshot;
                    }
                }
            }
            // Se o caso tem pet mas o guardian não veio do snapshot, tenta o tutor principal do pet.
            if (!existing.guardian_id && !b.guardian_id && (b.pet_id ?? existing.pet_id)) {
                const derivedPetId = (b.pet_id ?? existing.pet_id);
                const primaryGu = await fetchPrimaryGuardianIdForPet(derivedPetId);
                if (primaryGu && (await guardianInClinic(b.clinic_id, primaryGu))) {
                    b.guardian_id = primaryGu;
                }
            }
        }
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
        if (b.guardian_id !== undefined)
            patch.guardian_id = b.guardian_id;
        if (b.pet_id !== undefined)
            patch.pet_id = b.pet_id;
        if (b.hub_case_id !== undefined)
            patch.hub_case_id = b.hub_case_id;
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
        if (patch.status === 'cancelled') {
            void (0, hubComandasController_1.maybeFlagComandaCancellationPending)(b.clinic_id, 'encounter', id.data);
        }
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
        const { data: beforeComplete, error: bfErr } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select('guardian_id, pet_id, hub_appointment_id, hub_case_id, chief_complaint, status')
            .eq('id', id.data)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null)
            .maybeSingle();
        if (bfErr)
            return res.status(500).json({ error: bfErr.message });
        if (!beforeComplete)
            return res.status(404).json({ error: 'Atendimento não encontrado' });
        const bf = beforeComplete;
        const billingId = await resolveBillingIdentity({
            pet_id: bf.pet_id,
            guardian_id: bf.guardian_id,
            hub_case_id: bf.hub_case_id,
            clinic_id: clinic_id.data,
        });
        if (!billingId) {
            return res.status(409).json({
                error: 'Para finalizar, associe tutor e pet ao atendimento — ou vincule um caso clínico que possua pet/tutor cadastrado. Em urgência, a identificação é obrigatória para encerramento.',
            });
        }
        const now = new Date().toISOString();
        // Denormaliza identidade faturável no encounter antes de concluir (quando resolvida via caso).
        const identityPatch = {};
        if (!bf.pet_id && billingId.pet_id)
            identityPatch.pet_id = billingId.pet_id;
        if (!bf.guardian_id && billingId.guardian_id)
            identityPatch.guardian_id = billingId.guardian_id;
        if (Object.keys(identityPatch).length > 0) {
            await supabase_1.supabaseAdmin
                .from('hub_encounters')
                .update(identityPatch)
                .eq('id', id.data)
                .eq('clinic_id', clinic_id.data);
        }
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
        const resolvedPetId = enc.pet_id ?? billingId.pet_id;
        if (enc.hub_appointment_id) {
            await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update({ status: 'done' })
                .eq('id', enc.hub_appointment_id);
        }
        if (resolvedPetId) {
            await supabase_1.supabaseAdmin.from('hub_encounter_events').insert({
                clinic_id: clinic_id.data,
                pet_id: resolvedPetId,
                hub_encounter_id: id.data,
                event_type: 'consultation',
                title: 'Consulta finalizada',
                body: bf.chief_complaint ?? null,
                event_at: now,
            });
        }
        if (resolvedPetId) {
            void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
                clinic_id: clinic_id.data,
                pet_id: resolvedPetId,
                hub_case_id: enc.hub_case_id,
                hub_encounter_id: id.data,
                event_type: 'encounter_completed',
                ref_type: 'encounter',
                ref_id: id.data,
                title: 'Atendimento finalizado',
                body: bf.chief_complaint ?? null,
                event_at: now,
            });
        }
        void (0, hubComandasController_1.syncOpenComandasAfterEncounterCompleted)(clinic_id.data, id.data);
        const changedBy = req.body?.changed_by ?? null;
        void saveEncounterSnapshot({
            clinic_id: clinic_id.data,
            encounter_id: id.data,
            document: enc,
            changed_by: changedBy,
            change_reason: 'Finalização do atendimento',
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
/** PATCH /encounters/:id/amend — edição pós-finalização com motivo obrigatório e snapshot. */
const amendHubEncounter = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        if (!id.success)
            return res.status(400).json({ error: 'id inválido' });
        const parsed = amendEncounterSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        const { data: current } = await supabase_1.supabaseAdmin
            .from('hub_encounters')
            .select(ENCOUNTER_SELECT)
            .eq('id', id.data)
            .eq('clinic_id', b.clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (!current)
            return res.status(404).json({ error: 'Atendimento não encontrado' });
        if (current.status !== 'completed') {
            return res.status(400).json({ error: 'Emenda só é permitida em atendimentos finalizados' });
        }
        const patch = {};
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
        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
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
        const enc = data;
        void saveEncounterSnapshot({
            clinic_id: b.clinic_id,
            encounter_id: id.data,
            document: enc,
            changed_by: b.changed_by ?? null,
            change_reason: b.change_reason,
        });
        const amendPetId = enc.pet_id;
        if (amendPetId) {
            void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
                clinic_id: b.clinic_id,
                pet_id: amendPetId,
                hub_case_id: enc.hub_case_id,
                hub_encounter_id: id.data,
                event_type: 'encounter_amended',
                ref_type: 'encounter',
                ref_id: id.data,
                title: 'Atendimento editado após finalização',
                body: b.change_reason,
                created_by: b.changed_by ?? null,
            });
        }
        const encounter = await enrichEncounter(enc);
        return res.json({ encounter });
    }
    catch (e) {
        console.error('amendHubEncounter', e);
        return res.status(500).json({ error: e?.message || 'Erro ao emendar atendimento' });
    }
};
exports.amendHubEncounter = amendHubEncounter;
/** GET /encounters/:id/versions — histórico de versões do audit trail. */
const getHubEncounterVersions = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const clinic_id = uuidStr.safeParse(req.query.clinic_id);
        if (!id.success || !clinic_id.success) {
            return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_clinical_document_versions')
            .select('id, version_no, changed_by, change_reason, created_at, document')
            .eq('entity_id', id.data)
            .eq('clinic_id', clinic_id.data)
            .order('version_no', { ascending: false });
        if (error)
            return res.status(500).json({ error: error.message });
        const rows = (data ?? []);
        const staffIds = [...new Set(rows.map((r) => r.changed_by).filter(Boolean))];
        const staffMap = new Map();
        if (staffIds.length) {
            const { data: staffRows } = await supabase_1.supabaseAdmin
                .from('hub_staff_members')
                .select('id, full_name')
                .in('id', staffIds);
            for (const s of staffRows ?? []) {
                staffMap.set(s.id, s);
            }
        }
        const enriched = rows.map((r) => ({
            ...r,
            document: undefined,
            changed_by_member: staffMap.get(r.changed_by) ?? null,
        }));
        return res.json({ versions: enriched });
    }
    catch (e) {
        console.error('getHubEncounterVersions', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar versões' });
    }
};
exports.getHubEncounterVersions = getHubEncounterVersions;
