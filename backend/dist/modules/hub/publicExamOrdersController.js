"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicExamOrderPdf = exports.getPublicExamOrderByToken = exports.validatePublicExamOrderByCode = void 0;
const supabase_1 = require("../../config/supabase");
const clinicalDocumentValidation_1 = require("./clinicalDocumentValidation");
const hubExamOrderDocumentsController_1 = require("./hubExamOrderDocumentsController");
const hubExamOrderPdf_1 = require("./hubExamOrderPdf");
const examOrderDocumentIssue_1 = require("./examOrderDocumentIssue");
const examOrderValidation_1 = require("./examOrderValidation");
const publicPrescriptionResponse_1 = require("./publicPrescriptionResponse");
const PUBLIC_NOT_FOUND = 'Solicitação de exames não encontrada';
const DOCUMENT_PUBLIC_SELECT = 'id, clinic_id, hub_encounter_id, version_no, validation_code, public_token, document_status, content_hash, snapshot, issued_at, expires_at, revoked_at, revoke_reason, validation_url';
function applyPublicHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
}
const viewDebounce = new Map();
const VIEW_DEBOUNCE_MS = 60 * 60 * 1000;
async function maybeRecordViewed(req, clinicId, documentId) {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = `${documentId}:${ip}`;
    const now = Date.now();
    const last = viewDebounce.get(key);
    if (last != null && now - last < VIEW_DEBOUNCE_MS)
        return;
    viewDebounce.set(key, now);
    await (0, clinicalDocumentValidation_1.recordClinicalDocumentEvent)({
        table: examOrderDocumentIssue_1.EXAM_EVENT_TABLE,
        clinic_id: clinicId,
        document_id: documentId,
        event_type: 'viewed',
        actor_ip: ip,
        actor_user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : null,
    });
}
async function loadByToken(token) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_clinical_exam_order_documents')
        .select(DOCUMENT_PUBLIC_SELECT)
        .eq('public_token', token)
        .maybeSingle();
    if (error)
        throw new Error('LOAD_ERROR');
    return data ?? null;
}
async function loadByCode(code) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_clinical_exam_order_documents')
        .select(DOCUMENT_PUBLIC_SELECT)
        .eq('validation_code', code)
        .maybeSingle();
    if (error)
        throw new Error('LOAD_ERROR');
    return data ?? null;
}
function respondPayload(req, res, doc) {
    const payload = (0, hubExamOrderDocumentsController_1.buildPublicExamOrderPayload)(doc);
    if (!payload)
        return res.status(404).json({ error: PUBLIC_NOT_FOUND });
    applyPublicHeaders(res);
    void maybeRecordViewed(req, String(doc.clinic_id), String(doc.id));
    return res.json({ exam_order: payload });
}
const validatePublicExamOrderByCode = async (req, res) => {
    try {
        const rawCode = typeof req.query.code === 'string' ? req.query.code : '';
        const code = (0, examOrderValidation_1.normalizeExamOrderValidationCode)(rawCode);
        if (!code)
            return res.status(400).json({ error: 'Código de validação inválido' });
        const doc = await loadByCode(code);
        if (!doc)
            return res.status(404).json({ error: PUBLIC_NOT_FOUND });
        return respondPayload(req, res, doc);
    }
    catch (e) {
        console.error('[public_exam_orders] validate', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.validatePublicExamOrderByCode = validatePublicExamOrderByCode;
const getPublicExamOrderByToken = async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!(0, publicPrescriptionResponse_1.isPlausiblePublicToken)(token))
            return res.status(400).json({ error: 'Token inválido' });
        const doc = await loadByToken(token);
        if (!doc)
            return res.status(404).json({ error: PUBLIC_NOT_FOUND });
        return respondPayload(req, res, doc);
    }
    catch (e) {
        console.error('[public_exam_orders] get', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getPublicExamOrderByToken = getPublicExamOrderByToken;
const getPublicExamOrderPdf = async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!(0, publicPrescriptionResponse_1.isPlausiblePublicToken)(token))
            return res.status(400).json({ error: 'Token inválido' });
        const doc = await loadByToken(token);
        if (!doc)
            return res.status(404).json({ error: PUBLIC_NOT_FOUND });
        const payload = (0, hubExamOrderDocumentsController_1.buildPublicExamOrderPayload)(doc);
        if (!payload)
            return res.status(404).json({ error: PUBLIC_NOT_FOUND });
        const snapshot = doc.snapshot;
        const publicUrl = doc.validation_url ?? (0, examOrderValidation_1.resolveExamOrderPublicUrl)(String(doc.public_token));
        applyPublicHeaders(res);
        await (0, clinicalDocumentValidation_1.recordClinicalDocumentEvent)({
            table: examOrderDocumentIssue_1.EXAM_EVENT_TABLE,
            clinic_id: String(doc.clinic_id),
            document_id: String(doc.id),
            event_type: 'pdf_downloaded',
            actor_ip: req.ip ?? null,
            actor_user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : null,
        });
        await (0, hubExamOrderPdf_1.streamValidatableExamOrderPdf)(res, snapshot, {
            validation_code: payload.validation_code,
            public_url: publicUrl,
            content_hash: String(doc.content_hash ?? ''),
            issued_at: payload.issued_at,
            expires_at: payload.expires_at,
            disclaimers: payload.disclaimers,
        });
    }
    catch (e) {
        console.error('[public_exam_orders] pdf', e);
        if (!res.headersSent)
            return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getPublicExamOrderPdf = getPublicExamOrderPdf;
