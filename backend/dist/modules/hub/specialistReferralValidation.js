"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SPECIALIST_REFERRAL_DISCLAIMERS = exports.SPECIALIST_REFERRAL_CODE_REGEX = void 0;
exports.normalizeSpecialistReferralValidationCode = normalizeSpecialistReferralValidationCode;
exports.resolveSpecialistReferralPublicUrl = resolveSpecialistReferralPublicUrl;
exports.mapReferralRowToSnapshotItem = mapReferralRowToSnapshotItem;
exports.buildSpecialistReferralSnapshot = buildSpecialistReferralSnapshot;
exports.computeSpecialistReferralContentHash = computeSpecialistReferralContentHash;
exports.resolveSpecialistReferralValidityDays = resolveSpecialistReferralValidityDays;
const clinicalDocumentValidation_1 = require("./clinicalDocumentValidation");
exports.SPECIALIST_REFERRAL_CODE_REGEX = /^RF-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
exports.DEFAULT_SPECIALIST_REFERRAL_DISCLAIMERS = [
    'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui documentos regulatórios específicos.',
    'O encaminhamento é uma orientação clínica; a consulta com especialista depende de disponibilidade e critérios do profissional destino.',
    'Este documento não garante agendamento ou aceitação pelo especialista indicado.',
];
function normalizeSpecialistReferralValidationCode(raw) {
    const code = raw.trim().toUpperCase();
    if (!exports.SPECIALIST_REFERRAL_CODE_REGEX.test(code))
        return null;
    return code;
}
function resolveSpecialistReferralPublicUrl(publicToken) {
    return (0, clinicalDocumentValidation_1.resolveClinicalPublicUrl)('/encaminhamento/', publicToken);
}
function mapReferralRowToSnapshotItem(row) {
    return {
        referral_id: String(row.id),
        specialty: String(row.specialty ?? '—'),
        specialist_name: row.specialist_name ?? null,
        specialist_contact: row.specialist_contact ?? null,
        referral_reason: String(row.referral_reason ?? '—'),
        clinical_summary: row.clinical_summary ?? null,
        priority: row.priority ?? 'routine',
        notes: row.notes ?? null,
    };
}
function buildSpecialistReferralSnapshot(opts) {
    const disclaimers = [...exports.DEFAULT_SPECIALIST_REFERRAL_DISCLAIMERS];
    if (opts.customDisclaimer?.trim())
        disclaimers.push(opts.customDisclaimer.trim());
    return {
        version: 1,
        hub_encounter_id: opts.encounterId,
        document_version: opts.documentVersion,
        scope: opts.scope,
        clinic: opts.parties.clinic,
        pet: opts.parties.pet,
        guardian: opts.parties.guardian,
        veterinarian: opts.parties.veterinarian,
        referrals: opts.referrals,
        issued_at: opts.issuedAt,
        disclaimers,
    };
}
function computeSpecialistReferralContentHash(snapshot) {
    return (0, clinicalDocumentValidation_1.computeSnapshotHash)(snapshot);
}
function resolveSpecialistReferralValidityDays(defaults) {
    return (0, clinicalDocumentValidation_1.resolveValidityDays)(defaults, 30);
}
