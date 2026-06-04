"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadHubClinicalFileToStorage = uploadHubClinicalFileToStorage;
const supabase_1 = require("../config/supabase");
const fileValidation_js_1 = require("./fileValidation.js");
const logger_js_1 = require("./logger.js");
const HUB_CLINICAL_FILES_BUCKET = 'hub-clinical-files';
const ALLOWED_MIMES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf',
];
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
        allowedMimeTypes: ALLOWED_MIMES,
    });
    if (!error || isBucketAlreadyExists(error))
        return;
    logger_js_1.logger.error('[hub_clinical_file] createBucket failed', { message: error.message });
    throw new Error(`Não foi possível preparar o armazenamento de exames clínicos (${error.message}). ` +
        'Execute a migration `create_hub_clinical_attachments.sql` ou crie o bucket «hub-clinical-files» no Supabase.');
}
/**
 * Upload de anexo clínico (PDF/imagem). Caminho: `{clinicId}/{petId}/{timestamp}-{rand}.{ext}`
 */
async function uploadHubClinicalFileToStorage(file, clinicId, petId) {
    (0, fileValidation_js_1.validateFile)(file.buffer, file.mimetype, file.originalname, {
        maxSize: 15 * 1024 * 1024,
        allowedTypes: ALLOWED_MIMES,
        requireSignature: true,
    });
    await ensureHubClinicalFilesBucket();
    const safe = (0, fileValidation_js_1.sanitizeFilename)(file.originalname);
    const ext = safe.includes('.') ? safe.split('.').pop() : 'bin';
    const path = `${clinicId}/${petId}/clinical-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const { error: upErr } = await supabase_1.supabaseAdmin.storage
        .from(HUB_CLINICAL_FILES_BUCKET)
        .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (upErr) {
        logger_js_1.logger.error('[hub_clinical_file] upload failed', { message: upErr.message, path });
        throw new Error(upErr.message || 'Erro ao enviar ficheiro');
    }
    const { data: pub } = supabase_1.supabaseAdmin.storage.from(HUB_CLINICAL_FILES_BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, path };
}
