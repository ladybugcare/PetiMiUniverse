"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_EXAM_ORDER_DISCLAIMERS = exports.EXAM_ORDER_CODE_REGEX = void 0;
exports.normalizeExamOrderValidationCode = normalizeExamOrderValidationCode;
exports.resolveExamOrderPublicUrl = resolveExamOrderPublicUrl;
exports.mapExamRowToSnapshotItem = mapExamRowToSnapshotItem;
exports.buildExamOrderSnapshot = buildExamOrderSnapshot;
exports.computeExamOrderContentHash = computeExamOrderContentHash;
exports.resolveExamOrderValidityDays = resolveExamOrderValidityDays;
const clinicalDocumentValidation_1 = require("./clinicalDocumentValidation");
exports.EXAM_ORDER_CODE_REGEX = /^EX-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
exports.DEFAULT_EXAM_ORDER_DISCLAIMERS = [
    'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui guias oficiais de convênios ou laboratórios.',
    'A realização dos exames é de responsabilidade do laboratório indicado e do tutor, conforme orientação veterinária.',
    'Este documento não garante aceitação por convênios ou laboratórios externos.',
];
function normalizeExamOrderValidationCode(raw) {
    const code = raw.trim().toUpperCase();
    if (!exports.EXAM_ORDER_CODE_REGEX.test(code))
        return null;
    return code;
}
function resolveExamOrderPublicUrl(publicToken) {
    return (0, clinicalDocumentValidation_1.resolveClinicalPublicUrl)('/solicitacao-exame/', publicToken);
}
function mapExamRowToSnapshotItem(row) {
    return {
        exam_id: String(row.id),
        exam_type: String(row.exam_type ?? '—'),
        lab_kind: row.lab_kind ?? 'internal',
        lab_name: row.lab_name ?? null,
        external_lab_name: row.external_lab_name ?? null,
        clinical_indication: row.clinical_indication ?? null,
        fasting_required: Boolean(row.fasting_required),
        collection_instructions: row.collection_instructions ?? null,
        urgency: row.urgency ?? null,
        notes: row.notes ?? null,
    };
}
function buildExamOrderSnapshot(opts) {
    const disclaimers = [...exports.DEFAULT_EXAM_ORDER_DISCLAIMERS];
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
        exams: opts.exams,
        issued_at: opts.issuedAt,
        disclaimers,
    };
}
function computeExamOrderContentHash(snapshot) {
    return (0, clinicalDocumentValidation_1.computeSnapshotHash)(snapshot);
}
function resolveExamOrderValidityDays(defaults) {
    return (0, clinicalDocumentValidation_1.resolveValidityDays)(defaults, 30);
}
