"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateContentHash = exports.maskPublicToken = exports.computeDocumentStatus = exports.EXAM_EVENT_TABLE = exports.EXAM_DOC_TABLE = void 0;
exports.issueExamOrderDocument = issueExamOrderDocument;
exports.loadExamOrderDocumentForPdf = loadExamOrderDocumentForPdf;
const supabase_1 = require("../../config/supabase");
const clinicalDocumentValidation_1 = require("./clinicalDocumentValidation");
Object.defineProperty(exports, "computeDocumentStatus", { enumerable: true, get: function () { return clinicalDocumentValidation_1.computeDocumentStatus; } });
Object.defineProperty(exports, "maskPublicToken", { enumerable: true, get: function () { return clinicalDocumentValidation_1.maskPublicToken; } });
Object.defineProperty(exports, "truncateContentHash", { enumerable: true, get: function () { return clinicalDocumentValidation_1.truncateContentHash; } });
const examOrderValidation_1 = require("./examOrderValidation");
const hubClinicalTimelineController_1 = require("./hubClinicalTimelineController");
const EXAM_DOC_TABLE = 'hub_clinical_exam_order_documents';
exports.EXAM_DOC_TABLE = EXAM_DOC_TABLE;
const EXAM_EVENT_TABLE = 'hub_clinical_exam_order_document_events';
exports.EXAM_EVENT_TABLE = EXAM_EVENT_TABLE;
const EXAM_SELECT = `
  id, clinic_id, pet_id, hub_encounter_id, exam_type, lab_kind, lab_name,
  external_lab_name, clinical_indication, fasting_required, collection_instructions,
  urgency, notes, document_status, status
`;
async function fetchActiveExamsForEncounter(clinicId, encounterId, examId) {
    let q = supabase_1.supabaseAdmin
        .from('hub_clinical_exams')
        .select(EXAM_SELECT)
        .eq('clinic_id', clinicId)
        .eq('hub_encounter_id', encounterId)
        .is('deleted_at', null)
        .neq('document_status', 'cancelled')
        .neq('status', 'cancelled');
    if (examId)
        q = q.eq('id', examId);
    const { data, error } = await q.order('requested_at', { ascending: true });
    if (error)
        throw new Error(error.message);
    return (data ?? []);
}
async function nextVersionNo(encounterId, scope, examId) {
    let q = supabase_1.supabaseAdmin
        .from(EXAM_DOC_TABLE)
        .select('version_no')
        .eq('hub_encounter_id', encounterId)
        .eq('scope', scope)
        .order('version_no', { ascending: false })
        .limit(1);
    if (scope === 'single' && examId)
        q = q.eq('exam_id', examId);
    const { data } = await q.maybeSingle();
    return data ? data.version_no + 1 : 1;
}
async function issueExamOrderDocument(opts) {
    const partiesLoaded = await (0, clinicalDocumentValidation_1.loadEncounterIssueParties)(opts.clinicId, opts.hubEncounterId);
    if (!partiesLoaded.ok)
        return partiesLoaded;
    const { parties } = partiesLoaded;
    if (opts.scope === 'single' && !opts.examId) {
        return { ok: false, status: 400, error: 'exam_id obrigatório para emissão individual' };
    }
    let exams;
    try {
        exams = await fetchActiveExamsForEncounter(opts.clinicId, opts.hubEncounterId, opts.scope === 'single' ? opts.examId : null);
    }
    catch (e) {
        return { ok: false, status: 500, error: e.message };
    }
    if (!exams.length) {
        return { ok: false, status: 409, error: 'Nenhum exame ativo encontrado para emissão' };
    }
    const issuedAt = new Date().toISOString();
    const defaults = await (0, clinicalDocumentValidation_1.fetchClinicJsonDefaults)(opts.clinicId, 'exam_order_defaults');
    const validityDays = (0, examOrderValidation_1.resolveExamOrderValidityDays)(defaults);
    const customDisclaimer = typeof defaults.disclaimer_text === 'string' ? defaults.disclaimer_text : null;
    const nextVersion = await nextVersionNo(opts.hubEncounterId, opts.scope, opts.examId);
    const snapshot = (0, examOrderValidation_1.buildExamOrderSnapshot)({
        encounterId: opts.hubEncounterId,
        documentVersion: nextVersion,
        scope: opts.scope,
        issuedAt,
        parties,
        exams: exams.map(examOrderValidation_1.mapExamRowToSnapshotItem),
        customDisclaimer,
    });
    const contentHash = (0, examOrderValidation_1.computeExamOrderContentHash)(snapshot);
    let validationCode;
    let publicToken;
    try {
        validationCode = await (0, clinicalDocumentValidation_1.generateUniqueCode)('EX', EXAM_DOC_TABLE);
        publicToken = await (0, clinicalDocumentValidation_1.generateUniquePublicToken)(EXAM_DOC_TABLE);
    }
    catch (e) {
        return { ok: false, status: 500, error: e.message };
    }
    const publicUrl = (0, examOrderValidation_1.resolveExamOrderPublicUrl)(publicToken);
    const expiresAt = (0, clinicalDocumentValidation_1.addDaysIso)(issuedAt, validityDays);
    const { data: doc, error: docErr } = await supabase_1.supabaseAdmin
        .from(EXAM_DOC_TABLE)
        .insert({
        clinic_id: opts.clinicId,
        hub_encounter_id: opts.hubEncounterId,
        exam_id: opts.scope === 'single' ? opts.examId : null,
        scope: opts.scope,
        version_no: nextVersion,
        issued_by: opts.issuedBy ?? parties.veterinarian.id,
        issued_at: issuedAt,
        validation_code: validationCode,
        public_token: publicToken,
        validation_url: publicUrl,
        document_status: 'valid',
        content_hash: contentHash,
        snapshot,
        expires_at: expiresAt,
    })
        .select('*')
        .single();
    if (docErr || !doc) {
        const msg = docErr?.message || 'Erro ao emitir documento';
        if (/column|relation|schema|does not exist/i.test(msg)) {
            return {
                ok: false,
                status: 500,
                error: 'Banco desatualizado: execute as migrations 63–64 de solicitação de exames.',
            };
        }
        return { ok: false, status: 500, error: msg };
    }
    const docId = doc.id;
    const examIds = exams.map((e) => e.id);
    await supabase_1.supabaseAdmin
        .from('hub_clinical_exams')
        .update({ document_status: 'issued', guardian_id: parties.guardian.id })
        .in('id', examIds)
        .eq('clinic_id', opts.clinicId);
    await (0, clinicalDocumentValidation_1.recordClinicalDocumentEvent)({
        table: EXAM_EVENT_TABLE,
        clinic_id: opts.clinicId,
        document_id: docId,
        event_type: 'created',
        actor_user_id: opts.actorUserId ?? null,
        metadata: { validation_code: validationCode, version_no: nextVersion, scope: opts.scope },
    });
    void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
        clinic_id: opts.clinicId,
        pet_id: parties.pet_id,
        hub_case_id: parties.hub_case_id,
        hub_encounter_id: opts.hubEncounterId,
        event_type: 'exam_order_issued',
        ref_type: 'exam_order_document',
        ref_id: docId,
        title: `Solicitação de exames emitida (v${nextVersion})`,
        body: `${validationCode} · ${exams.length} exame(s)`,
        created_by: opts.issuedBy ?? parties.veterinarian.id,
    });
    const enriched = {
        ...doc,
        document_status: (0, clinicalDocumentValidation_1.computeDocumentStatus)({ revoked_at: null, expires_at: expiresAt }),
        public_url: publicUrl,
        content_hash_short: (0, clinicalDocumentValidation_1.truncateContentHash)(contentHash),
        public_token_masked: (0, clinicalDocumentValidation_1.maskPublicToken)(publicToken),
    };
    return {
        ok: true,
        result: {
            document: enriched,
            snapshot,
            public_url: publicUrl,
            content_hash_short: (0, clinicalDocumentValidation_1.truncateContentHash)(contentHash),
        },
    };
}
async function loadExamOrderDocumentForPdf(clinicId, documentId) {
    const { data: doc, error } = await supabase_1.supabaseAdmin
        .from(EXAM_DOC_TABLE)
        .select('*')
        .eq('id', documentId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error)
        return { ok: false, status: 500, error: error.message };
    if (!doc)
        return { ok: false, status: 404, error: 'Documento não encontrado' };
    const row = doc;
    const snapshot = row.snapshot;
    if (!snapshot?.exams?.length) {
        return { ok: false, status: 409, error: 'Documento sem snapshot de emissão' };
    }
    const validationCode = String(row.validation_code ?? '');
    const publicUrl = row.validation_url ??
        (row.public_token ? (0, examOrderValidation_1.resolveExamOrderPublicUrl)(String(row.public_token)) : '');
    return {
        ok: true,
        snapshot,
        validation: {
            validation_code: validationCode,
            public_url: publicUrl,
            content_hash: String(row.content_hash ?? ''),
            issued_at: String(row.issued_at ?? snapshot.issued_at),
            expires_at: row.expires_at ?? null,
            disclaimers: snapshot.disclaimers ?? [],
        },
    };
}
