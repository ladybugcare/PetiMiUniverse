"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateContentHash = exports.maskPublicToken = exports.computeDocumentStatus = exports.REF_EVENT_TABLE = exports.REF_DOC_TABLE = void 0;
exports.issueSpecialistReferralDocument = issueSpecialistReferralDocument;
exports.loadSpecialistReferralDocumentForPdf = loadSpecialistReferralDocumentForPdf;
const supabase_1 = require("../../config/supabase");
const clinicalDocumentValidation_1 = require("./clinicalDocumentValidation");
Object.defineProperty(exports, "computeDocumentStatus", { enumerable: true, get: function () { return clinicalDocumentValidation_1.computeDocumentStatus; } });
Object.defineProperty(exports, "maskPublicToken", { enumerable: true, get: function () { return clinicalDocumentValidation_1.maskPublicToken; } });
Object.defineProperty(exports, "truncateContentHash", { enumerable: true, get: function () { return clinicalDocumentValidation_1.truncateContentHash; } });
const specialistReferralValidation_1 = require("./specialistReferralValidation");
const hubClinicalTimelineController_1 = require("./hubClinicalTimelineController");
const REF_DOC_TABLE = 'hub_clinical_specialist_referral_documents';
exports.REF_DOC_TABLE = REF_DOC_TABLE;
const REF_EVENT_TABLE = 'hub_clinical_specialist_referral_document_events';
exports.REF_EVENT_TABLE = REF_EVENT_TABLE;
const REFERRAL_SELECT = `
  id, clinic_id, pet_id, hub_encounter_id, specialty, specialist_name, specialist_contact,
  referral_reason, clinical_summary, priority, notes, status
`;
async function fetchActiveReferralsForEncounter(clinicId, encounterId, referralId) {
    let q = supabase_1.supabaseAdmin
        .from('hub_clinical_specialist_referrals')
        .select(REFERRAL_SELECT)
        .eq('clinic_id', clinicId)
        .eq('hub_encounter_id', encounterId)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    if (referralId)
        q = q.eq('id', referralId);
    const { data, error } = await q.order('created_at', { ascending: true });
    if (error)
        throw new Error(error.message);
    return (data ?? []);
}
async function nextVersionNo(encounterId, scope, referralId) {
    let q = supabase_1.supabaseAdmin
        .from(REF_DOC_TABLE)
        .select('version_no')
        .eq('hub_encounter_id', encounterId)
        .eq('scope', scope)
        .order('version_no', { ascending: false })
        .limit(1);
    if (scope === 'single' && referralId)
        q = q.eq('referral_id', referralId);
    const { data } = await q.maybeSingle();
    return data ? data.version_no + 1 : 1;
}
async function issueSpecialistReferralDocument(opts) {
    const partiesLoaded = await (0, clinicalDocumentValidation_1.loadEncounterIssueParties)(opts.clinicId, opts.hubEncounterId);
    if (!partiesLoaded.ok)
        return partiesLoaded;
    const { parties } = partiesLoaded;
    if (opts.scope === 'single' && !opts.referralId) {
        return { ok: false, status: 400, error: 'referral_id obrigatório para emissão individual' };
    }
    let referrals;
    try {
        referrals = await fetchActiveReferralsForEncounter(opts.clinicId, opts.hubEncounterId, opts.scope === 'single' ? opts.referralId : null);
    }
    catch (e) {
        return { ok: false, status: 500, error: e.message };
    }
    if (!referrals.length) {
        return { ok: false, status: 409, error: 'Nenhum encaminhamento ativo encontrado para emissão' };
    }
    const issuedAt = new Date().toISOString();
    const defaults = await (0, clinicalDocumentValidation_1.fetchClinicJsonDefaults)(opts.clinicId, 'specialist_referral_defaults');
    const validityDays = (0, specialistReferralValidation_1.resolveSpecialistReferralValidityDays)(defaults);
    const customDisclaimer = typeof defaults.disclaimer_text === 'string' ? defaults.disclaimer_text : null;
    const nextVersion = await nextVersionNo(opts.hubEncounterId, opts.scope, opts.referralId);
    const snapshot = (0, specialistReferralValidation_1.buildSpecialistReferralSnapshot)({
        encounterId: opts.hubEncounterId,
        documentVersion: nextVersion,
        scope: opts.scope,
        issuedAt,
        parties,
        referrals: referrals.map(specialistReferralValidation_1.mapReferralRowToSnapshotItem),
        customDisclaimer,
    });
    const contentHash = (0, specialistReferralValidation_1.computeSpecialistReferralContentHash)(snapshot);
    let validationCode;
    let publicToken;
    try {
        validationCode = await (0, clinicalDocumentValidation_1.generateUniqueCode)('RF', REF_DOC_TABLE);
        publicToken = await (0, clinicalDocumentValidation_1.generateUniquePublicToken)(REF_DOC_TABLE);
    }
    catch (e) {
        return { ok: false, status: 500, error: e.message };
    }
    const publicUrl = (0, specialistReferralValidation_1.resolveSpecialistReferralPublicUrl)(publicToken);
    const expiresAt = (0, clinicalDocumentValidation_1.addDaysIso)(issuedAt, validityDays);
    const { data: doc, error: docErr } = await supabase_1.supabaseAdmin
        .from(REF_DOC_TABLE)
        .insert({
        clinic_id: opts.clinicId,
        hub_encounter_id: opts.hubEncounterId,
        referral_id: opts.scope === 'single' ? opts.referralId : null,
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
                error: 'Banco desatualizado: execute as migrations 65–66 de encaminhamentos.',
            };
        }
        return { ok: false, status: 500, error: msg };
    }
    const docId = doc.id;
    const referralIds = referrals.map((r) => r.id);
    await supabase_1.supabaseAdmin
        .from('hub_clinical_specialist_referrals')
        .update({ status: 'issued', guardian_id: parties.guardian.id })
        .in('id', referralIds)
        .eq('clinic_id', opts.clinicId);
    await (0, clinicalDocumentValidation_1.recordClinicalDocumentEvent)({
        table: REF_EVENT_TABLE,
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
        event_type: 'specialist_referral_issued',
        ref_type: 'specialist_referral_document',
        ref_id: docId,
        title: `Encaminhamento emitido (v${nextVersion})`,
        body: `${validationCode} · ${referrals.length} encaminhamento(s)`,
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
async function loadSpecialistReferralDocumentForPdf(clinicId, documentId) {
    const { data: doc, error } = await supabase_1.supabaseAdmin
        .from(REF_DOC_TABLE)
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
    if (!snapshot?.referrals?.length) {
        return { ok: false, status: 409, error: 'Documento sem snapshot de emissão' };
    }
    const validationCode = String(row.validation_code ?? '');
    const publicUrl = row.validation_url ??
        (row.public_token ? (0, specialistReferralValidation_1.resolveSpecialistReferralPublicUrl)(String(row.public_token)) : '');
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
