import { supabaseAdmin } from '../config/supabase';
import { validateFile, sanitizeFilename } from './fileValidation.js';
import { logger } from './logger.js';

const HUB_PROFILE_PHOTOS_BUCKET = 'hub-profile-photos';

export type HubProfilePhotoFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

function isBucketNotFound(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message ?? '').toLowerCase();
  return m.includes('bucket not found') || (m.includes('not found') && m.includes('bucket'));
}

function isBucketAlreadyExists(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message ?? '').toLowerCase();
  return (
    m.includes('already exists') ||
    m.includes('resource already exists') ||
    m.includes('duplicate') ||
    m.includes('name is already taken')
  );
}

async function ensureHubProfilePhotosBucket(): Promise<void> {
  const { error } = await supabaseAdmin.storage.createBucket(HUB_PROFILE_PHOTOS_BUCKET, {
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  });
  if (!error || isBucketAlreadyExists(error)) return;
  logger.error('[hub_profile_photo] createBucket failed', { message: error.message });
  throw new Error(
    `Não foi possível preparar o armazenamento de fotos de perfil (${error.message}). ` +
      'Execute `petimi_hub/create_hub_profile_photos_bucket.sql` no Supabase.',
  );
}

async function uploadToHubProfileBucket(
  file: HubProfilePhotoFile,
  storagePath: string,
): Promise<{ url: string; path: string }> {
  validateFile(file.buffer, file.mimetype, file.originalname, {
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    maxSize: 5 * 1024 * 1024,
    requireSignature: true,
  });

  const doUpload = () =>
    supabaseAdmin.storage.from(HUB_PROFILE_PHOTOS_BUCKET).upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  let { error } = await doUpload();

  if (error && isBucketNotFound(error)) {
    await ensureHubProfilePhotosBucket();
    ({ error } = await doUpload());
  }

  if (error) {
    logger.error('[hub_profile_photo] upload failed', { storagePath, message: error.message });
    throw error;
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(HUB_PROFILE_PHOTOS_BUCKET).getPublicUrl(storagePath);

  return { url: publicUrl, path: storagePath };
}

function buildPath(prefix: string, id: string, originalname: string): string {
  const sanitized = sanitizeFilename(originalname);
  const extRaw = sanitized.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(extRaw) ? extRaw : 'jpg';
  return `${prefix}/${id}/profile-${Date.now()}.${safeExt}`;
}

export async function uploadHubUserProfilePhotoToStorage(
  file: HubProfilePhotoFile,
  userId: string,
): Promise<{ url: string; path: string }> {
  const path = buildPath('users', userId, file.originalname);
  return uploadToHubProfileBucket(file, path);
}

export async function uploadHubClinicProfilePhotoToStorage(
  file: HubProfilePhotoFile,
  clinicId: string,
): Promise<{ url: string; path: string }> {
  const path = buildPath('clinics', clinicId, file.originalname);
  return uploadToHubProfileBucket(file, path);
}
