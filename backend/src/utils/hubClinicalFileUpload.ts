import { supabaseAdmin } from '../config/supabase';
import { validateFile, sanitizeFilename } from './fileValidation.js';
import { logger } from './logger.js';

const HUB_CLINICAL_FILES_BUCKET = 'hub-clinical-files';

const ALLOWED_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export type HubClinicalFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

function isBucketAlreadyExists(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message ?? '').toLowerCase();
  return (
    m.includes('already exists') ||
    m.includes('resource already exists') ||
    m.includes('duplicate') ||
    m.includes('name is already taken')
  );
}

async function ensureHubClinicalFilesBucket(): Promise<void> {
  const { error } = await supabaseAdmin.storage.createBucket(HUB_CLINICAL_FILES_BUCKET, {
    public: true,
    fileSizeLimit: 15 * 1024 * 1024,
    allowedMimeTypes: ALLOWED_MIMES,
  });
  if (!error || isBucketAlreadyExists(error)) return;
  logger.error('[hub_clinical_file] createBucket failed', { message: error.message });
  throw new Error(
    `Não foi possível preparar o armazenamento de exames clínicos (${error.message}). ` +
      'Execute a migration `create_hub_clinical_attachments.sql` ou crie o bucket «hub-clinical-files» no Supabase.',
  );
}

/**
 * Upload de anexo clínico (PDF/imagem). Caminho: `{clinicId}/{petId}/{timestamp}-{rand}.{ext}`
 */
export async function uploadHubClinicalFileToStorage(
  file: HubClinicalFile,
  clinicId: string,
  petId: string,
): Promise<{ url: string; path: string }> {
  validateFile(file.buffer, file.mimetype, file.originalname, {
    maxSize: 15 * 1024 * 1024,
    allowedTypes: ALLOWED_MIMES,
    requireSignature: true,
  });

  await ensureHubClinicalFilesBucket();

  const safe = sanitizeFilename(file.originalname);
  const ext = safe.includes('.') ? safe.split('.').pop() : 'bin';
  const path = `${clinicId}/${petId}/clinical-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(HUB_CLINICAL_FILES_BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

  if (upErr) {
    logger.error('[hub_clinical_file] upload failed', { message: upErr.message, path });
    throw new Error(upErr.message || 'Erro ao enviar ficheiro');
  }

  const { data: pub } = supabaseAdmin.storage.from(HUB_CLINICAL_FILES_BUCKET).getPublicUrl(path);
  return { url: pub.publicUrl, path };
}
