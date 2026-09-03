"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateContentHash = exports.computeDocumentStatus = exports.maskPublicToken = void 0;
exports.loadPrescriptionIssueContext = loadPrescriptionIssueContext;
exports.issueValidatablePrescriptionDocument = issueValidatablePrescriptionDocument;
exports.loadPrescriptionDocumentForPdf = loadPrescriptionDocumentForPdf;
exports.recordPrescriptionDocumentEvent = recordPrescriptionDocumentEvent;
const supabase_1 = require("../../config/supabase");
const prescriptionValidation_1 = require("./prescriptionValidation");
Object.defineProperty(exports, "computeDocumentStatus", { enumerable: true, get: function () { return prescriptionValidation_1.computeDocumentStatus; } });
Object.defineProperty(exports, "maskPublicToken", { enumerable: true, get: function () { return prescriptionValidation_1.maskPublicToken; } });
Object.defineProperty(exports, "truncateContentHash", { enumerable: true, get: function () { return prescriptionValidation_1.truncateContentHash; } });
const hubClinicalTimelineController_1 = require("./hubClinicalTimelineController");
const CODE_RETRY_MAX = 8;
async function isValidationCodeTaken(code) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_prescription_documents')
        .select('id')
        .eq('validation_code', code)
        .maybeSingle();
    return Boolean(data);
}
async function isPublicTokenTaken(token) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_prescription_documents')
        .select('id')
        .eq('public_token', token)
        .maybeSingle();
    return Boolean(data);
}
async function generateUniqueValidationCode() {
    for (let i = 0; i < CODE_RETRY_MAX; i++) {
        const code = (0, prescriptionValidation_1.generateValidationCode)();
        if (!(await isValidationCodeTaken(code)))
            return code;
    }
    throw new Error('Não foi possível gerar código de validação único');
}
async function generateUniquePublicToken() {
    for (let i = 0; i < CODE_RETRY_MAX; i++) {
        const token = (0, prescriptionValidation_1.generatePublicToken)();
        if (!(await isPublicTokenTaken(token)))
            return token;
    }
    throw new Error('Não foi possível gerar token público único');
}
async function fetchPrescriptionDefaults(clinicId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_clinic_settings')
        .select('prescription_defaults')
        .eq('clinic_id', clinicId)
        .maybeSingle();
    return (data?.prescription_defaults ??
        {});
}
async function recordPrescriptionDocumentEvent(opts) {
    try {
        await supabase_1.supabaseAdmin.from('hub_prescription_document_events').insert({
            clinic_id: opts.clinic_id,
            document_id: opts.document_id,
            event_type: opts.event_type,
            actor_user_id: opts.actor_user_id ?? null,
            actor_ip: opts.actor_ip ?? null,
            actor_user_agent: opts.actor_user_agent ?? null,
            metadata: opts.metadata ?? {},
        });
    }
    catch (e) {
        console.error('[prescription_document_event]', e);
    }
}
async function loadPrescriptionIssueContext(prescriptionId, clinicId) {
    const { data: rx, error: rxErr } = await supabase_1.supabaseAdmin
        .from('hub_prescriptions')
        .select(`
      *,
      clinic:clinics(id, name),
      pet:hub_pets(id, name, species, breed),
      guardian:hub_guardians(id, full_name),
      staff:hub_staff_members(id, full_name, crmv, crmv_uf),
      encounter:hub_encounters(id, guardian_id, pet_id, hub_staff_member_id)
    `)
        .eq('id', prescriptionId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (rxErr)
        return { ok: false, status: 500, error: rxErr.message };
    if (!rx)
        return { ok: false, status: 404, error: 'Prescrição não encontrada' };
    const rxRow = rx;
    // Receita validável pode ser avulsa (sem atendimento): exige pet + veterinário responsável.
    // hub_encounter_id / hub_case_id são opcionais e podem ser vinculados depois.
    if (!rxRow.pet_id) {
        return { ok: false, status: 409, error: 'Prescrição sem pet vinculado' };
    }
    if (!rxRow.hub_staff_member_id) {
        return { ok: false, status: 409, error: 'Prescrição sem veterinário responsável' };
    }
    const { data: items, error: itemsErr } = await supabase_1.supabaseAdmin
        .from('hub_prescription_items')
        .select('*')
        .eq('prescription_id', prescriptionId)
        .order('order_index');
    if (itemsErr)
        return { ok: false, status: 500, error: itemsErr.message };
    if (!items?.length) {
        return { ok: false, status: 409, error: 'Adicione ao menos um medicamento antes de emitir' };
    }
    const encounter = (rxRow.encounter ?? null);
    const enc = Array.isArray(encounter) ? encounter[0] : encounter;
    let guardianEmbed = rxRow.guardian;
    if (!guardianEmbed && enc?.guardian_id) {
        const { data: gRow } = await supabase_1.supabaseAdmin
            .from('hub_guardians')
            .select('id, full_name')
            .eq('id', enc.guardian_id)
            .maybeSingle();
        guardianEmbed = gRow;
    }
    if (!guardianEmbed && rxRow.pet_id) {
        const { data: pgRow } = await supabase_1.supabaseAdmin
            .from('hub_pet_guardians')
            .select('guardian:hub_guardians(id, full_name)')
            .eq('pet_id', rxRow.pet_id)
            .order('role', { ascending: true })
            .limit(1)
            .maybeSingle();
        guardianEmbed = pgRow?.guardian ?? null;
    }
    const ctx = (0, prescriptionValidation_1.mapLoadedIssueContext)(rxRow, items, rxRow.clinic, rxRow.pet, guardianEmbed, rxRow.staff);
    return { ok: true, ctx };
}
async function issueValidatablePrescriptionDocument(opts) {
    const loaded = await loadPrescriptionIssueContext(opts.prescriptionId, opts.clinicId);
    if (!loaded.ok)
        return loaded;
    const { ctx } = loaded;
    const rxRow = ctx.prescription;
    const { data: latest } = await supabase_1.supabaseAdmin
        .from('hub_prescription_documents')
        .select('version_no')
        .eq('prescription_id', opts.prescriptionId)
        .order('version_no', { ascending: false })
        .limit(1)
        .maybeSingle();
    const nextVersion = latest ? latest.version_no + 1 : 1;
    const issuedAt = new Date().toISOString();
    const defaults = await fetchPrescriptionDefaults(opts.clinicId);
    const validityDays = (0, prescriptionValidation_1.resolvePrescriptionValidityDays)(defaults);
    const customDisclaimer = typeof defaults.disclaimer_text === 'string' ? defaults.disclaimer_text : null;
    const snapshot = (0, prescriptionValidation_1.buildPrescriptionSnapshot)({
        prescriptionId: opts.prescriptionId,
        documentVersion: nextVersion,
        issuedAt,
        notes: rxRow.notes ?? null,
        clinic: ctx.clinic,
        pet: ctx.pet,
        guardian: ctx.guardian,
        veterinarian: ctx.veterinarian,
        items: ctx.items,
        customDisclaimer,
    });
    const contentHash = (0, prescriptionValidation_1.computeContentHash)(snapshot);
    const validationCode = await generateUniqueValidationCode();
    const publicToken = await generateUniquePublicToken();
    const publicUrl = (0, prescriptionValidation_1.resolvePrescriptionPublicUrl)(publicToken);
    const expiresAt = (0, prescriptionValidation_1.addDaysIso)(issuedAt, validityDays);
    const { data: doc, error: docErr } = await supabase_1.supabaseAdmin
        .from('hub_prescription_documents')
        .insert({
        clinic_id: opts.clinicId,
        prescription_id: opts.prescriptionId,
        version_no: nextVersion,
        issued_by: opts.issuedBy ?? ctx.veterinarian.id,
        issued_at: issuedAt,
        signature_status: 'none',
        validation_code: validationCode,
        public_token: publicToken,
        document_status: 'valid',
        content_hash: contentHash,
        snapshot,
        expires_at: expiresAt,
        validation_url: publicUrl,
    })
        .select('*')
        .single();
    if (docErr || !doc) {
        const msg = docErr?.message || 'Erro ao emitir documento';
        if (/column|relation|schema|does not exist/i.test(msg)) {
            return {
                ok: false,
                status: 500,
                error: 'Banco desatualizado: execute as migrations 58–61 da receita validável (hub_prescription_documents e colunas de validação).',
            };
        }
        return { ok: false, status: 500, error: msg };
    }
    const docId = doc.id;
    await supabase_1.supabaseAdmin
        .from('hub_prescriptions')
        .update({
        status: 'issued',
        guardian_id: ctx.guardian.id,
        hub_staff_member_id: ctx.veterinarian.id,
    })
        .eq('id', opts.prescriptionId)
        .eq('clinic_id', opts.clinicId);
    await recordPrescriptionDocumentEvent({
        clinic_id: opts.clinicId,
        document_id: docId,
        event_type: 'created',
        actor_user_id: opts.actorUserId ?? null,
        metadata: { validation_code: validationCode, version_no: nextVersion },
    });
    void (0, hubClinicalTimelineController_1.recordTimelineEvent)({
        clinic_id: opts.clinicId,
        pet_id: String(rxRow.pet_id),
        hub_case_id: rxRow.hub_case_id ?? null,
        hub_encounter_id: rxRow.hub_encounter_id ?? null,
        event_type: 'prescription_issued',
        ref_type: 'prescription_document',
        ref_id: docId,
        title: `Receita validável emitida (v${nextVersion})`,
        body: `${validationCode} · ${ctx.items.length} medicamento(s)`,
        created_by: opts.issuedBy ?? ctx.veterinarian.id,
    });
    const enriched = {
        ...doc,
        document_status: (0, prescriptionValidation_1.computeDocumentStatus)({
            revoked_at: null,
            expires_at: expiresAt,
        }),
        public_url: publicUrl,
        content_hash_short: (0, prescriptionValidation_1.truncateContentHash)(contentHash),
        public_token_masked: (0, prescriptionValidation_1.maskPublicToken)(publicToken),
    };
    return {
        ok: true,
        result: {
            document: enriched,
            snapshot,
            public_url: publicUrl,
            content_hash_short: (0, prescriptionValidation_1.truncateContentHash)(contentHash),
        },
    };
}
async function loadPrescriptionDocumentForPdf(prescriptionId, clinicId, documentId) {
    const { data: doc, error } = await supabase_1.supabaseAdmin
        .from('hub_prescription_documents')
        .select('*')
        .eq('id', documentId)
        .eq('prescription_id', prescriptionId)
        .eq('clinic_id', clinicId)
        .maybeSingle();
    if (error)
        return { ok: false, status: 500, error: error.message };
    if (!doc)
        return { ok: false, status: 404, error: 'Documento não encontrado' };
    const row = doc;
    const snapshot = row.snapshot;
    if (!snapshot?.medications?.length) {
        return { ok: false, status: 409, error: 'Documento sem snapshot de emissão' };
    }
    const validationCode = String(row.validation_code ?? '');
    const publicUrl = row.validation_url ??
        (row.public_token ? (0, prescriptionValidation_1.resolvePrescriptionPublicUrl)(String(row.public_token)) : '');
    const contentHash = String(row.content_hash ?? '');
    return {
        ok: true,
        snapshot,
        validation: {
            validation_code: validationCode,
            public_url: publicUrl,
            content_hash: contentHash,
            issued_at: String(row.issued_at ?? snapshot.issued_at),
            expires_at: row.expires_at ?? null,
            disclaimers: snapshot.disclaimers ?? [],
        },
    };
}
