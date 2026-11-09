"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeValidationCode = normalizeValidationCode;
exports.isPlausiblePublicToken = isPlausiblePublicToken;
exports.buildPublicPrescriptionPayload = buildPublicPrescriptionPayload;
const prescriptionValidation_1 = require("./prescriptionValidation");
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
    const addressLine = (0, prescriptionValidation_1.formatClinicAddress)(snapshot.clinic);
    return {
        status,
        validation_code: String(doc.validation_code ?? ''),
        issued_at: String(doc.issued_at ?? snapshot.issued_at),
        expires_at: doc.expires_at ?? null,
        revoked_at: doc.revoked_at ?? null,
        content_hash_short: contentHash ? (0, prescriptionValidation_1.truncateContentHash)(contentHash) : '—',
        document_version: Number(doc.version_no ?? snapshot.document_version ?? 1),
        clinic: {
            name: snapshot.clinic.name,
            phone: snapshot.clinic.phone ?? null,
            email: snapshot.clinic.email ?? null,
            address_line: addressLine || null,
        },
        pet: {
            name: snapshot.pet.name,
            species: snapshot.pet.species,
            breed: snapshot.pet.breed,
            age_label: (0, prescriptionValidation_1.formatAgeFromBirthDate)(snapshot.pet.birth_date),
        },
        guardian: {
            full_name: snapshot.guardian.full_name,
            phone: snapshot.guardian.phone ?? null,
            tax_id_display: (0, prescriptionValidation_1.formatTaxIdDisplay)(snapshot.guardian.tax_id),
            id_doc_number: snapshot.guardian.id_doc_number ?? null,
            address_line: (0, prescriptionValidation_1.formatGuardianAddress)(snapshot.guardian),
        },
        veterinarian: {
            full_name: snapshot.veterinarian.full_name,
            crmv: snapshot.veterinarian.crmv,
            crmv_uf: snapshot.veterinarian.crmv_uf,
        },
        medications: snapshot.medications,
        notes: snapshot.notes,
        disclaimers: snapshot.disclaimers ?? [],
    };
}
