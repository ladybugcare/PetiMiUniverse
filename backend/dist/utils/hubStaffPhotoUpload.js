"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadHubStaffPhotoToStorage = uploadHubStaffPhotoToStorage;
const supabase_1 = require("../config/supabase");
const fileValidation_js_1 = require("./fileValidation.js");
const logger_js_1 = require("./logger.js");
const HUB_STAFF_PHOTOS_BUCKET = 'hub-staff-photos';
function isBucketNotFound(err) {
    const m = (err?.message ?? '').toLowerCase();
    return m.includes('bucket not found') || (m.includes('not found') && m.includes('bucket'));
}
function isBucketAlreadyExists(err) {
    const m = (err?.message ?? '').toLowerCase();
    return (m.includes('already exists') ||
        m.includes('resource already exists') ||
        m.includes('duplicate') ||
        m.includes('name is already taken'));
}
/**
 * Garante o bucket de fotos da equipe (ex.: ambientes onde a migration SQL ainda não correu).
 * Para políticas RLS finas em `storage.objects`, continue a usar `create_hub_staff_photos_bucket.sql`.
 */
async function ensureHubStaffPhotosBucket() {
    const { error } = await supabase_1.supabaseAdmin.storage.createBucket(HUB_STAFF_PHOTOS_BUCKET, {
        public: true,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    });
    if (!error) {
        logger_js_1.logger.info('[hub_staff_photo] bucket created', { bucket: HUB_STAFF_PHOTOS_BUCKET });
        return;
    }
    if (isBucketAlreadyExists(error)) {
        return;
    }
    logger_js_1.logger.error('[hub_staff_photo] createBucket failed', { message: error.message });
    throw new Error(`Não foi possível preparar o armazenamento de fotos da equipe (${error.message}). ` +
        'No Supabase (SQL Editor), execute `petimi_hub/create_hub_staff_photos_bucket.sql` ou crie manualmente o bucket «hub-staff-photos» (público, até 5 MB, JPEG/PNG/WEBP).');
}
/**
 * Envia imagem de perfil de membro da equipe para Storage (bucket `hub-staff-photos`).
 * Caminho: `{clinicId}/staff-{timestamp}-{rand}.{ext}` — upload apenas pelo backend (service role).
 */
async function uploadHubStaffPhotoToStorage(file, clinicId) {
    (0, fileValidation_js_1.validateFile)(file.buffer, file.mimetype, file.originalname, {
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        maxSize: 5 * 1024 * 1024,
        requireSignature: true,
    });
    const sanitized = (0, fileValidation_js_1.sanitizeFilename)(file.originalname);
    const extRaw = sanitized.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(extRaw) ? extRaw : 'jpg';
    const fileName = `${clinicId}/staff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExt}`;
    const doUpload = () => supabase_1.supabaseAdmin.storage.from(HUB_STAFF_PHOTOS_BUCKET).upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
    });
    let { error } = await doUpload();
    if (error && isBucketNotFound(error)) {
        logger_js_1.logger.warn('[hub_staff_photo] bucket missing, creating', { message: error.message });
        await ensureHubStaffPhotosBucket();
        ({ error } = await doUpload());
    }
    if (error) {
        logger_js_1.logger.error('[hub_staff_photo] upload failed', { clinicId, fileName, message: error.message });
        if (isBucketNotFound(error)) {
            throw new Error('Bucket «hub-staff-photos» não disponível. No Supabase, execute `petimi_hub/create_hub_staff_photos_bucket.sql` e confirme a service role e o Storage.');
        }
        throw error;
    }
    const { data: { publicUrl }, } = supabase_1.supabaseAdmin.storage.from(HUB_STAFF_PHOTOS_BUCKET).getPublicUrl(fileName);
    logger_js_1.logger.info('[hub_staff_photo] uploaded', { clinicId, fileName, bytes: file.buffer.length });
    return { url: publicUrl, path: fileName };
}
