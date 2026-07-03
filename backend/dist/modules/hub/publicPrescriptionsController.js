"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicPrescriptionPdf = exports.getPublicPrescriptionByToken = exports.validatePublicPrescriptionByCode = void 0;
const supabase_1 = require("../../config/supabase");
const hubPrescriptionPdf_1 = require("./hubPrescriptionPdf");
const prescriptionValidation_1 = require("./prescriptionValidation");
const publicPrescriptionResponse_1 = require("./publicPrescriptionResponse");
const publicPrescriptionViewAudit_1 = require("./publicPrescriptionViewAudit");
const PUBLIC_NOT_FOUND = 'Receita não encontrada';
const DOCUMENT_PUBLIC_SELECT = 'id, clinic_id, prescription_id, version_no, validation_code, public_token, document_status, content_hash, snapshot, issued_at, expires_at, revoked_at, revoke_reason, validation_url';
function applyPublicPrescriptionHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
}
async function loadPublicDocumentByToken(token) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_prescription_documents')
        .select(DOCUMENT_PUBLIC_SELECT)
        .eq('public_token', token)
        .maybeSingle();
    if (error) {
        console.error('[public_prescriptions] load by token', error);
        throw new Error('LOAD_ERROR');
    }
    return data ?? null;
}
async function loadPublicDocumentByCode(code) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_prescription_documents')
        .select(DOCUMENT_PUBLIC_SELECT)
        .eq('validation_code', code)
        .maybeSingle();
    if (error) {
        console.error('[public_prescriptions] load by code', error);
        throw new Error('LOAD_ERROR');
    }
    return data ?? null;
}
function respondPublicPayload(req, res, doc) {
    const payload = (0, publicPrescriptionResponse_1.buildPublicPrescriptionPayload)(doc);
    if (!payload)
        return res.status(404).json({ error: PUBLIC_NOT_FOUND });
    applyPublicPrescriptionHeaders(res);
    void (0, publicPrescriptionViewAudit_1.maybeRecordPrescriptionViewed)(req, String(doc.clinic_id), String(doc.id));
    return res.json({ prescription: payload });
}
const validatePublicPrescriptionByCode = async (req, res) => {
    try {
        const rawCode = typeof req.query.code === 'string' ? req.query.code : '';
        const code = (0, publicPrescriptionResponse_1.normalizeValidationCode)(rawCode);
        if (!code)
            return res.status(400).json({ error: 'Código de validação inválido' });
        const doc = await loadPublicDocumentByCode(code);
        if (!doc)
            return res.status(404).json({ error: PUBLIC_NOT_FOUND });
        return respondPublicPayload(req, res, doc);
    }
    catch (e) {
        if (e?.message === 'LOAD_ERROR') {
            return res.status(500).json({ error: 'Erro ao validar receita' });
        }
        console.error('[public_prescriptions] validate', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.validatePublicPrescriptionByCode = validatePublicPrescriptionByCode;
const getPublicPrescriptionByToken = async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!(0, publicPrescriptionResponse_1.isPlausiblePublicToken)(token)) {
            return res.status(400).json({ error: 'Token inválido' });
        }
        const doc = await loadPublicDocumentByToken(token);
        if (!doc)
            return res.status(404).json({ error: PUBLIC_NOT_FOUND });
        return respondPublicPayload(req, res, doc);
    }
    catch (e) {
        if (e?.message === 'LOAD_ERROR') {
            return res.status(500).json({ error: 'Erro ao carregar receita' });
        }
        console.error('[public_prescriptions] get', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getPublicPrescriptionByToken = getPublicPrescriptionByToken;
const getPublicPrescriptionPdf = async (req, res) => {
    try {
        const token = String(req.params.token || '').trim();
        if (!(0, publicPrescriptionResponse_1.isPlausiblePublicToken)(token)) {
            return res.status(400).json({ error: 'Token inválido' });
        }
        const doc = await loadPublicDocumentByToken(token);
        if (!doc)
            return res.status(404).json({ error: PUBLIC_NOT_FOUND });
        const payload = (0, publicPrescriptionResponse_1.buildPublicPrescriptionPayload)(doc);
        if (!payload)
            return res.status(404).json({ error: PUBLIC_NOT_FOUND });
        const publicUrl = doc.validation_url ??
            (0, prescriptionValidation_1.resolvePrescriptionPublicUrl)(String(doc.public_token));
        applyPublicPrescriptionHeaders(res);
        void (0, publicPrescriptionViewAudit_1.recordPrescriptionPdfDownloaded)(req, String(doc.clinic_id), String(doc.id));
        const pdfView = (0, prescriptionValidation_1.snapshotToPdfView)(doc.snapshot);
        await (0, hubPrescriptionPdf_1.streamValidatablePrescriptionPdf)(res, pdfView, {
            validation_code: payload.validation_code,
            public_url: publicUrl,
            content_hash: String(doc.content_hash ?? ''),
            issued_at: payload.issued_at,
            expires_at: payload.expires_at,
            disclaimers: payload.disclaimers,
        });
    }
    catch (e) {
        console.error('[public_prescriptions] pdf', e);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Erro ao gerar PDF' });
        }
    }
};
exports.getPublicPrescriptionPdf = getPublicPrescriptionPdf;
