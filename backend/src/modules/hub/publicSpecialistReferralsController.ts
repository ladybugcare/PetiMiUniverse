import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { recordClinicalDocumentEvent } from './clinicalDocumentValidation';
import { buildPublicSpecialistReferralPayload } from './hubSpecialistReferralsController';
import { streamValidatableSpecialistReferralPdf } from './hubSpecialistReferralPdf';
import { REF_EVENT_TABLE } from './specialistReferralDocumentIssue';
import {
  normalizeSpecialistReferralValidationCode,
  resolveSpecialistReferralPublicUrl,
} from './specialistReferralValidation';
import { isPlausiblePublicToken } from './publicPrescriptionResponse';

const PUBLIC_NOT_FOUND = 'Encaminhamento não encontrado';

const DOCUMENT_PUBLIC_SELECT =
  'id, clinic_id, hub_encounter_id, version_no, validation_code, public_token, document_status, content_hash, snapshot, issued_at, expires_at, revoked_at, revoke_reason, validation_url';

function applyPublicHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

const viewDebounce = new Map<string, number>();
const VIEW_DEBOUNCE_MS = 60 * 60 * 1000;

async function maybeRecordViewed(req: Request, clinicId: string, documentId: string): Promise<void> {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const key = `${documentId}:${ip}`;
  const now = Date.now();
  const last = viewDebounce.get(key);
  if (last != null && now - last < VIEW_DEBOUNCE_MS) return;
  viewDebounce.set(key, now);

  await recordClinicalDocumentEvent({
    table: REF_EVENT_TABLE,
    clinic_id: clinicId,
    document_id: documentId,
    event_type: 'viewed',
    actor_ip: ip,
    actor_user_agent:
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : null,
  });
}

async function loadByToken(token: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_clinical_specialist_referral_documents')
    .select(DOCUMENT_PUBLIC_SELECT)
    .eq('public_token', token)
    .maybeSingle();
  if (error) throw new Error('LOAD_ERROR');
  return (data as Record<string, unknown> | null) ?? null;
}

async function loadByCode(code: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_clinical_specialist_referral_documents')
    .select(DOCUMENT_PUBLIC_SELECT)
    .eq('validation_code', code)
    .maybeSingle();
  if (error) throw new Error('LOAD_ERROR');
  return (data as Record<string, unknown> | null) ?? null;
}

function respondPayload(req: Request, res: Response, doc: Record<string, unknown>): Response {
  const payload = buildPublicSpecialistReferralPayload(doc);
  if (!payload) return res.status(404).json({ error: PUBLIC_NOT_FOUND });
  applyPublicHeaders(res);
  void maybeRecordViewed(req, String(doc.clinic_id), String(doc.id));
  return res.json({ specialist_referral: payload });
}

export const validatePublicSpecialistReferralByCode = async (req: Request, res: Response) => {
  try {
    const rawCode = typeof req.query.code === 'string' ? req.query.code : '';
    const code = normalizeSpecialistReferralValidationCode(rawCode);
    if (!code) return res.status(400).json({ error: 'Código de validação inválido' });

    const doc = await loadByCode(code);
    if (!doc) return res.status(404).json({ error: PUBLIC_NOT_FOUND });
    return respondPayload(req, res, doc);
  } catch (e) {
    console.error('[public_specialist_referrals] validate', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const getPublicSpecialistReferralByToken = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!isPlausiblePublicToken(token)) return res.status(400).json({ error: 'Token inválido' });

    const doc = await loadByToken(token);
    if (!doc) return res.status(404).json({ error: PUBLIC_NOT_FOUND });
    return respondPayload(req, res, doc);
  } catch (e) {
    console.error('[public_specialist_referrals] get', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const getPublicSpecialistReferralPdf = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!isPlausiblePublicToken(token)) return res.status(400).json({ error: 'Token inválido' });

    const doc = await loadByToken(token);
    if (!doc) return res.status(404).json({ error: PUBLIC_NOT_FOUND });

    const payload = buildPublicSpecialistReferralPayload(doc);
    if (!payload) return res.status(404).json({ error: PUBLIC_NOT_FOUND });

    const snapshot = doc.snapshot as import('./specialistReferralValidation').SpecialistReferralSnapshot;
    const publicUrl =
      (doc.validation_url as string | null) ??
      resolveSpecialistReferralPublicUrl(String(doc.public_token));

    applyPublicHeaders(res);
    await recordClinicalDocumentEvent({
      table: REF_EVENT_TABLE,
      clinic_id: String(doc.clinic_id),
      document_id: String(doc.id),
      event_type: 'pdf_downloaded',
      actor_ip: req.ip ?? null,
      actor_user_agent:
        typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : null,
    });

    await streamValidatableSpecialistReferralPdf(res, snapshot, {
      validation_code: payload.validation_code,
      public_url: publicUrl,
      content_hash: String(doc.content_hash ?? ''),
      issued_at: payload.issued_at,
      expires_at: payload.expires_at,
      disclaimers: payload.disclaimers,
    });
  } catch (e) {
    console.error('[public_specialist_referrals] pdf', e);
    if (!res.headersSent) return res.status(500).json({ error: 'Erro interno' });
  }
};
