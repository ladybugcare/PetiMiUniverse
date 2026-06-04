"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadHubUserProfilePhotoToStorage = uploadHubUserProfilePhotoToStorage;
exports.uploadHubClinicProfilePhotoToStorage = uploadHubClinicProfilePhotoToStorage;
const supabase_1 = require("../config/supabase");
const fileValidation_js_1 = require("./fileValidation.js");
const logger_js_1 = require("./logger.js");
const HUB_PROFILE_PHOTOS_BUCKET = 'hub-profile-photos';
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
async function ensureHubProfilePhotosBucket() {
    const { error } = await supabase_1.supabaseAdmin.storage.createBucket(HUB_PROFILE_PHOTOS_BUCKET, {
        public: true,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    });
    if (!error || isBucketAlreadyExists(error))
        return;
    logger_js_1.logger.error('[hub_profile_photo] createBucket failed', { message: error.message });
    throw new Error(`Não foi possível preparar o armazenamento de fotos de perfil (${error.message}). ` +
        'Execute `petimi_hub/create_hub_profile_photos_bucket.sql` no Supabase.');
}
async function uploadToHubProfileBucket(file, storagePath) {
    (0, fileValidation_js_1.validateFile)(file.buffer, file.mimetype, file.originalname, {
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        maxSize: 5 * 1024 * 1024,
        requireSignature: true,
    });
    const doUpload = () => supabase_1.supabaseAdmin.storage.from(HUB_PROFILE_PHOTOS_BUCKET).upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
    });
    let { error } = await doUpload();
    if (error && isBucketNotFound(error)) {
        await ensureHubProfilePhotosBucket();
        ({ error } = await doUpload());
    }
    if (error) {
        logger_js_1.logger.error('[hub_profile_photo] upload failed', { storagePath, message: error.message });
        throw error;
    }
    const { data: { publicUrl }, } = supabase_1.supabaseAdmin.storage.from(HUB_PROFILE_PHOTOS_BUCKET).getPublicUrl(storagePath);
    return { url: publicUrl, path: storagePath };
}
function buildPath(prefix, id, originalname) {
    const sanitized = (0, fileValidation_js_1.sanitizeFilename)(originalname);
    const extRaw = sanitized.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(extRaw) ? extRaw : 'jpg';
    return `${prefix}/${id}/profile-${Date.now()}.${safeExt}`;
}
async function uploadHubUserProfilePhotoToStorage(file, userId) {
    const path = buildPath('users', userId, file.originalname);
    return uploadToHubProfileBucket(file, path);
}
async function uploadHubClinicProfilePhotoToStorage(file, clinicId) {
    const path = buildPath('clinics', clinicId, file.originalname);
    return uploadToHubProfileBucket(file, path);
}
