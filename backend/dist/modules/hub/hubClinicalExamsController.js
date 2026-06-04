"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteHubClinicalExam = exports.patchHubClinicalExam = exports.createHubClinicalExam = exports.getHubClinicalExam = exports.listHubClinicalExams = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const hubClinicalTimelineController_1 = require("./hubClinicalTimelineController");
const uuidStr = zod_1.z.string().uuid();
const examStatusSchema = zod_1.z.enum(['requested', 'collected', 'sent', 'result_received', 'completed', 'cancelled']);
const labKindSchema = zod_1.z.enum(['internal', 'external']);
const createExamSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    pet_id: uuidStr,
    hub_case_id: uuidStr.optional().nullable(),
    hub_encounter_id: uuidStr.optional().nullable(),
    exam_type: zod_1.z.string().trim().min(1).max(300),
    lab_kind: labKindSchema.optional().default('internal'),
    lab_name: zod_1.z.string().trim().max(300).optional().nullable(),
    external_lab_name: zod_1.z.string().trim().max(300).optional().nullable(),
    external_order_code: zod_1.z.string().trim().max(200).optional().nullable(),
    external_result_url: zod_1.z.string().url().optional().nullable(),
    requested_by: uuidStr.optional().nullable(),
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional().default({}),
})
    .strict();
const patchExamSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    exam_type: zod_1.z.string().trim().min(1).max(300).optional(),
    lab_kind: labKindSchema.optional(),
    lab_name: zod_1.z.string().trim().max(300).optional().nullable(),
    external_lab_name: zod_1.z.string().trim().max(300).optional().nullable(),
    external_order_code: zod_1.z.string().trim().max(200).optional().nullable(),
    external_result_url: zod_1.z.string().url().optional().nullable(),
    status: examStatusSchema.optional(),
    collected_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    result_at: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    result_text: zod_1.z.string().trim().max(8000).optional().nullable(),
    notes: zod_1.z.string().trim().max(4000).optional().nullable(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    requested_by: uuidStr.optional().nullable(),
})
    .strict();
const EXAM_SELECT = `
  id, clinic_id, pet_id, hub_case_id, hub_encounter_id,
  exam_type, lab_kind, lab_name,
  external_lab_name, external_order_code, external_result_url,
  status, requested_at, collected_at, result_at, result_text,
  requested_by, notes, metadata, created_at, updated_at
`;
async function enrichExam(row) {
    const requestedById = row.requested_by;
    if (!requestedById)
        return { ...row, requested_by_member: null };
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_staff_members')
        .select('id, full_name')
        .eq('id', requestedById)
        .maybeSingle();
    return { ...row, requested_by_member: data };
}
/** GET /clinical/exams?clinic_id&pet_id?&hub_case_id?&hub_encounter_id?&status? */
const listHubClinicalExams = async (req, res) => {
    try {
        const clinic_id = uuidStr.safeParse(req.query.clinic_id);
        if (!clinic_id.success)
            return res.status(400).json({ error: 'clinic_id obrigatório' });
        let q = supabase_1.supabaseAdmin
            .from('hub_clinical_exams')
            .select(EXAM_SELECT)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null)
            .order('requested_at', { ascending: false })
            .limit(200);
        if (req.query.pet_id) {
            const v = uuidStr.safeParse(req.query.pet_id);
            if (v.success)
                q = q.eq('pet_id', v.data);
        }
        if (req.query.hub_case_id) {
            const v = uuidStr.safeParse(req.query.hub_case_id);
            if (v.success)
                q = q.eq('hub_case_id', v.data);
        }
        if (req.query.hub_encounter_id) {
            const v = uuidStr.safeParse(req.query.hub_encounter_id);
            if (v.success)
                q = q.eq('hub_encounter_id', v.data);
        }
        if (req.query.status) {
            const v = examStatusSchema.safeParse(req.query.status);
            if (v.success)
                q = q.eq('status', v.data);
        }
        const { data, error } = await q;
        if (error)
            return res.status(500).json({ error: error.message });
        return res.json({ exams: data ?? [] });
    }
    catch (e) {
        console.error('listHubClinicalExams', e);
        return res.status(500).json({ error: e?.message || 'Erro ao listar exames' });
    }
};
exports.listHubClinicalExams = listHubClinicalExams;
/** GET /clinical/exams/:id */
const getHubClinicalExam = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const clinic_id = uuidStr.safeParse(req.query.clinic_id);
        if (!id.success || !clinic_id.success) {
            return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_clinical_exams')
            .select(EXAM_SELECT)
            .eq('id', id.data)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(404).json({ error: 'Exame não encontrado' });
        const enriched = await enrichExam(data);
        return res.json({ exam: enriched });
    }
    catch (e) {
        console.error('getHubClinicalExam', e);
        return res.status(500).json({ error: e?.message || 'Erro ao carregar exame' });
    }
};
exports.getHubClinicalExam = getHubClinicalExam;
/** POST /clinical/exams */
const createHubClinicalExam = async (req, res) => {
    try {
        const parsed = createExamSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_clinical_exams')
            .insert({
            clinic_id: b.clinic_id,
            pet_id: b.pet_id,
            hub_case_id: b.hub_case_id ?? null,
            hub_encounter_id: b.hub_encounter_id ?? null,
            exam_type: b.exam_type,
            lab_kind: b.lab_kind,
            lab_name: b.lab_name ?? null,
            external_lab_name: b.external_lab_name ?? null,
            external_order_code: b.external_order_code ?? null,
            external_result_url: b.external_result_url ?? null,
            requested_by: b.requested_by ?? null,
            notes: b.notes ?? null,
            metadata: b.metadata,
            status: 'requested',
        })
            .select(EXAM_SELECT)
            .single();
        if (error)
            return res.status(500).json({ error: error.message });
        const exam = data;
        void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
            clinic_id: b.clinic_id,
            pet_id: b.pet_id,
            hub_case_id: b.hub_case_id ?? null,
            hub_encounter_id: b.hub_encounter_id ?? null,
            event_type: 'exam_requested',
            ref_type: 'exam',
            ref_id: exam.id,
            title: `Exame solicitado: ${b.exam_type}`,
            body: b.lab_kind === 'external' ? `Laboratório: ${b.external_lab_name ?? b.lab_name ?? '—'}` : null,
            created_by: b.requested_by ?? null,
        });
        return res.status(201).json({ exam });
    }
    catch (e) {
        console.error('createHubClinicalExam', e);
        return res.status(500).json({ error: e?.message || 'Erro ao criar exame' });
    }
};
exports.createHubClinicalExam = createHubClinicalExam;
/** PATCH /clinical/exams/:id — transições de status e atualização de dados. */
const patchHubClinicalExam = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        if (!id.success)
            return res.status(400).json({ error: 'id inválido' });
        const parsed = patchExamSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const b = parsed.data;
        const { data: current } = await supabase_1.supabaseAdmin
            .from('hub_clinical_exams')
            .select('status, pet_id, hub_case_id, hub_encounter_id, exam_type, clinic_id')
            .eq('id', id.data)
            .eq('clinic_id', b.clinic_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (!current)
            return res.status(404).json({ error: 'Exame não encontrado' });
        const c = current;
        const patch = {};
        if (b.exam_type !== undefined)
            patch.exam_type = b.exam_type;
        if (b.lab_kind !== undefined)
            patch.lab_kind = b.lab_kind;
        if (b.lab_name !== undefined)
            patch.lab_name = b.lab_name;
        if (b.external_lab_name !== undefined)
            patch.external_lab_name = b.external_lab_name;
        if (b.external_order_code !== undefined)
            patch.external_order_code = b.external_order_code;
        if (b.external_result_url !== undefined)
            patch.external_result_url = b.external_result_url;
        if (b.status !== undefined)
            patch.status = b.status;
        if (b.collected_at !== undefined)
            patch.collected_at = b.collected_at;
        if (b.result_at !== undefined)
            patch.result_at = b.result_at;
        if (b.result_text !== undefined)
            patch.result_text = b.result_text;
        if (b.notes !== undefined)
            patch.notes = b.notes;
        if (b.metadata !== undefined)
            patch.metadata = b.metadata;
        if (b.requested_by !== undefined)
            patch.requested_by = b.requested_by;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_clinical_exams')
            .update(patch)
            .eq('id', id.data)
            .eq('clinic_id', b.clinic_id)
            .is('deleted_at', null)
            .select(EXAM_SELECT)
            .maybeSingle();
        if (error)
            return res.status(500).json({ error: error.message });
        if (!data)
            return res.status(404).json({ error: 'Exame não encontrado' });
        // Grava marco na timeline quando o resultado chega
        if (b.status === 'result_received' || b.status === 'completed') {
            const prevStatus = c.status;
            if (prevStatus !== b.status) {
                void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
                    clinic_id: b.clinic_id,
                    pet_id: c.pet_id,
                    hub_case_id: c.hub_case_id,
                    hub_encounter_id: c.hub_encounter_id,
                    event_type: 'exam_result_received',
                    ref_type: 'exam',
                    ref_id: id.data,
                    title: `Resultado recebido: ${c.exam_type}`,
                    body: b.result_text ?? null,
                });
            }
        }
        const enriched = await enrichExam(data);
        return res.json({ exam: enriched });
    }
    catch (e) {
        console.error('patchHubClinicalExam', e);
        return res.status(500).json({ error: e?.message || 'Erro ao atualizar exame' });
    }
};
exports.patchHubClinicalExam = patchHubClinicalExam;
/** DELETE /clinical/exams/:id — soft-delete. */
const deleteHubClinicalExam = async (req, res) => {
    try {
        const id = uuidStr.safeParse(req.params.id);
        const clinic_id = uuidStr.safeParse(req.query.clinic_id);
        if (!id.success || !clinic_id.success) {
            return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
        }
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_clinical_exams')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id.data)
            .eq('clinic_id', clinic_id.data)
            .is('deleted_at', null);
        if (error)
            return res.status(500).json({ error: error.message });
        return res.status(204).send();
    }
    catch (e) {
        console.error('deleteHubClinicalExam', e);
        return res.status(500).json({ error: e?.message || 'Erro ao remover exame' });
    }
};
exports.deleteHubClinicalExam = deleteHubClinicalExam;
