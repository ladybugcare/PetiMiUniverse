"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadHubClinicalTermToStorage = uploadHubClinicalTermToStorage;
const supabase_1 = require("../config/supabase");
const fileValidation_js_1 = require("./fileValidation.js");
const logger_js_1 = require("./logger.js");
const HUB_CLINICAL_FILES_BUCKET = 'hub-clinical-files';
const ALLOWED_MIMES = ['application/pdf'];
function isBucketAlreadyExists(err) {
    const m = (err?.message ?? '').toLowerCase();
    return (m.includes('already exists') ||
        m.includes('resource already exists') ||
        m.includes('duplicate') ||
        m.includes('name is already taken'));
}
async function ensureHubClinicalFilesBucket() {
    const { error } = await supabase_1.supabaseAdmin.storage.createBucket(HUB_CLINICAL_FILES_BUCKET, {
        public: true,
        fileSizeLimit: 15 * 1024 * 1024,
        allowedMimeTypes: [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'application/pdf',
        ],
    });
    if (!error || isBucketAlreadyExists(error))
        return;
    logger_js_1.logger.error('[hub_clinical_term] createBucket failed', { message: error.message });
    throw new Error(`Não foi possível preparar o armazenamento de termos clínicos (${error.message}). ` +
        'Crie o bucket «hub-clinical-files» no Supabase ou execute a migration de anexos clínicos.');
}
/**
 * Upload de modelo de termo clínico (PDF). Caminho: `{clinicId}/terms/{timestamp}-{rand}.pdf`
 */
async function uploadHubClinicalTermToStorage(file, clinicId) {
    (0, fileValidation_js_1.validateFile)(file.buffer, file.mimetype, file.originalname, {
        maxSize: 15 * 1024 * 1024,
        allowedTypes: ALLOWED_MIMES,
        requireSignature: true,
    });
    await ensureHubClinicalFilesBucket();
    const safe = (0, fileValidation_js_1.sanitizeFilename)(file.originalname);
    const ext = safe.toLowerCase().endsWith('.pdf') ? 'pdf' : 'pdf';
    const path = `${clinicId}/terms/term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const { error: upErr } = await supabase_1.supabaseAdmin.storage
        .from(HUB_CLINICAL_FILES_BUCKET)
        .upload(path, file.buffer, { contentType: 'application/pdf', upsert: false });
    if (upErr) {
        logger_js_1.logger.error('[hub_clinical_term] upload failed', { message: upErr.message, path });
        throw new Error(upErr.message || 'Erro ao enviar arquivo');
    }
    const { data: pub } = supabase_1.supabaseAdmin.storage.from(HUB_CLINICAL_FILES_BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, path };
}
