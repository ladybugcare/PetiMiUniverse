"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHubClinicalAlerts = exports.patchHubSurgery = exports.createHubSurgery = exports.listHubSurgeries = exports.createHubHospitalizationEvent = exports.listHubHospitalizationEvents = exports.addHubHospitalizationDailyNote = exports.patchHubHospitalization = exports.createHubHospitalization = exports.listHubHospitalizations = exports.createHubHospitalBed = exports.listHubHospitalBeds = exports.uploadHubClinicalAttachment = exports.createHubClinicalAttachment = exports.listHubClinicalAttachments = exports.createHubVaccination = exports.listHubVaccinations = exports.getHubPrescriptionPdf = exports.listPrescriptionDocuments = exports.issuePrescriptionDocument = exports.patchHubPrescription = exports.createHubPrescription = exports.listHubPrescriptions = exports.createHubEncounterEvent = exports.listHubEncounterEvents = exports.upsertHubPetClinicalFlag = exports.listHubPetClinicalFlags = void 0;
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubClinicalFileUpload_js_1 = require("../../utils/hubClinicalFileUpload.js");
const supabaseSchemaErrors_js_1 = require("../../utils/supabaseSchemaErrors.js");
const hubPrescriptionPdf_1 = require("./hubPrescriptionPdf");
const hubClinicalTimelineController_1 = require("./hubClinicalTimelineController");
const uuidStr = zod_1.z.string().uuid();
// ── Pet clinical flags ───────────────────────────────────────────────────────
const flagKeySchema = zod_1.z.enum(['allergy', 'cardiac', 'aggressive', 'diabetic', 'epileptic', 'other']);
const listHubPetClinicalFlags = async (req, res) => {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    const pet_id = uuidStr.safeParse(req.query.pet_id);
    if (!clinic_id.success || !pet_id.success) {
        return res.status(400).json({ error: 'clinic_id e pet_id obrigatórios' });
    }
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pet_clinical_flags')
        .select('*')
        .eq('clinic_id', clinic_id.data)
        .eq('pet_id', pet_id.data)
        .eq('active', true)
        .is('deleted_at', null)
        .order('flag_key');
    if (error)
        return res.status(500).json({ error: error.message });
    return res.json({ flags: data ?? [] });
};
exports.listHubPetClinicalFlags = listHubPetClinicalFlags;
const upsertHubPetClinicalFlag = async (req, res) => {
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        pet_id: uuidStr,
        flag_key: flagKeySchema,
        label: zod_1.z.string().trim().min(1).max(120),
        notes: zod_1.z.string().trim().max(2000).optional().nullable(),
        active: zod_1.z.boolean().optional(),
    })
        .safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;
    const { data: existing } = await supabase_1.supabaseAdmin
        .from('hub_pet_clinical_flags')
        .select('id')
        .eq('pet_id', b.pet_id)
        .eq('flag_key', b.flag_key)
        .is('deleted_at', null)
        .maybeSingle();
    if (existing) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_pet_clinical_flags')
            .update({ label: b.label, notes: b.notes ?? null, active: b.active ?? true })
            .eq('id', existing.id)
            .select('*')
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ flag: data });
    }
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_pet_clinical_flags')
        .insert({
        clinic_id: b.clinic_id,
        pet_id: b.pet_id,
        flag_key: b.flag_key,
        label: b.label,
        notes: b.notes ?? null,
        active: b.active ?? true,
    })
        .select('*')
        .single();
    if (error)
        return res.status(500).json({ error: error.message });
    return res.status(201).json({ flag: data });
};
exports.upsertHubPetClinicalFlag = upsertHubPetClinicalFlag;
// ── Encounter events (evolução) ─────────────────────────────────────────────
const listHubEncounterEvents = async (req, res) => {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    const pet_id = uuidStr.safeParse(req.query.pet_id);
    if (!clinic_id.success || !pet_id.success) {
        return res.status(400).json({ error: 'clinic_id e pet_id obrigatórios' });
    }
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_encounter_events')
        .select('*')
        .eq('clinic_id', clinic_id.data)
        .eq('pet_id', pet_id.data)
        .is('deleted_at', null)
        .order('event_at', { ascending: false });
    if (error)
        return res.status(500).json({ error: error.message });
    return res.json({ events: data ?? [] });
};
exports.listHubEncounterEvents = listHubEncounterEvents;
const createHubEncounterEvent = async (req, res) => {
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        pet_id: uuidStr,
        hub_encounter_id: uuidStr.optional().nullable(),
        event_type: zod_1.z
            .enum(['consultation', 'return_visit', 'hospitalization', 'surgery', 'vaccination', 'exam', 'note'])
            .optional(),
        title: zod_1.z.string().trim().min(1).max(200),
        body: zod_1.z.string().trim().max(8000).optional().nullable(),
        event_at: zod_1.z.string().datetime({ offset: true }).optional(),
    })
        .safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_encounter_events')
        .insert({
        clinic_id: b.clinic_id,
        pet_id: b.pet_id,
        hub_encounter_id: b.hub_encounter_id ?? null,
        event_type: b.event_type ?? 'note',
        title: b.title,
        body: b.body ?? null,
        event_at: b.event_at ?? new Date().toISOString(),
    })
        .select('*')
        .single();
    if (error)
        return res.status(500).json({ error: error.message });
    return res.status(201).json({ event: data });
};
exports.createHubEncounterEvent = createHubEncounterEvent;
// ── Prescriptions ───────────────────────────────────────────────────────────
const prescriptionItemInputSchema = zod_1.z.object({
    medication_name: zod_1.z.string().trim().min(1).max(200),
    dosage: zod_1.z.string().trim().max(200).optional().nullable(),
    frequency: zod_1.z.string().trim().max(200).optional().nullable(),
    duration: zod_1.z.string().trim().max(200).optional().nullable(),
    instructions: zod_1.z.string().trim().max(2000).optional().nullable(),
    hub_inventory_item_id: uuidStr.optional().nullable(),
    administration: zod_1.z.enum(['home_use', 'administered_in_clinic']).optional().default('home_use'),
});
async function fetchHubPrescriptionWithItems(prescriptionId) {
    const { data: rx, error: rxErr } = await supabase_1.supabaseAdmin
        .from('hub_prescriptions')
        .select('*')
        .eq('id', prescriptionId)
        .is('deleted_at', null)
        .maybeSingle();
    if (rxErr || !rx)
        return null;
    const { data: its, error: itErr } = await supabase_1.supabaseAdmin
        .from('hub_prescription_items')
        .select('*')
        .eq('prescription_id', prescriptionId)
        .order('order_index');
    if (itErr)
        return null;
    return { prescription: rx, items: its ?? [] };
}
const listHubPrescriptions = async (req, res) => {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic_id.success)
        return res.status(400).json({ error: 'clinic_id obrigatório' });
    let q = supabase_1.supabaseAdmin
        .from('hub_prescriptions')
        .select('*')
        .eq('clinic_id', clinic_id.data)
        .is('deleted_at', null)
        .order('prescribed_at', { ascending: false })
        .limit(100);
    const pet_id = req.query.pet_id ? uuidStr.safeParse(req.query.pet_id) : null;
    if (pet_id?.success)
        q = q.eq('pet_id', pet_id.data);
    const rx_case_id = req.query.hub_case_id ? uuidStr.safeParse(req.query.hub_case_id) : null;
    if (rx_case_id?.success)
        q = q.eq('hub_case_id', rx_case_id.data);
    const rx_encounter_id = req.query.hub_encounter_id ? uuidStr.safeParse(req.query.hub_encounter_id) : null;
    if (rx_encounter_id?.success)
        q = q.eq('hub_encounter_id', rx_encounter_id.data);
    const { data, error } = await q;
    if (error)
        return res.status(500).json({ error: error.message });
    const ids = (data ?? []).map((p) => p.id);
    let items = [];
    if (ids.length) {
        const { data: rows } = await supabase_1.supabaseAdmin
            .from('hub_prescription_items')
            .select('*')
            .in('prescription_id', ids)
            .order('order_index');
        items = rows ?? [];
    }
    const byRx = new Map();
    for (const it of items) {
        const pid = it.prescription_id;
        const arr = byRx.get(pid) ?? [];
        arr.push(it);
        byRx.set(pid, arr);
    }
    return res.json({
        prescriptions: (data ?? []).map((p) => ({
            ...p,
            items: byRx.get(p.id) ?? [],
        })),
    });
};
exports.listHubPrescriptions = listHubPrescriptions;
const createHubPrescription = async (req, res) => {
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        pet_id: uuidStr,
        hub_encounter_id: uuidStr.optional().nullable(),
        hub_case_id: uuidStr.optional().nullable(),
        hub_staff_member_id: uuidStr.optional().nullable(),
        notes: zod_1.z.string().trim().max(4000).optional().nullable(),
        items: zod_1.z.array(prescriptionItemInputSchema).min(1),
    })
        .safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;
    /** Uma prescrição ativa/rascunho por atendimento: novos itens são anexados à existente. */
    if (b.hub_encounter_id) {
        const { data: existingList } = await supabase_1.supabaseAdmin
            .from('hub_prescriptions')
            .select('id')
            .eq('hub_encounter_id', b.hub_encounter_id)
            .eq('clinic_id', b.clinic_id)
            .eq('pet_id', b.pet_id)
            .in('status', ['draft', 'active'])
            .is('deleted_at', null)
            .order('prescribed_at', { ascending: false })
            .limit(1);
        const existingId = existingList?.[0]?.id;
        if (existingId) {
            const { data: maxRow } = await supabase_1.supabaseAdmin
                .from('hub_prescription_items')
                .select('order_index')
                .eq('prescription_id', existingId)
                .order('order_index', { ascending: false })
                .limit(1)
                .maybeSingle();
            const baseOrder = typeof maxRow?.order_index === 'number' ? maxRow.order_index + 1 : 0;
            const insertItems = b.items.map((it, i) => ({
                prescription_id: existingId,
                medication_name: it.medication_name,
                dosage: it.dosage ?? null,
                frequency: it.frequency ?? null,
                duration: it.duration ?? null,
                instructions: it.instructions ?? null,
                hub_inventory_item_id: it.hub_inventory_item_id ?? null,
                administration: it.administration ?? 'home_use',
                order_index: baseOrder + i,
            }));
            const { error: itemsErr } = await supabase_1.supabaseAdmin.from('hub_prescription_items').insert(insertItems);
            if (itemsErr)
                return res.status(500).json({ error: itemsErr.message });
            if (b.hub_staff_member_id) {
                await supabase_1.supabaseAdmin
                    .from('hub_prescriptions')
                    .update({ hub_staff_member_id: b.hub_staff_member_id })
                    .eq('id', existingId);
            }
            void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
                clinic_id: b.clinic_id,
                pet_id: b.pet_id,
                hub_case_id: b.hub_case_id ?? null,
                hub_encounter_id: b.hub_encounter_id,
                event_type: 'note',
                ref_type: 'prescription',
                ref_id: existingId,
                title: `Itens adicionados à prescrição (${b.items.length})`,
                body: b.items.map((it) => it.medication_name).join(', '),
                created_by: b.hub_staff_member_id ?? null,
            });
            const full = await fetchHubPrescriptionWithItems(existingId);
            if (!full)
                return res.status(500).json({ error: 'Erro ao recarregar prescrição' });
            return res.status(200).json({
                prescription: { ...full.prescription, items: full.items },
                merged_into_existing: true,
            });
        }
    }
    const { data: rx, error: rxErr } = await supabase_1.supabaseAdmin
        .from('hub_prescriptions')
        .insert({
        clinic_id: b.clinic_id,
        pet_id: b.pet_id,
        hub_encounter_id: b.hub_encounter_id ?? null,
        hub_case_id: b.hub_case_id ?? null,
        hub_staff_member_id: b.hub_staff_member_id ?? null,
        notes: b.notes ?? null,
        status: 'active',
    })
        .select('*')
        .single();
    if (rxErr)
        return res.status(500).json({ error: rxErr.message });
    const insertItems = b.items.map((it, i) => ({
        prescription_id: rx.id,
        medication_name: it.medication_name,
        dosage: it.dosage ?? null,
        frequency: it.frequency ?? null,
        duration: it.duration ?? null,
        instructions: it.instructions ?? null,
        hub_inventory_item_id: it.hub_inventory_item_id ?? null,
        administration: it.administration ?? 'home_use',
        order_index: i,
    }));
    const { error: itemsErr } = await supabase_1.supabaseAdmin.from('hub_prescription_items').insert(insertItems);
    if (itemsErr)
        return res.status(500).json({ error: itemsErr.message });
    void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
        clinic_id: b.clinic_id,
        pet_id: b.pet_id,
        hub_case_id: b.hub_case_id ?? null,
        hub_encounter_id: b.hub_encounter_id ?? null,
        event_type: 'prescription_issued',
        ref_type: 'prescription',
        ref_id: rx.id,
        title: `Prescrição emitida (${b.items.length} item${b.items.length > 1 ? 's' : ''})`,
        body: b.items.map((it) => it.medication_name).join(', '),
        created_by: b.hub_staff_member_id ?? null,
    });
    const full = await fetchHubPrescriptionWithItems(rx.id);
    if (!full)
        return res.status(500).json({ error: 'Erro ao recarregar prescrição' });
    return res.status(201).json({ prescription: { ...full.prescription, items: full.items } });
};
exports.createHubPrescription = createHubPrescription;
const patchHubPrescription = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        notes: zod_1.z.string().trim().max(4000).optional().nullable(),
        hub_staff_member_id: uuidStr.optional().nullable(),
        items: zod_1.z.array(prescriptionItemInputSchema).min(1).optional(),
    })
        .safeParse(req.body);
    if (!id.success)
        return res.status(400).json({ error: id.error.flatten() });
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;
    if (b.notes === undefined && !b.items) {
        return res.status(400).json({ error: 'Informe items e/ou notes para atualizar' });
    }
    const { data: rx, error: rxErr } = await supabase_1.supabaseAdmin
        .from('hub_prescriptions')
        .select('id, status, clinic_id')
        .eq('id', id.data)
        .eq('clinic_id', b.clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
    if (rxErr)
        return res.status(500).json({ error: rxErr.message });
    if (!rx)
        return res.status(404).json({ error: 'Prescrição não encontrada' });
    if (rx.status === 'cancelled')
        return res.status(409).json({ error: 'Prescrição cancelada não pode ser editada' });
    const rowUpdates = {};
    if (b.notes !== undefined)
        rowUpdates.notes = b.notes;
    if (b.hub_staff_member_id !== undefined)
        rowUpdates.hub_staff_member_id = b.hub_staff_member_id;
    if (b.items) {
        const { error: delErr } = await supabase_1.supabaseAdmin.from('hub_prescription_items').delete().eq('prescription_id', id.data);
        if (delErr)
            return res.status(500).json({ error: delErr.message });
        const insertRows = b.items.map((it, i) => ({
            prescription_id: id.data,
            medication_name: it.medication_name,
            dosage: it.dosage ?? null,
            frequency: it.frequency ?? null,
            duration: it.duration ?? null,
            instructions: it.instructions ?? null,
            hub_inventory_item_id: it.hub_inventory_item_id ?? null,
            administration: it.administration ?? 'home_use',
            order_index: i,
        }));
        const { error: insErr } = await supabase_1.supabaseAdmin.from('hub_prescription_items').insert(insertRows);
        if (insErr)
            return res.status(500).json({ error: insErr.message });
    }
    if (Object.keys(rowUpdates).length > 0) {
        const { error: upErr } = await supabase_1.supabaseAdmin.from('hub_prescriptions').update(rowUpdates).eq('id', id.data);
        if (upErr)
            return res.status(500).json({ error: upErr.message });
    }
    else if (b.items) {
        const { error: touchErr } = await supabase_1.supabaseAdmin
            .from('hub_prescriptions')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', id.data);
        if (touchErr)
            return res.status(500).json({ error: touchErr.message });
    }
    const full = await fetchHubPrescriptionWithItems(id.data);
    if (!full)
        return res.status(500).json({ error: 'Erro ao recarregar prescrição' });
    return res.json({ prescription: { ...full.prescription, items: full.items } });
};
exports.patchHubPrescription = patchHubPrescription;
const issuePrescriptionDocument = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        issued_by: uuidStr.optional().nullable(),
    })
        .safeParse(req.body);
    if (!id.success || !parsed.success)
        return res.status(400).json({ error: 'Parâmetros inválidos' });
    const { clinic_id, issued_by } = parsed.data;
    const { data: rxRow } = await supabase_1.supabaseAdmin
        .from('hub_prescriptions')
        .select('id')
        .eq('id', id.data)
        .eq('clinic_id', clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
    if (!rxRow)
        return res.status(404).json({ error: 'Prescrição não encontrada' });
    const { data: latest } = await supabase_1.supabaseAdmin
        .from('hub_prescription_documents')
        .select('version_no')
        .eq('prescription_id', id.data)
        .order('version_no', { ascending: false })
        .limit(1)
        .maybeSingle();
    const nextVersion = latest ? latest.version_no + 1 : 1;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_prescription_documents')
        .insert({
        clinic_id,
        prescription_id: id.data,
        version_no: nextVersion,
        issued_by: issued_by ?? null,
        issued_at: new Date().toISOString(),
        signature_status: 'none',
    })
        .select('*')
        .single();
    if (error)
        return res.status(500).json({ error: error.message });
    return res.status(201).json({ document: data });
};
exports.issuePrescriptionDocument = issuePrescriptionDocument;
const listPrescriptionDocuments = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic_id.success)
        return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_prescription_documents')
        .select('id, prescription_id, version_no, pdf_path, issued_by, issued_at, signature_status, created_at')
        .eq('prescription_id', id.data)
        .eq('clinic_id', clinic_id.data)
        .order('version_no', { ascending: false });
    if (error)
        return res.status(500).json({ error: error.message });
    const rows = (data ?? []);
    const staffIds = [...new Set(rows.map((r) => r.issued_by).filter(Boolean))];
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
        issued_by_member: staffMap.get(r.issued_by) ?? null,
    }));
    return res.json({ documents: enriched });
};
exports.listPrescriptionDocuments = listPrescriptionDocuments;
const getHubPrescriptionPdf = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic_id.success)
        return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
    const { data: rx, error } = await supabase_1.supabaseAdmin
        .from('hub_prescriptions')
        .select(`
      *,
      clinic:clinics(name, phone, email),
      pet:hub_pets(name, species, breed),
      staff:hub_staff_members(full_name, crmv, crmv_uf)
    `)
        .eq('id', id.data)
        .eq('clinic_id', clinic_id.data)
        .is('deleted_at', null)
        .maybeSingle();
    if (error)
        return res.status(500).json({ error: error.message });
    if (!rx)
        return res.status(404).json({ error: 'Prescrição não encontrada' });
    const [{ data: items, error: itemsErr }, { data: petGuardian }] = await Promise.all([
        supabase_1.supabaseAdmin
            .from('hub_prescription_items')
            .select('*')
            .eq('prescription_id', id.data)
            .order('order_index'),
        supabase_1.supabaseAdmin
            .from('hub_pet_guardians')
            .select('guardian:hub_guardians(full_name, phone)')
            .eq('pet_id', rx.pet_id)
            .order('role', { ascending: true })
            .limit(1),
    ]);
    if (itemsErr)
        return res.status(500).json({ error: itemsErr.message });
    const guardianEmbed = petGuardian?.[0]?.guardian ?? null;
    (0, hubPrescriptionPdf_1.streamPrescriptionPdf)(res, { ...rx, items: items ?? [], guardian: guardianEmbed });
};
exports.getHubPrescriptionPdf = getHubPrescriptionPdf;
// ── Vaccinations ────────────────────────────────────────────────────────────
const listHubVaccinations = async (req, res) => {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic_id.success)
        return res.status(400).json({ error: 'clinic_id obrigatório' });
    let q = supabase_1.supabaseAdmin
        .from('hub_vaccination_records')
        .select('*')
        .eq('clinic_id', clinic_id.data)
        .is('deleted_at', null)
        .order('administered_at', { ascending: false });
    const pet_id = req.query.pet_id ? uuidStr.safeParse(req.query.pet_id) : null;
    if (pet_id?.success)
        q = q.eq('pet_id', pet_id.data);
    const hub_case_id = req.query.hub_case_id ? uuidStr.safeParse(req.query.hub_case_id) : null;
    if (hub_case_id?.success)
        q = q.eq('hub_case_id', hub_case_id.data);
    const { data, error } = await q;
    if (error)
        return res.status(500).json({ error: error.message });
    return res.json({ vaccinations: data ?? [] });
};
exports.listHubVaccinations = listHubVaccinations;
const createHubVaccination = async (req, res) => {
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        pet_id: uuidStr,
        hub_encounter_id: uuidStr.optional().nullable(),
        hub_case_id: uuidStr.optional().nullable(),
        vaccine_name: zod_1.z.string().trim().min(1).max(200),
        batch_number: zod_1.z.string().trim().max(120).optional().nullable(),
        administered_at: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        next_dose_at: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        hub_staff_member_id: uuidStr.optional().nullable(),
        notes: zod_1.z.string().trim().max(2000).optional().nullable(),
        // Fase 6
        source: zod_1.z.enum(['in_clinic', 'external']).optional().default('in_clinic'),
        manufacturer: zod_1.z.string().trim().max(200).optional().nullable(),
        hub_inventory_item_id: uuidStr.optional().nullable(),
        hub_inventory_lot_id: uuidStr.optional().nullable(),
        expiry_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    })
        .safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;
    let stockMovementId = null;
    // Baixa de estoque: vacina aplicada na clínica com item de estoque vinculado
    if (b.source === 'in_clinic' && b.hub_inventory_item_id) {
        const { data: mvmt, error: mvmtErr } = await supabase_1.supabaseAdmin
            .from('hub_stock_movements')
            .insert({
            clinic_id: b.clinic_id,
            hub_inventory_item_id: b.hub_inventory_item_id,
            hub_inventory_lot_id: b.hub_inventory_lot_id ?? null,
            movement_type: 'encounter_out',
            quantity: 1,
            unit: 'dose',
            notes: `Vacina aplicada: ${b.vaccine_name}`,
            hub_encounter_id: b.hub_encounter_id ?? null,
        })
            .select('id')
            .single();
        if (!mvmtErr && mvmt) {
            stockMovementId = mvmt.id;
        }
        else if (mvmtErr) {
            console.error('createHubVaccination: erro ao baixar estoque', mvmtErr.message);
        }
    }
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_vaccination_records')
        .insert({
        clinic_id: b.clinic_id,
        pet_id: b.pet_id,
        hub_encounter_id: b.hub_encounter_id ?? null,
        hub_case_id: b.hub_case_id ?? null,
        vaccine_name: b.vaccine_name,
        batch_number: b.batch_number ?? null,
        administered_at: b.administered_at,
        next_dose_at: b.next_dose_at ?? null,
        hub_staff_member_id: b.hub_staff_member_id ?? null,
        notes: b.notes ?? null,
        source: b.source,
        manufacturer: b.manufacturer ?? null,
        hub_inventory_item_id: b.hub_inventory_item_id ?? null,
        hub_inventory_lot_id: b.hub_inventory_lot_id ?? null,
        expiry_date: b.expiry_date ?? null,
        stock_movement_id: stockMovementId,
    })
        .select('*')
        .single();
    if (error)
        return res.status(500).json({ error: error.message });
    void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
        clinic_id: b.clinic_id,
        pet_id: b.pet_id,
        hub_case_id: b.hub_case_id ?? null,
        hub_encounter_id: b.hub_encounter_id ?? null,
        event_type: 'vaccination_applied',
        ref_type: 'vaccination',
        ref_id: data.id,
        title: `Vacina aplicada: ${b.vaccine_name}`,
        body: b.next_dose_at ? `Próxima dose: ${b.next_dose_at}` : null,
        created_by: b.hub_staff_member_id ?? null,
    });
    return res.status(201).json({ vaccination: data });
};
exports.createHubVaccination = createHubVaccination;
// ── Clinical attachments ──────────────────────────────────────────────────────
const listHubClinicalAttachments = async (req, res) => {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic_id.success)
        return res.status(400).json({ error: 'clinic_id obrigatório' });
    let q = supabase_1.supabaseAdmin
        .from('hub_clinical_attachments')
        .select('*')
        .eq('clinic_id', clinic_id.data)
        .is('deleted_at', null)
        .order('uploaded_at', { ascending: false });
    const pet_id = req.query.pet_id ? uuidStr.safeParse(req.query.pet_id) : null;
    const encounter_id = req.query.hub_encounter_id ? uuidStr.safeParse(req.query.hub_encounter_id) : null;
    if (pet_id?.success)
        q = q.eq('pet_id', pet_id.data);
    if (encounter_id?.success)
        q = q.eq('hub_encounter_id', encounter_id.data);
    const { data, error } = await q;
    if (error) {
        if ((0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error)) {
            return res.json({ attachments: [], schema_ready: false, migration_hint: supabaseSchemaErrors_js_1.CLINICAL_ATTACHMENTS_MIGRATION_HINT });
        }
        return res.status(500).json({ error: error.message });
    }
    return res.json({ attachments: data ?? [], schema_ready: true });
};
exports.listHubClinicalAttachments = listHubClinicalAttachments;
const createHubClinicalAttachment = async (req, res) => {
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        pet_id: uuidStr,
        hub_encounter_id: uuidStr.optional().nullable(),
        hub_exam_id: uuidStr.optional().nullable(),
        file_name: zod_1.z.string().trim().min(1).max(255),
        storage_path: zod_1.z.string().trim().min(1).max(500),
        mime_type: zod_1.z.string().trim().max(120).optional().nullable(),
        file_size_bytes: zod_1.z.number().int().optional().nullable(),
        title: zod_1.z.string().trim().max(200).optional().nullable(),
        notes: zod_1.z.string().trim().max(2000).optional().nullable(),
    })
        .safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { data, error } = await supabase_1.supabaseAdmin.from('hub_clinical_attachments').insert(parsed.data).select('*').single();
    if (error) {
        if ((0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error)) {
            return res.status(503).json({ error: supabaseSchemaErrors_js_1.CLINICAL_ATTACHMENTS_MIGRATION_HINT });
        }
        return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ attachment: data });
};
exports.createHubClinicalAttachment = createHubClinicalAttachment;
const clinicalUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
        if (allowed.includes(file.mimetype))
            cb(null, true);
        else
            cb(new Error('Apenas PDF, PNG, JPG ou WEBP são permitidos.'));
    },
}).single('file');
/** POST /api/hub/clinical/attachments/upload — multipart: file + clinic_id, pet_id, hub_encounter_id?, title? */
const uploadHubClinicalAttachment = (req, res) => {
    clinicalUpload(req, res, async (err) => {
        if (err) {
            const msg = err instanceof Error ? err.message : 'Erro no upload';
            return res.status(400).json({ error: msg });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado (campo: file)' });
        }
        const parsed = zod_1.z
            .object({
            clinic_id: uuidStr,
            pet_id: uuidStr,
            hub_encounter_id: uuidStr.optional().nullable(),
            hub_exam_id: uuidStr.optional().nullable(),
            title: zod_1.z.string().trim().max(200).optional().nullable(),
            notes: zod_1.z.string().trim().max(2000).optional().nullable(),
        })
            .safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        try {
            const { url, path } = await (0, hubClinicalFileUpload_js_1.uploadHubClinicalFileToStorage)({
                buffer: req.file.buffer,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
            }, b.clinic_id, b.pet_id);
            const { data, error } = await supabase_1.supabaseAdmin
                .from('hub_clinical_attachments')
                .insert({
                clinic_id: b.clinic_id,
                pet_id: b.pet_id,
                hub_encounter_id: b.hub_encounter_id ?? null,
                hub_exam_id: b.hub_exam_id ?? null,
                file_name: req.file.originalname,
                storage_path: url,
                mime_type: req.file.mimetype,
                file_size_bytes: req.file.size,
                title: b.title ?? req.file.originalname,
                notes: b.notes ?? null,
            })
                .select('*')
                .single();
            if (error) {
                if ((0, supabaseSchemaErrors_js_1.isMissingPostgrestRelation)(error)) {
                    return res.status(503).json({ error: supabaseSchemaErrors_js_1.CLINICAL_ATTACHMENTS_MIGRATION_HINT });
                }
                return res.status(500).json({ error: error.message });
            }
            return res.status(201).json({ attachment: data });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro ao enviar anexo';
            return res.status(500).json({ error: msg });
        }
    });
};
exports.uploadHubClinicalAttachment = uploadHubClinicalAttachment;
// ── Hospital beds & hospitalizations ────────────────────────────────────────
const listHubHospitalBeds = async (req, res) => {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic_id.success)
        return res.status(400).json({ error: 'clinic_id obrigatório' });
    let q = supabase_1.supabaseAdmin
        .from('hub_hospital_beds')
        .select('*')
        .eq('clinic_id', clinic_id.data)
        .is('deleted_at', null)
        .order('code');
    const unit_id = req.query.unit_id ? uuidStr.safeParse(req.query.unit_id) : null;
    if (unit_id?.success)
        q = q.eq('unit_id', unit_id.data);
    const { data, error } = await q;
    if (error)
        return res.status(500).json({ error: error.message });
    return res.json({ beds: data ?? [] });
};
exports.listHubHospitalBeds = listHubHospitalBeds;
const createHubHospitalBed = async (req, res) => {
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        unit_id: uuidStr.optional().nullable(),
        code: zod_1.z.string().trim().min(1).max(40),
        label: zod_1.z.string().trim().max(120).optional().nullable(),
    })
        .safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { data, error } = await supabase_1.supabaseAdmin.from('hub_hospital_beds').insert(parsed.data).select('*').single();
    if (error)
        return res.status(500).json({ error: error.message });
    return res.status(201).json({ bed: data });
};
exports.createHubHospitalBed = createHubHospitalBed;
const listHubHospitalizations = async (req, res) => {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic_id.success)
        return res.status(400).json({ error: 'clinic_id obrigatório' });
    let q = supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .select('*, hub_hospital_beds(code, label), hub_pets(name), hub_guardians(full_name)')
        .eq('clinic_id', clinic_id.data)
        .is('deleted_at', null)
        .order('admitted_at', { ascending: false });
    const status = req.query.status ? zod_1.z.string().safeParse(req.query.status) : null;
    if (status?.success)
        q = q.eq('status', status.data);
    const hosp_case_id = req.query.hub_case_id ? uuidStr.safeParse(req.query.hub_case_id) : null;
    if (hosp_case_id?.success)
        q = q.eq('hub_case_id', hosp_case_id.data);
    const { data, error } = await q;
    if (error)
        return res.status(500).json({ error: error.message });
    return res.json({ hospitalizations: data ?? [] });
};
exports.listHubHospitalizations = listHubHospitalizations;
const createHubHospitalization = async (req, res) => {
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        unit_id: uuidStr.optional().nullable(),
        pet_id: uuidStr,
        guardian_id: uuidStr.optional().nullable(),
        hub_encounter_id: uuidStr.optional().nullable(),
        hub_case_id: uuidStr.optional().nullable(),
        hub_hospital_bed_id: uuidStr.optional().nullable(),
        hub_staff_member_id: uuidStr.optional().nullable(),
        admission_notes: zod_1.z.string().trim().max(4000).optional().nullable(),
        reason: zod_1.z.string().trim().max(1000).optional().nullable(),
    })
        .safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .insert({ ...b, status: 'active' })
        .select('*')
        .single();
    if (error)
        return res.status(500).json({ error: error.message });
    if (b.hub_hospital_bed_id) {
        await supabase_1.supabaseAdmin.from('hub_hospital_beds').update({ status: 'occupied' }).eq('id', b.hub_hospital_bed_id);
    }
    void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
        clinic_id: b.clinic_id,
        pet_id: b.pet_id,
        hub_case_id: b.hub_case_id ?? null,
        hub_encounter_id: b.hub_encounter_id ?? null,
        event_type: 'hospitalization_started',
        ref_type: 'hospitalization',
        ref_id: data.id,
        title: 'Internação iniciada',
        body: b.reason ?? b.admission_notes ?? null,
        created_by: b.hub_staff_member_id ?? null,
    });
    return res.status(201).json({ hospitalization: data });
};
exports.createHubHospitalization = createHubHospitalization;
const patchHubHospitalization = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        status: zod_1.z.enum(['active', 'discharged', 'death', 'transferred', 'cancelled']).optional(),
        discharge_notes: zod_1.z.string().trim().max(4000).optional().nullable(),
        reason: zod_1.z.string().trim().max(1000).optional().nullable(),
        hub_case_id: uuidStr.optional().nullable(),
    })
        .safeParse(req.body);
    if (!id.success || !parsed.success)
        return res.status(400).json({ error: 'Dados inválidos' });
    const { clinic_id, ...patch } = parsed.data;
    const { data: existing, error: getErr } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .select('id, hub_hospital_bed_id, status')
        .eq('id', id.data)
        .eq('clinic_id', clinic_id)
        .maybeSingle();
    if (getErr)
        return res.status(500).json({ error: getErr.message });
    if (!existing)
        return res.status(404).json({ error: 'Internação não encontrada' });
    const update = { ...patch };
    if (patch.status === 'discharged') {
        update.discharged_at = new Date().toISOString();
    }
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalizations')
        .update(update)
        .eq('id', id.data)
        .eq('clinic_id', clinic_id)
        .select('*, hub_hospital_beds(code, label), hub_pets(name), hub_guardians(full_name)')
        .maybeSingle();
    if (error)
        return res.status(500).json({ error: error.message });
    const discharged = patch.status === 'discharged' || patch.status === 'death' || patch.status === 'transferred';
    if (discharged && existing.hub_hospital_bed_id) {
        await supabase_1.supabaseAdmin
            .from('hub_hospital_beds')
            .update({ status: 'available' })
            .eq('id', existing.hub_hospital_bed_id);
    }
    const hospData = data;
    if (patch.status === 'discharged' && hospData) {
        void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
            clinic_id,
            pet_id: hospData.pet_id,
            hub_case_id: hospData.hub_case_id,
            hub_encounter_id: hospData.hub_encounter_id,
            event_type: 'hospitalization_discharged',
            ref_type: 'hospitalization',
            ref_id: id.data,
            title: 'Alta da internação',
            body: patch.discharge_notes ?? null,
        });
    }
    return res.json({ hospitalization: data });
};
exports.patchHubHospitalization = patchHubHospitalization;
const addHubHospitalizationDailyNote = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = zod_1.z
        .object({
        note_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        evolution_notes: zod_1.z.string().trim().min(1).max(8000),
        hub_staff_member_id: uuidStr.optional().nullable(),
    })
        .safeParse(req.body);
    if (!id.success || !parsed.success)
        return res.status(400).json({ error: 'Dados inválidos' });
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_daily_notes')
        .upsert({ hospitalization_id: id.data, ...parsed.data }, { onConflict: 'hospitalization_id,note_date' })
        .select('*')
        .single();
    if (error)
        return res.status(500).json({ error: error.message });
    return res.json({ note: data });
};
exports.addHubHospitalizationDailyNote = addHubHospitalizationDailyNote;
// ── Hospitalization events ────────────────────────────────────────────────────
const hospitalizationEventKindSchema = zod_1.z.enum(['vital', 'medication', 'feeding', 'fluid', 'nursing', 'note']);
const listHubHospitalizationEvents = async (req, res) => {
    const hospitalization_id = uuidStr.safeParse(req.query.hospitalization_id);
    if (!hospitalization_id.success)
        return res.status(400).json({ error: 'hospitalization_id obrigatório' });
    let q = supabase_1.supabaseAdmin
        .from('hub_hospitalization_events')
        .select('id, hospitalization_id, kind, recorded_at, payload, hub_staff_member_id, created_at')
        .eq('hospitalization_id', hospitalization_id.data)
        .order('recorded_at', { ascending: false })
        .limit(500);
    if (req.query.kind) {
        const k = hospitalizationEventKindSchema.safeParse(req.query.kind);
        if (k.success)
            q = q.eq('kind', k.data);
    }
    const { data, error } = await q;
    if (error)
        return res.status(500).json({ error: error.message });
    return res.json({ events: data ?? [] });
};
exports.listHubHospitalizationEvents = listHubHospitalizationEvents;
const createHubHospitalizationEvent = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = zod_1.z
        .object({
        kind: hospitalizationEventKindSchema,
        recorded_at: zod_1.z.string().datetime({ offset: true }).optional(),
        payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().default({}),
        hub_staff_member_id: uuidStr.optional().nullable(),
    })
        .safeParse(req.body);
    if (!id.success || !parsed.success)
        return res.status(400).json({ error: 'Dados inválidos' });
    const b = parsed.data;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_hospitalization_events')
        .insert({
        hospitalization_id: id.data,
        kind: b.kind,
        recorded_at: b.recorded_at ?? new Date().toISOString(),
        payload: b.payload,
        hub_staff_member_id: b.hub_staff_member_id ?? null,
    })
        .select('*')
        .single();
    if (error)
        return res.status(500).json({ error: error.message });
    return res.status(201).json({ event: data });
};
exports.createHubHospitalizationEvent = createHubHospitalizationEvent;
// ── Surgeries ─────────────────────────────────────────────────────────────────
const listHubSurgeries = async (req, res) => {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic_id.success)
        return res.status(400).json({ error: 'clinic_id obrigatório' });
    let q = supabase_1.supabaseAdmin
        .from('hub_surgeries')
        .select('*, hub_pets(name), hub_guardians(full_name)')
        .eq('clinic_id', clinic_id.data)
        .is('deleted_at', null)
        .order('scheduled_at', { ascending: true });
    const status = req.query.status ? zod_1.z.string().safeParse(req.query.status) : null;
    if (status?.success)
        q = q.eq('status', status.data);
    const surg_case_id = req.query.hub_case_id ? uuidStr.safeParse(req.query.hub_case_id) : null;
    if (surg_case_id?.success)
        q = q.eq('hub_case_id', surg_case_id.data);
    const { data, error } = await q;
    if (error)
        return res.status(500).json({ error: error.message });
    return res.json({ surgeries: data ?? [] });
};
exports.listHubSurgeries = listHubSurgeries;
const jsonbField = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().nullable();
const createHubSurgery = async (req, res) => {
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        unit_id: uuidStr.optional().nullable(),
        pet_id: uuidStr,
        guardian_id: uuidStr.optional().nullable(),
        hub_encounter_id: uuidStr.optional().nullable(),
        hub_case_id: uuidStr.optional().nullable(),
        hub_staff_member_id: uuidStr.optional().nullable(),
        title: zod_1.z.string().trim().min(1).max(200),
        scheduled_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
        anesthetic_risk: zod_1.z.enum(['I', 'II', 'III', 'IV', 'V', 'VI', 'E']).optional().nullable(),
        pre_op: jsonbField,
        procedure: jsonbField,
        team: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())).optional().nullable(),
        materials: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())).optional().nullable(),
        post_op: jsonbField,
        // Legacy fields (backward compat)
        anesthesia_notes: zod_1.z.string().optional().nullable(),
        team_notes: zod_1.z.string().optional().nullable(),
        materials_notes: zod_1.z.string().optional().nullable(),
        post_op_notes: zod_1.z.string().optional().nullable(),
    })
        .safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_surgeries')
        .insert({
        clinic_id: b.clinic_id,
        unit_id: b.unit_id,
        pet_id: b.pet_id,
        guardian_id: b.guardian_id,
        hub_encounter_id: b.hub_encounter_id,
        hub_case_id: b.hub_case_id,
        hub_staff_member_id: b.hub_staff_member_id,
        title: b.title,
        scheduled_at: b.scheduled_at,
        anesthetic_risk: b.anesthetic_risk,
        pre_op: b.pre_op ?? {},
        procedure: b.procedure ?? {},
        team: b.team ?? [],
        materials: b.materials ?? [],
        post_op: b.post_op ?? {},
        anesthesia_notes: b.anesthesia_notes,
        team_notes: b.team_notes,
        materials_notes: b.materials_notes,
        post_op_notes: b.post_op_notes,
        status: 'scheduled',
    })
        .select('*')
        .single();
    if (error)
        return res.status(500).json({ error: error.message });
    void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
        clinic_id: b.clinic_id,
        pet_id: b.pet_id,
        hub_case_id: b.hub_case_id ?? null,
        hub_encounter_id: b.hub_encounter_id ?? null,
        event_type: 'surgery_performed',
        ref_type: 'surgery',
        ref_id: data.id,
        title: `Cirurgia agendada: ${b.title}`,
        created_by: b.hub_staff_member_id ?? null,
    });
    return res.status(201).json({ surgery: data });
};
exports.createHubSurgery = createHubSurgery;
const patchHubSurgery = async (req, res) => {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = zod_1.z
        .object({
        clinic_id: uuidStr,
        status: zod_1.z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
        started_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
        completed_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
        discharge_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
        anesthetic_risk: zod_1.z.enum(['I', 'II', 'III', 'IV', 'V', 'VI', 'E']).optional().nullable(),
        pre_op: jsonbField,
        procedure: jsonbField,
        team: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())).optional().nullable(),
        materials: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())).optional().nullable(),
        post_op: jsonbField,
        anesthesia_notes: zod_1.z.string().optional().nullable(),
        team_notes: zod_1.z.string().optional().nullable(),
        materials_notes: zod_1.z.string().optional().nullable(),
        post_op_notes: zod_1.z.string().optional().nullable(),
    })
        .safeParse(req.body);
    if (!id.success || !parsed.success)
        return res.status(400).json({ error: 'Dados inválidos' });
    const { clinic_id, ...patch } = parsed.data;
    const { data: existing } = await supabase_1.supabaseAdmin
        .from('hub_surgeries')
        .select('pet_id, hub_case_id, hub_encounter_id, hub_staff_member_id, title')
        .eq('id', id.data)
        .eq('clinic_id', clinic_id)
        .maybeSingle();
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_surgeries')
        .update(patch)
        .eq('id', id.data)
        .eq('clinic_id', clinic_id)
        .select('*')
        .maybeSingle();
    if (error)
        return res.status(500).json({ error: error.message });
    if (!data)
        return res.status(404).json({ error: 'Cirurgia não encontrada' });
    if (patch.status === 'completed' && existing) {
        const ex = existing;
        void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
            clinic_id,
            pet_id: ex.pet_id,
            hub_case_id: ex.hub_case_id,
            hub_encounter_id: ex.hub_encounter_id,
            event_type: 'surgery_performed',
            ref_type: 'surgery',
            ref_id: id.data,
            title: `Cirurgia realizada: ${ex.title}`,
            created_by: ex.hub_staff_member_id,
        });
    }
    return res.json({ surgery: data });
};
exports.patchHubSurgery = patchHubSurgery;
/** Alertas simples: vacinas com próxima dose nos próximos 30 dias. */
const getHubClinicalAlerts = async (req, res) => {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic_id.success)
        return res.status(400).json({ error: 'clinic_id obrigatório' });
    const today = new Date();
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    const todayStr = today.toISOString().slice(0, 10);
    const in30Str = in30.toISOString().slice(0, 10);
    const { data: vaccines, error } = await supabase_1.supabaseAdmin
        .from('hub_vaccination_records')
        .select('id, pet_id, vaccine_name, next_dose_at, hub_pets(name)')
        .eq('clinic_id', clinic_id.data)
        .is('deleted_at', null)
        .not('next_dose_at', 'is', null)
        .gte('next_dose_at', todayStr)
        .lte('next_dose_at', in30Str);
    if (error)
        return res.status(500).json({ error: error.message });
    return res.json({
        alerts: (vaccines ?? []).map((v) => ({
            type: 'vaccine_due',
            message: `Vacina ${v.vaccine_name} — próxima dose ${v.next_dose_at}`,
            pet_id: v.pet_id,
            pet: v.hub_pets,
        })),
    });
};
exports.getHubClinicalAlerts = getHubClinicalAlerts;
