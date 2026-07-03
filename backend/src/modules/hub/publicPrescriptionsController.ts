import type { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { streamValidatablePrescriptionPdf } from './hubPrescriptionPdf';
import { resolvePrescriptionPublicUrl, snapshotToPdfView, type PrescriptionSnapshot } from './prescriptionValidation';
import {
  buildPublicPrescriptionPayload,
  isPlausiblePublicToken,
  normalizeValidationCode,
} from './publicPrescriptionResponse';
import {
  maybeRecordPrescriptionViewed,
  recordPrescriptionPdfDownloaded,
} from './publicPrescriptionViewAudit';

const PUBLIC_NOT_FOUND = 'Receita não encontrada';

const DOCUMENT_PUBLIC_SELECT =
  'id, clinic_id, prescription_id, version_no, validation_code, public_token, document_status, content_hash, snapshot, issued_at, expires_at, revoked_at, revoke_reason, validation_url';

function applyPublicPrescriptionHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

async function loadPublicDocumentByToken(token: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_prescription_documents')
    .select(DOCUMENT_PUBLIC_SELECT)
    .eq('public_token', token)
    .maybeSingle();
  if (error) {
    console.error('[public_prescriptions] load by token', error);
    throw new Error('LOAD_ERROR');
  }
  return (data as Record<string, unknown> | null) ?? null;
}

async function loadPublicDocumentByCode(code: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from('hub_prescription_documents')
    .select(DOCUMENT_PUBLIC_SELECT)
    .eq('validation_code', code)
    .maybeSingle();
  if (error) {
    console.error('[public_prescriptions] load by code', error);
    throw new Error('LOAD_ERROR');
  }
  return (data as Record<string, unknown> | null) ?? null;
}

function respondPublicPayload(
  req: Request,
  res: Response,
  doc: Record<string, unknown>,
): Response {
  const payload = buildPublicPrescriptionPayload(doc);
  if (!payload) return res.status(404).json({ error: PUBLIC_NOT_FOUND });

  applyPublicPrescriptionHeaders(res);
  void maybeRecordPrescriptionViewed(req, String(doc.clinic_id), String(doc.id));
  return res.json({ prescription: payload });
}

export const validatePublicPrescriptionByCode = async (req: Request, res: Response) => {
  try {
    const rawCode = typeof req.query.code === 'string' ? req.query.code : '';
    const code = normalizeValidationCode(rawCode);
    if (!code) return res.status(400).json({ error: 'Código de validação inválido' });

    const doc = await loadPublicDocumentByCode(code);
    if (!doc) return res.status(404).json({ error: PUBLIC_NOT_FOUND });

    return respondPublicPayload(req, res, doc);
  } catch (e) {
    if ((e as Error)?.message === 'LOAD_ERROR') {
      return res.status(500).json({ error: 'Erro ao validar receita' });
    }
    console.error('[public_prescriptions] validate', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const getPublicPrescriptionByToken = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!isPlausiblePublicToken(token)) {
      return res.status(400).json({ error: 'Token inválido' });
    }

    const doc = await loadPublicDocumentByToken(token);
    if (!doc) return res.status(404).json({ error: PUBLIC_NOT_FOUND });

    return respondPublicPayload(req, res, doc);
  } catch (e) {
    if ((e as Error)?.message === 'LOAD_ERROR') {
      return res.status(500).json({ error: 'Erro ao carregar receita' });
    }
    console.error('[public_prescriptions] get', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const getPublicPrescriptionPdf = async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!isPlausiblePublicToken(token)) {
      return res.status(400).json({ error: 'Token inválido' });
    }

    const doc = await loadPublicDocumentByToken(token);
    if (!doc) return res.status(404).json({ error: PUBLIC_NOT_FOUND });

    const payload = buildPublicPrescriptionPayload(doc);
    if (!payload) return res.status(404).json({ error: PUBLIC_NOT_FOUND });

    const publicUrl =
      (doc.validation_url as string | null) ??
      resolvePrescriptionPublicUrl(String(doc.public_token));

    applyPublicPrescriptionHeaders(res);
    void recordPrescriptionPdfDownloaded(req, String(doc.clinic_id), String(doc.id));

    const pdfView = snapshotToPdfView(doc.snapshot as PrescriptionSnapshot);
    await streamValidatablePrescriptionPdf(res, pdfView, {
      validation_code: payload.validation_code,
      public_url: publicUrl,
      content_hash: String(doc.content_hash ?? ''),
      issued_at: payload.issued_at,
      expires_at: payload.expires_at,
      disclaimers: payload.disclaimers,
    });
  } catch (e) {
    console.error('[public_prescriptions] pdf', e);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Erro ao gerar PDF' });
    }
  }
};
