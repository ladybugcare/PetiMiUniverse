import { supabaseAdmin } from '../config/supabase';
import { validateFile, sanitizeFilename } from './fileValidation.js';
import { logger } from './logger.js';

const HUB_CLINICAL_FILES_BUCKET = 'hub-clinical-files';

const ALLOWED_MIMES = ['application/pdf'];

export type HubClinicalTermFile = {
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
    allowedMimeTypes: [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'application/pdf',
    ],
  });
  if (!error || isBucketAlreadyExists(error)) return;
  logger.error('[hub_clinical_term] createBucket failed', { message: error.message });
  throw new Error(
    `Não foi possível preparar o armazenamento de termos clínicos (${error.message}). ` +
      'Crie o bucket «hub-clinical-files» no Supabase ou execute a migration de anexos clínicos.',
  );
}

/**
 * Upload de modelo de termo clínico (PDF). Caminho: `{clinicId}/terms/{timestamp}-{rand}.pdf`
 */
export async function uploadHubClinicalTermToStorage(
  file: HubClinicalTermFile,
  clinicId: string,
): Promise<{ url: string; path: string }> {
  validateFile(file.buffer, file.mimetype, file.originalname, {
    maxSize: 15 * 1024 * 1024,
    allowedTypes: ALLOWED_MIMES,
    requireSignature: true,
  });

  await ensureHubClinicalFilesBucket();

  const safe = sanitizeFilename(file.originalname);
  const ext = safe.toLowerCase().endsWith('.pdf') ? 'pdf' : 'pdf';
  const path = `${clinicId}/terms/term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(HUB_CLINICAL_FILES_BUCKET)
    .upload(path, file.buffer, { contentType: 'application/pdf', upsert: false });

  if (upErr) {
    logger.error('[hub_clinical_term] upload failed', { message: upErr.message, path });
    throw new Error(upErr.message || 'Erro ao enviar arquivo');
  }

  const { data: pub } = supabaseAdmin.storage.from(HUB_CLINICAL_FILES_BUCKET).getPublicUrl(path);
  return { url: pub.publicUrl, path };
}
