import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import {
  computeDocumentStatus,
  maskPublicToken,
  recordClinicalDocumentEvent,
  truncateContentHash,
} from './clinicalDocumentValidation';
import {
  issueSpecialistReferralDocument,
  loadSpecialistReferralDocumentForPdf,
  REF_DOC_TABLE,
  REF_EVENT_TABLE,
} from './specialistReferralDocumentIssue';
import { streamValidatableSpecialistReferralPdf } from './hubSpecialistReferralPdf';
import { recordTimelineEvent } from './hubClinicalTimelineController';
import type { SpecialistReferralSnapshot } from './specialistReferralValidation';

const uuidStr = z.string().uuid();
const prioritySchema = z.enum(['routine', 'urgent']);
const statusSchema = z.enum(['draft', 'active', 'issued', 'cancelled']);
const scopeSchema = z.enum(['single', 'encounter_bundle']);

const REFERRAL_SELECT = `
  id, clinic_id, pet_id, hub_case_id, hub_encounter_id, guardian_id,
  specialty, specialist_name, specialist_contact, referral_reason, clinical_summary,
  priority, status, notes, metadata, requested_by, created_at, updated_at
`;

const createSchema = z
  .object({
    clinic_id: uuidStr,
    pet_id: uuidStr,
    hub_encounter_id: uuidStr.optional().nullable(),
    hub_case_id: uuidStr.optional().nullable(),
    guardian_id: uuidStr.optional().nullable(),
    requested_by: uuidStr.optional().nullable(),
    specialty: z.string().trim().min(1).max(200),
    specialist_name: z.string().trim().max(300).optional().nullable(),
    specialist_contact: z.string().trim().max(500).optional().nullable(),
    referral_reason: z.string().trim().min(1).max(4000),
    clinical_summary: z.string().trim().max(8000).optional().nullable(),
    priority: prioritySchema.optional().default('routine'),
    notes: z.string().trim().max(4000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict();

const patchSchema = z
  .object({
    clinic_id: uuidStr,
    specialty: z.string().trim().min(1).max(200).optional(),
    specialist_name: z.string().trim().max(300).optional().nullable(),
    specialist_contact: z.string().trim().max(500).optional().nullable(),
    referral_reason: z.string().trim().min(1).max(4000).optional(),
    clinical_summary: z.string().trim().max(8000).optional().nullable(),
    priority: prioritySchema.optional(),
    status: statusSchema.optional(),
    notes: z.string().trim().max(4000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    requested_by: uuidStr.optional().nullable(),
  })
  .strict();

async function enrichReferral(row: Record<string, unknown>) {
  const requestedById = row.requested_by as string | null;
  if (!requestedById) return { ...row, requested_by_member: null };
  const { data } = await supabaseAdmin
    .from('hub_staff_members')
    .select('id, full_name')
    .eq('id', requestedById)
    .maybeSingle();
  return { ...row, requested_by_member: data };
}

/** GET /clinical/specialist-referrals */
export const listHubSpecialistReferrals = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });

  let q = supabaseAdmin
    .from('hub_clinical_specialist_referrals')
    .select(REFERRAL_SELECT)
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (req.query.pet_id) {
    const v = uuidStr.safeParse(req.query.pet_id);
    if (v.success) q = q.eq('pet_id', v.data);
  }
  if (req.query.hub_encounter_id) {
    const v = uuidStr.safeParse(req.query.hub_encounter_id);
    if (v.success) q = q.eq('hub_encounter_id', v.data);
  }
  if (req.query.hub_case_id) {
    const v = uuidStr.safeParse(req.query.hub_case_id);
    if (v.success) q = q.eq('hub_case_id', v.data);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ referrals: data ?? [] });
};

/** POST /clinical/specialist-referrals */
export const createHubSpecialistReferral = async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;

  const { data, error } = await supabaseAdmin
    .from('hub_clinical_specialist_referrals')
    .insert({
      ...b,
      status: 'active',
    })
    .select(REFERRAL_SELECT)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const ref = data as Record<string, unknown>;
  void recordTimelineEvent({
    clinic_id: b.clinic_id,
    pet_id: b.pet_id,
    hub_case_id: b.hub_case_id ?? null,
    hub_encounter_id: b.hub_encounter_id ?? null,
    event_type: 'specialist_referral_requested',
    ref_type: 'specialist_referral',
    ref_id: ref.id as string,
    title: `Encaminhamento: ${b.specialty}`,
    body: b.referral_reason,
    created_by: b.requested_by ?? null,
  });

  return res.status(201).json({ referral: data });
};

/** PATCH /clinical/specialist-referrals/:id */
export const patchHubSpecialistReferral = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'id inválido' });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;

  const { data: current } = await supabaseAdmin
    .from('hub_clinical_specialist_referrals')
    .select('status')
    .eq('id', id.data)
    .eq('clinic_id', b.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!current) return res.status(404).json({ error: 'Encaminhamento não encontrado' });
  if ((current as { status: string }).status === 'issued') {
    return res.status(409).json({ error: 'Encaminhamento emitido não pode ser editado. Revogue o documento primeiro.' });
  }

  const patch: Record<string, unknown> = {};
  for (const key of [
    'specialty',
    'specialist_name',
    'specialist_contact',
    'referral_reason',
    'clinical_summary',
    'priority',
    'status',
    'notes',
    'metadata',
    'requested_by',
  ] as const) {
    if (b[key] !== undefined) patch[key] = b[key];
  }

  const { data, error } = await supabaseAdmin
    .from('hub_clinical_specialist_referrals')
    .update(patch)
    .eq('id', id.data)
    .eq('clinic_id', b.clinic_id)
    .select(REFERRAL_SELECT)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Encaminhamento não encontrado' });

  const enriched = await enrichReferral(data as Record<string, unknown>);
  return res.json({ referral: enriched });
};

/** DELETE /clinical/specialist-referrals/:id */
export const deleteHubSpecialistReferral = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!id.success || !clinic_id.success) {
    return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
  }

  const { error } = await supabaseAdmin
    .from('hub_clinical_specialist_referrals')
    .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
    .eq('id', id.data)
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(204).send();
};

const issueDocSchema = z
  .object({
    clinic_id: uuidStr,
    hub_encounter_id: uuidStr,
    scope: scopeSchema.default('encounter_bundle'),
    issued_by: uuidStr.optional().nullable(),
  })
  .strict();

/** POST /clinical/specialist-referrals/:id/documents */
export const issueSpecialistReferralDocumentHandler = async (req: Request, res: Response) => {
  const referralId = uuidStr.safeParse(req.params.id);
  const parsed = issueDocSchema.safeParse(req.body);
  if (!referralId.success || !parsed.success) {
    return res.status(400).json({ error: 'Parâmetros inválidos' });
  }

  const { data: ref } = await supabaseAdmin
    .from('hub_clinical_specialist_referrals')
    .select('hub_encounter_id')
    .eq('id', referralId.data)
    .eq('clinic_id', parsed.data.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!ref?.hub_encounter_id) {
    return res.status(404).json({ error: 'Encaminhamento não encontrado ou sem atendimento' });
  }

  const actorUserId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  const scope = parsed.data.scope;
  const issued = await issueSpecialistReferralDocument({
    clinicId: parsed.data.clinic_id,
    hubEncounterId: parsed.data.hub_encounter_id || (ref.hub_encounter_id as string),
    scope,
    referralId: scope === 'single' ? referralId.data : null,
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

/** POST /clinical/specialist-referrals/orders/issue — emissão consolidada por encounter */
export const issueSpecialistReferralBundleHandler = async (req: Request, res: Response) => {
  const parsed = issueDocSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const actorUserId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  const issued = await issueSpecialistReferralDocument({
    clinicId: parsed.data.clinic_id,
    hubEncounterId: parsed.data.hub_encounter_id,
    scope: parsed.data.scope,
    referralId: null,
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

/** GET /clinical/specialist-referrals/encounter/:encounterId/documents */
export const listSpecialistReferralDocumentsByEncounter = async (req: Request, res: Response) => {
  const encounterId = uuidStr.safeParse(req.params.encounterId);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!encounterId.success || !clinic_id.success) {
    return res.status(400).json({ error: 'encounterId e clinic_id obrigatórios' });
  }

  const { data, error } = await supabaseAdmin
    .from(REF_DOC_TABLE)
    .select(
      'id, hub_encounter_id, referral_id, scope, version_no, issued_by, issued_at, validation_code, public_token, document_status, content_hash, expires_at, revoked_at, validation_url, snapshot',
    )
    .eq('clinic_id', clinic_id.data)
    .eq('hub_encounter_id', encounterId.data)
    .order('issued_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const rows = (data ?? []) as Record<string, unknown>[];
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
    };
  });

  return res.json({ documents: enriched });
};

const revokeSchema = z
  .object({
    clinic_id: uuidStr,
    reason: z.string().trim().min(10).max(500),
    revoked_by: uuidStr.optional().nullable(),
  })
  .strict();

/** POST /clinical/specialist-referrals/:id/documents/:docId/revoke */
export const revokeSpecialistReferralDocument = async (req: Request, res: Response) => {
  const referralId = uuidStr.safeParse(req.params.id);
  const docId = uuidStr.safeParse(req.params.docId);
  const parsed = revokeSchema.safeParse(req.body);
  if (!referralId.success || !docId.success || !parsed.success) {
    return res.status(400).json({ error: 'Parâmetros inválidos' });
  }

  const { clinic_id, reason, revoked_by } = parsed.data;

  const { data: doc, error: docErr } = await supabaseAdmin
    .from(REF_DOC_TABLE)
    .select('id, clinic_id, hub_encounter_id, version_no, revoked_at')
    .eq('id', docId.data)
    .eq('clinic_id', clinic_id)
    .maybeSingle();

  if (docErr) return res.status(500).json({ error: docErr.message });
  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
  if (doc.revoked_at) return res.status(409).json({ error: 'Documento já revogado' });

  const now = new Date().toISOString();
  const actorUserId = (req as Request & { user?: { id?: string } }).user?.id ?? null;

  const { error: upErr } = await supabaseAdmin
    .from(REF_DOC_TABLE)
    .update({
      revoked_at: now,
      revoked_by: revoked_by ?? null,
      revoke_reason: reason,
      document_status: 'revoked',
    })
    .eq('id', docId.data);

  if (upErr) return res.status(500).json({ error: upErr.message });

  await recordClinicalDocumentEvent({
    table: REF_EVENT_TABLE,
    clinic_id,
    document_id: docId.data,
    event_type: 'revoked',
    actor_user_id: actorUserId,
    metadata: { reason },
  });

  return res.json({ ok: true });
};

/** GET /clinical/specialist-referrals/:id/pdf?document_id= */
export const getHubSpecialistReferralPdf = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  const document_id = uuidStr.safeParse(req.query.document_id);
  if (!clinic_id.success || !document_id.success) {
    return res.status(400).json({ error: 'clinic_id e document_id obrigatórios' });
  }

  const loaded = await loadSpecialistReferralDocumentForPdf(clinic_id.data, document_id.data);
  if (!loaded.ok) return res.status(loaded.status).json({ error: loaded.error });

  const actorUserId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  await recordClinicalDocumentEvent({
    table: REF_EVENT_TABLE,
    clinic_id: clinic_id.data,
    document_id: document_id.data,
    event_type: 'pdf_downloaded',
    actor_user_id: actorUserId,
  });

  await streamValidatableSpecialistReferralPdf(res, loaded.snapshot, loaded.validation);
};

export function buildPublicSpecialistReferralPayload(doc: Record<string, unknown>) {
  const snapshot = doc.snapshot as SpecialistReferralSnapshot | null | undefined;
  if (!snapshot?.referrals?.length) return null;

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
    referrals: snapshot.referrals,
    disclaimers: snapshot.disclaimers ?? [],
  };
}
