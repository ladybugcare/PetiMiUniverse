"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeValidationCode = normalizeValidationCode;
exports.isPlausiblePublicToken = isPlausiblePublicToken;
exports.buildPublicPrescriptionPayload = buildPublicPrescriptionPayload;
const prescriptionValidation_1 = require("./prescriptionValidation");
const publicClinicalPartiesResponse_1 = require("./publicClinicalPartiesResponse");
function normalizeValidationCode(raw) {
    const code = raw.trim().toUpperCase();
    if (!prescriptionValidation_1.VALIDATION_CODE_REGEX.test(code))
        return null;
    return code;
}
function isPlausiblePublicToken(token) {
    const t = token.trim();
    return t.length >= 16 && t.length <= 64 && /^[A-Za-z0-9_-]+$/.test(t);
}
function buildPublicPrescriptionPayload(doc) {
    const snapshot = doc.snapshot;
    if (!snapshot?.medications?.length)
        return null;
    const contentHash = String(doc.content_hash ?? '');
    const status = (0, prescriptionValidation_1.computeDocumentStatus)({
        revoked_at: doc.revoked_at,
        expires_at: doc.expires_at,
    });
    const parties = (0, publicClinicalPartiesResponse_1.mapClinicalPartiesForPublic)(snapshot);
    return {
        status,
        validation_code: String(doc.validation_code ?? ''),
        issued_at: String(doc.issued_at ?? snapshot.issued_at),
        expires_at: doc.expires_at ?? null,
        revoked_at: doc.revoked_at ?? null,
        content_hash_short: contentHash ? (0, prescriptionValidation_1.truncateContentHash)(contentHash) : '—',
        document_version: Number(doc.version_no ?? snapshot.document_version ?? 1),
        ...parties,
        medications: snapshot.medications,
        notes: snapshot.notes,
        disclaimers: snapshot.disclaimers ?? [],
    };
}
