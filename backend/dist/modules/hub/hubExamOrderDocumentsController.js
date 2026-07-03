"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHubExamOrderPdf = exports.revokeExamOrderDocument = exports.listExamOrderDocumentsByEncounter = exports.listExamOrderDocuments = exports.issueExamOrderDocumentHandler = void 0;
exports.buildPublicExamOrderPayload = buildPublicExamOrderPayload;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const examOrderDocumentIssue_1 = require("./examOrderDocumentIssue");
const clinicalDocumentValidation_1 = require("./clinicalDocumentValidation");
const hubExamOrderPdf_1 = require("./hubExamOrderPdf");
const hubClinicalTimelineController_1 = require("./hubClinicalTimelineController");
const uuidStr = zod_1.z.string().uuid();
const scopeSchema = zod_1.z.enum(['single', 'encounter_bundle']);
const issueSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    hub_encounter_id: uuidStr,
    scope: scopeSchema.default('encounter_bundle'),
    exam_id: uuidStr.optional().nullable(),
    issued_by: uuidStr.optional().nullable(),
})
    .strict();
const revokeSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    reason: zod_1.z.string().trim().min(10).max(500),
    revoked_by: uuidStr.optional().nullable(),
})
    .strict();
/** POST /clinical/exams/orders/issue */
const issueExamOrderDocumentHandler = async (req, res) => {
    const parsed = issueSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const actorUserId = req.user?.id ?? null;
    const issued = await (0, examOrderDocumentIssue_1.issueExamOrderDocument)({
        clinicId: parsed.data.clinic_id,
        hubEncounterId: parsed.data.hub_encounter_id,
        scope: parsed.data.scope,
        examId: parsed.data.exam_id ?? null,
        issuedBy: parsed.data.issued_by ?? null,
        actorUserId,
    });
    if (!issued.ok)
        return res.status(issued.status).json({ error: issued.error });
    return res.status(201).json({
        document: issued.result.document,
        snapshot: issued.result.snapshot,
        public_url: issued.result.public_url,
        content_hash_short: issued.result.content_hash_short,
    });
};
exports.issueExamOrderDocumentHandler = issueExamOrderDocumentHandler;
/** GET /clinical/exams/:id/order-documents */
const listExamOrderDocuments = async (req, res) => {
    const examId = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!examId.success || !clinic_id.success) {
        return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
    }
    const { data: exam } = await supabase_1.supabaseAdmin
        .from('hub_clinical_exams')
        .select('hub_encounter_id')
        .eq('id', examId.data)
        .eq('clinic_id', clinic_id.data)
        .is('deleted_at', null)
        .maybeSingle();
    if (!exam?.hub_encounter_id) {
        return res.json({ documents: [] });
    }
    const { data, error } = await supabase_1.supabaseAdmin
        .from(examOrderDocumentIssue_1.EXAM_DOC_TABLE)
        .select('id, hub_encounter_id, exam_id, scope, version_no, issued_by, issued_at, validation_code, document_status, content_hash, expires_at, revoked_at, validation_url, snapshot')
        .eq('clinic_id', clinic_id.data)
        .eq('hub_encounter_id', exam.hub_encounter_id)
        .or(`exam_id.eq.${examId.data},scope.eq.encounter_bundle`)
        .order('version_no', { ascending: false });
    if (error)
        return res.status(500).json({ error: error.message });
    const rows = (data ?? []);
    const enriched = rows.map((r) => {
        const contentHash = r.content_hash;
        return {
            ...r,
            document_status: (0, examOrderDocumentIssue_1.computeDocumentStatus)({
                revoked_at: r.revoked_at,
                expires_at: r.expires_at,
            }),
            content_hash_short: contentHash ? (0, examOrderDocumentIssue_1.truncateContentHash)(contentHash) : null,
        };
    });
    return res.json({ documents: enriched });
};
exports.listExamOrderDocuments = listExamOrderDocuments;
/** GET /clinical/exams/encounter/:encounterId/order-documents */
const listExamOrderDocumentsByEncounter = async (req, res) => {
    const encounterId = uuidStr.safeParse(req.params.encounterId);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!encounterId.success || !clinic_id.success) {
        return res.status(400).json({ error: 'encounterId e clinic_id obrigatórios' });
    }
    const { data, error } = await supabase_1.supabaseAdmin
        .from(examOrderDocumentIssue_1.EXAM_DOC_TABLE)
        .select('id, hub_encounter_id, exam_id, scope, version_no, issued_by, issued_at, validation_code, public_token, document_status, content_hash, expires_at, revoked_at, validation_url, snapshot')
        .eq('clinic_id', clinic_id.data)
        .eq('hub_encounter_id', encounterId.data)
        .order('issued_at', { ascending: false });
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
    const enriched = rows.map((r) => {
        const contentHash = r.content_hash;
        const publicToken = r.public_token;
        return {
            ...r,
            public_token: undefined,
            public_token_masked: publicToken ? (0, examOrderDocumentIssue_1.maskPublicToken)(publicToken) : null,
            document_status: (0, examOrderDocumentIssue_1.computeDocumentStatus)({
                revoked_at: r.revoked_at,
                expires_at: r.expires_at,
            }),
            content_hash_short: contentHash ? (0, examOrderDocumentIssue_1.truncateContentHash)(contentHash) : null,
            issued_by_member: staffMap.get(r.issued_by) ?? null,
        };
    });
    return res.json({ documents: enriched });
};
exports.listExamOrderDocumentsByEncounter = listExamOrderDocumentsByEncounter;
/** POST /clinical/exams/order-documents/:docId/revoke */
const revokeExamOrderDocument = async (req, res) => {
    const docId = uuidStr.safeParse(req.params.docId);
    const parsed = revokeSchema.safeParse(req.body);
    if (!docId.success || !parsed.success) {
        return res.status(400).json({ error: 'Parâmetros inválidos' });
    }
    const { clinic_id, reason, revoked_by } = parsed.data;
    const { data: doc, error: docErr } = await supabase_1.supabaseAdmin
        .from(examOrderDocumentIssue_1.EXAM_DOC_TABLE)
        .select('id, clinic_id, hub_encounter_id, version_no, validation_code, revoked_at, expires_at')
        .eq('id', docId.data)
        .eq('clinic_id', clinic_id)
        .maybeSingle();
    if (docErr)
        return res.status(500).json({ error: docErr.message });
    if (!doc)
        return res.status(404).json({ error: 'Documento não encontrado' });
    if (doc.revoked_at)
        return res.status(409).json({ error: 'Documento já revogado' });
    const now = new Date().toISOString();
    const actorUserId = req.user?.id ?? null;
    const { error: upErr } = await supabase_1.supabaseAdmin
        .from(examOrderDocumentIssue_1.EXAM_DOC_TABLE)
        .update({
        revoked_at: now,
        revoked_by: revoked_by ?? null,
        revoke_reason: reason,
        document_status: 'revoked',
    })
        .eq('id', docId.data);
    if (upErr)
        return res.status(500).json({ error: upErr.message });
    await (0, clinicalDocumentValidation_1.recordClinicalDocumentEvent)({
        table: examOrderDocumentIssue_1.EXAM_EVENT_TABLE,
        clinic_id,
        document_id: docId.data,
        event_type: 'revoked',
        actor_user_id: actorUserId,
        metadata: { reason },
    });
    const { data: enc } = await supabase_1.supabaseAdmin
        .from('hub_encounters')
        .select('pet_id, hub_case_id')
        .eq('id', doc.hub_encounter_id)
        .maybeSingle();
    if (enc) {
        void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
            clinic_id,
            pet_id: enc.pet_id,
            hub_case_id: enc.hub_case_id ?? null,
            hub_encounter_id: doc.hub_encounter_id,
            event_type: 'exam_order_revoked',
            ref_type: 'exam_order_document',
            ref_id: docId.data,
            title: `Solicitação de exames revogada (v${doc.version_no})`,
            body: reason,
            created_by: revoked_by ?? null,
        });
    }
    return res.json({ ok: true });
};
exports.revokeExamOrderDocument = revokeExamOrderDocument;
/** GET /clinical/exams/:id/pdf?document_id= */
const getHubExamOrderPdf = async (req, res) => {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    const document_id = uuidStr.safeParse(req.query.document_id);
    if (!clinic_id.success || !document_id.success) {
        return res.status(400).json({ error: 'clinic_id e document_id obrigatórios' });
    }
    const loaded = await (0, examOrderDocumentIssue_1.loadExamOrderDocumentForPdf)(clinic_id.data, document_id.data);
    if (!loaded.ok)
        return res.status(loaded.status).json({ error: loaded.error });
    const actorUserId = req.user?.id ?? null;
    await (0, clinicalDocumentValidation_1.recordClinicalDocumentEvent)({
        table: examOrderDocumentIssue_1.EXAM_EVENT_TABLE,
        clinic_id: clinic_id.data,
        document_id: document_id.data,
        event_type: 'pdf_downloaded',
        actor_user_id: actorUserId,
    });
    await (0, hubExamOrderPdf_1.streamValidatableExamOrderPdf)(res, loaded.snapshot, loaded.validation);
};
exports.getHubExamOrderPdf = getHubExamOrderPdf;
function buildPublicExamOrderPayload(doc) {
    const snapshot = doc.snapshot;
    if (!snapshot?.exams?.length)
        return null;
    const contentHash = String(doc.content_hash ?? '');
    const status = (0, examOrderDocumentIssue_1.computeDocumentStatus)({
        revoked_at: doc.revoked_at,
        expires_at: doc.expires_at,
    });
    return {
        status,
        validation_code: String(doc.validation_code ?? ''),
        issued_at: String(doc.issued_at ?? snapshot.issued_at),
        expires_at: doc.expires_at ?? null,
        revoked_at: doc.revoked_at ?? null,
        revoke_reason: doc.revoke_reason ?? null,
        content_hash_short: contentHash ? (0, examOrderDocumentIssue_1.truncateContentHash)(contentHash) : '—',
        document_version: Number(doc.version_no ?? snapshot.document_version ?? 1),
        scope: snapshot.scope,
        clinic: { name: snapshot.clinic.name },
        pet: snapshot.pet,
        guardian: snapshot.guardian,
        veterinarian: snapshot.veterinarian,
        exams: snapshot.exams,
        disclaimers: snapshot.disclaimers ?? [],
    };
}
