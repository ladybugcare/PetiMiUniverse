import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import {
  computeDocumentStatus,
  EXAM_DOC_TABLE,
  EXAM_EVENT_TABLE,
  issueExamOrderDocument,
  loadExamOrderDocumentForPdf,
  maskPublicToken,
  truncateContentHash,
} from './examOrderDocumentIssue';
import { recordClinicalDocumentEvent } from './clinicalDocumentValidation';
import { streamValidatableExamOrderPdf } from './hubExamOrderPdf';
import { recordTimelineEvent } from './hubClinicalTimelineController';
import type { ExamOrderSnapshot } from './examOrderValidation';

const uuidStr = z.string().uuid();
const scopeSchema = z.enum(['single', 'encounter_bundle']);

const issueSchema = z
  .object({
    clinic_id: uuidStr,
    hub_encounter_id: uuidStr,
    scope: scopeSchema.default('encounter_bundle'),
    exam_id: uuidStr.optional().nullable(),
    issued_by: uuidStr.optional().nullable(),
  })
  .strict();

const revokeSchema = z
  .object({
    clinic_id: uuidStr,
    reason: z.string().trim().min(10).max(500),
    revoked_by: uuidStr.optional().nullable(),
  })
  .strict();

/** POST /clinical/exams/orders/issue */
export const issueExamOrderDocumentHandler = async (req: Request, res: Response) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const actorUserId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  const issued = await issueExamOrderDocument({
    clinicId: parsed.data.clinic_id,
    hubEncounterId: parsed.data.hub_encounter_id,
    scope: parsed.data.scope,
    examId: parsed.data.exam_id ?? null,
    issuedBy: parsed.data.issued_by ?? null,
    actorUserId,
  });

  if (!issued.ok) return res.status(issued.status).json({ error: issued.error });
  return res.status(201).json({
    document: issued.result.document,
    snapshot: issued.result.snapshot,
    public_url: issued.result.public_url,
    content_hash_short: issued.result.content_hash_short,
  });
};

/** GET /clinical/exams/:id/order-documents */
export const listExamOrderDocuments = async (req: Request, res: Response) => {
  const examId = uuidStr.safeParse(req.params.id);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!examId.success || !clinic_id.success) {
    return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
  }

  const { data: exam } = await supabaseAdmin
    .from('hub_clinical_exams')
    .select('hub_encounter_id')
    .eq('id', examId.data)
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .maybeSingle();

  if (!exam?.hub_encounter_id) {
    return res.json({ documents: [] });
  }

  const { data, error } = await supabaseAdmin
    .from(EXAM_DOC_TABLE)
    .select(
      'id, hub_encounter_id, exam_id, scope, version_no, issued_by, issued_at, validation_code, document_status, content_hash, expires_at, revoked_at, validation_url, snapshot',
    )
    .eq('clinic_id', clinic_id.data)
    .eq('hub_encounter_id', exam.hub_encounter_id)
    .or(`exam_id.eq.${examId.data},scope.eq.encounter_bundle`)
    .order('version_no', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const rows = (data ?? []) as Record<string, unknown>[];
  const enriched = rows.map((r) => {
    const contentHash = r.content_hash as string | null;
    return {
      ...r,
      document_status: computeDocumentStatus({
        revoked_at: r.revoked_at as string | null,
        expires_at: r.expires_at as string | null,
      }),
      content_hash_short: contentHash ? truncateContentHash(contentHash) : null,
    };
  });

  return res.json({ documents: enriched });
};

/** GET /clinical/exams/encounter/:encounterId/order-documents */
export const listExamOrderDocumentsByEncounter = async (req: Request, res: Response) => {
  const encounterId = uuidStr.safeParse(req.params.encounterId);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!encounterId.success || !clinic_id.success) {
    return res.status(400).json({ error: 'encounterId e clinic_id obrigatórios' });
  }

  const { data, error } = await supabaseAdmin
    .from(EXAM_DOC_TABLE)
    .select(
      'id, hub_encounter_id, exam_id, scope, version_no, issued_by, issued_at, validation_code, public_token, document_status, content_hash, expires_at, revoked_at, validation_url, snapshot',
    )
    .eq('clinic_id', clinic_id.data)
    .eq('hub_encounter_id', encounterId.data)
    .order('issued_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const rows = (data ?? []) as Record<string, unknown>[];
  const staffIds = [...new Set(rows.map((r) => r.issued_by as string).filter(Boolean))];
  const staffMap = new Map<string, { id: string; full_name: string }>();
  if (staffIds.length) {
    const { data: staffRows } = await supabaseAdmin
      .from('hub_staff_members')
      .select('id, full_name')
      .in('id', staffIds);
    for (const s of staffRows ?? []) {
      staffMap.set((s as { id: string }).id, s as { id: string; full_name: string });
    }
  }

  const enriched = rows.map((r) => {
    const contentHash = r.content_hash as string | null;
    const publicToken = r.public_token as string | null;
    return {
      ...r,
      public_token: undefined,
      public_token_masked: publicToken ? maskPublicToken(publicToken) : null,
      document_status: computeDocumentStatus({
        revoked_at: r.revoked_at as string | null,
        expires_at: r.expires_at as string | null,
      }),
      content_hash_short: contentHash ? truncateContentHash(contentHash) : null,
      issued_by_member: staffMap.get(r.issued_by as string) ?? null,
    };
  });

  return res.json({ documents: enriched });
};

/** POST /clinical/exams/order-documents/:docId/revoke */
export const revokeExamOrderDocument = async (req: Request, res: Response) => {
  const docId = uuidStr.safeParse(req.params.docId);
  const parsed = revokeSchema.safeParse(req.body);
  if (!docId.success || !parsed.success) {
    return res.status(400).json({ error: 'Parâmetros inválidos' });
  }

  const { clinic_id, reason, revoked_by } = parsed.data;

  const { data: doc, error: docErr } = await supabaseAdmin
    .from(EXAM_DOC_TABLE)
    .select('id, clinic_id, hub_encounter_id, version_no, validation_code, revoked_at, expires_at')
    .eq('id', docId.data)
    .eq('clinic_id', clinic_id)
    .maybeSingle();

  if (docErr) return res.status(500).json({ error: docErr.message });
  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
  if (doc.revoked_at) return res.status(409).json({ error: 'Documento já revogado' });

  const now = new Date().toISOString();
  const actorUserId = (req as Request & { user?: { id?: string } }).user?.id ?? null;

  const { error: upErr } = await supabaseAdmin
    .from(EXAM_DOC_TABLE)
    .update({
      revoked_at: now,
      revoked_by: revoked_by ?? null,
      revoke_reason: reason,
      document_status: 'revoked',
    })
    .eq('id', docId.data);

  if (upErr) return res.status(500).json({ error: upErr.message });

  await recordClinicalDocumentEvent({
    table: EXAM_EVENT_TABLE,
    clinic_id,
    document_id: docId.data,
    event_type: 'revoked',
    actor_user_id: actorUserId,
    metadata: { reason },
  });

  const { data: enc } = await supabaseAdmin
    .from('hub_encounters')
    .select('pet_id, hub_case_id')
    .eq('id', doc.hub_encounter_id)
    .maybeSingle();

  if (enc) {
    void recordTimelineEvent({
      clinic_id,
      pet_id: enc.pet_id as string,
      hub_case_id: (enc.hub_case_id as string | null) ?? null,
      hub_encounter_id: doc.hub_encounter_id as string,
      event_type: 'exam_order_revoked',
      ref_type: 'exam_order_document',
      ref_id: docId.data,
      title: `Solicitação de exames revogada (v${doc.version_no})`,
      body: reason,
      created_by: revoked_by ?? null,
    });
  }

  return res.json({ ok: true });
};

/** GET /clinical/exams/:id/pdf?document_id= */
export const getHubExamOrderPdf = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  const document_id = uuidStr.safeParse(req.query.document_id);
  if (!clinic_id.success || !document_id.success) {
    return res.status(400).json({ error: 'clinic_id e document_id obrigatórios' });
  }

  const loaded = await loadExamOrderDocumentForPdf(clinic_id.data, document_id.data);
  if (!loaded.ok) return res.status(loaded.status).json({ error: loaded.error });

  const actorUserId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  await recordClinicalDocumentEvent({
    table: EXAM_EVENT_TABLE,
    clinic_id: clinic_id.data,
    document_id: document_id.data,
    event_type: 'pdf_downloaded',
    actor_user_id: actorUserId,
  });

  await streamValidatableExamOrderPdf(res, loaded.snapshot, loaded.validation);
};

export function buildPublicExamOrderPayload(doc: Record<string, unknown>) {
  const snapshot = doc.snapshot as ExamOrderSnapshot | null | undefined;
  if (!snapshot?.exams?.length) return null;

  const contentHash = String(doc.content_hash ?? '');
  const status = computeDocumentStatus({
    revoked_at: doc.revoked_at as string | null,
    expires_at: doc.expires_at as string | null,
  });

  return {
    status,
    validation_code: String(doc.validation_code ?? ''),
    issued_at: String(doc.issued_at ?? snapshot.issued_at),
    expires_at: (doc.expires_at as string | null) ?? null,
    revoked_at: (doc.revoked_at as string | null) ?? null,
    revoke_reason: (doc.revoke_reason as string | null) ?? null,
    content_hash_short: contentHash ? truncateContentHash(contentHash) : '—',
    document_version: Number(doc.version_no ?? snapshot.document_version ?? 1),
    scope: snapshot.scope,
    clinic: { name: snapshot.clinic.name },
    pet: snapshot.pet,
    guardian: snapshot.guardian,
    veterinarian: snapshot.veterinarian,
    exams: snapshot.exams,
    disclaimers: snapshot.disclaimers ?? [],
  };
}
