import { supabaseAdmin } from '../../config/supabase';
import {
  addDaysIso,
  computeDocumentStatus,
  fetchClinicJsonDefaults,
  generateUniqueCode,
  generateUniquePublicToken,
  loadEncounterIssueParties,
  maskPublicToken,
  recordClinicalDocumentEvent,
  truncateContentHash,
  type ClinicalDocumentScope,
} from './clinicalDocumentValidation';
import {
  buildExamOrderSnapshot,
  computeExamOrderContentHash,
  mapExamRowToSnapshotItem,
  resolveExamOrderPublicUrl,
  resolveExamOrderValidityDays,
  type ExamOrderSnapshot,
} from './examOrderValidation';
import { recordTimelineEvent } from './hubClinicalTimelineController';

const EXAM_DOC_TABLE = 'hub_clinical_exam_order_documents';
const EXAM_EVENT_TABLE = 'hub_clinical_exam_order_document_events';

const EXAM_SELECT = `
  id, clinic_id, pet_id, hub_encounter_id, exam_type, lab_kind, lab_name,
  external_lab_name, clinical_indication, fasting_required, collection_instructions,
  urgency, notes, document_status, status
`;

async function fetchActiveExamsForEncounter(
  clinicId: string,
  encounterId: string,
  examId?: string | null,
): Promise<Record<string, unknown>[]> {
  let q = supabaseAdmin
    .from('hub_clinical_exams')
    .select(EXAM_SELECT)
    .eq('clinic_id', clinicId)
    .eq('hub_encounter_id', encounterId)
    .is('deleted_at', null)
    .neq('document_status', 'cancelled')
    .neq('status', 'cancelled');

  if (examId) q = q.eq('id', examId);

  const { data, error } = await q.order('requested_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

async function nextVersionNo(
  encounterId: string,
  scope: ClinicalDocumentScope,
  examId?: string | null,
): Promise<number> {
  let q = supabaseAdmin
    .from(EXAM_DOC_TABLE)
    .select('version_no')
    .eq('hub_encounter_id', encounterId)
    .eq('scope', scope)
    .order('version_no', { ascending: false })
    .limit(1);

  if (scope === 'single' && examId) q = q.eq('exam_id', examId);

  const { data } = await q.maybeSingle();
  return data ? (data.version_no as number) + 1 : 1;
}

export async function issueExamOrderDocument(opts: {
  clinicId: string;
  hubEncounterId: string;
  scope: ClinicalDocumentScope;
  examId?: string | null;
  issuedBy?: string | null;
  actorUserId?: string | null;
}): Promise<
  | { ok: true; result: { document: Record<string, unknown>; snapshot: ExamOrderSnapshot; public_url: string; content_hash_short: string } }
  | { ok: false; status: number; error: string }
> {
  const partiesLoaded = await loadEncounterIssueParties(opts.clinicId, opts.hubEncounterId);
  if (!partiesLoaded.ok) return partiesLoaded;

  const { parties } = partiesLoaded;

  if (opts.scope === 'single' && !opts.examId) {
    return { ok: false, status: 400, error: 'exam_id obrigatório para emissão individual' };
  }

  let exams: Record<string, unknown>[];
  try {
    exams = await fetchActiveExamsForEncounter(opts.clinicId, opts.hubEncounterId, opts.scope === 'single' ? opts.examId : null);
  } catch (e) {
    return { ok: false, status: 500, error: (e as Error).message };
  }

  if (!exams.length) {
    return { ok: false, status: 409, error: 'Nenhum exame ativo encontrado para emissão' };
  }

  const issuedAt = new Date().toISOString();
  const defaults = await fetchClinicJsonDefaults(opts.clinicId, 'exam_order_defaults');
  const validityDays = resolveExamOrderValidityDays(defaults);
  const customDisclaimer = typeof defaults.disclaimer_text === 'string' ? defaults.disclaimer_text : null;
  const nextVersion = await nextVersionNo(opts.hubEncounterId, opts.scope, opts.examId);

  const snapshot = buildExamOrderSnapshot({
    encounterId: opts.hubEncounterId,
    documentVersion: nextVersion,
    scope: opts.scope,
    issuedAt,
    parties,
    exams: exams.map(mapExamRowToSnapshotItem),
    customDisclaimer,
  });

  const contentHash = computeExamOrderContentHash(snapshot);
  let validationCode: string;
  let publicToken: string;
  try {
    validationCode = await generateUniqueCode('EX', EXAM_DOC_TABLE);
    publicToken = await generateUniquePublicToken(EXAM_DOC_TABLE);
  } catch (e) {
    return { ok: false, status: 500, error: (e as Error).message };
  }

  const publicUrl = resolveExamOrderPublicUrl(publicToken);
  const expiresAt = addDaysIso(issuedAt, validityDays);

  const { data: doc, error: docErr } = await supabaseAdmin
    .from(EXAM_DOC_TABLE)
    .insert({
      clinic_id: opts.clinicId,
      hub_encounter_id: opts.hubEncounterId,
      exam_id: opts.scope === 'single' ? opts.examId : null,
      scope: opts.scope,
      version_no: nextVersion,
      issued_by: opts.issuedBy ?? parties.veterinarian.id,
      issued_at: issuedAt,
      validation_code: validationCode,
      public_token: publicToken,
      validation_url: publicUrl,
      document_status: 'valid',
      content_hash: contentHash,
      snapshot,
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (docErr || !doc) {
    const msg = docErr?.message || 'Erro ao emitir documento';
    if (/column|relation|schema|does not exist/i.test(msg)) {
      return {
        ok: false,
        status: 500,
        error: 'Banco desatualizado: execute as migrations 63–64 de solicitação de exames.',
      };
    }
    return { ok: false, status: 500, error: msg };
  }

  const docId = (doc as { id: string }).id;
  const examIds = exams.map((e) => e.id as string);

  await supabaseAdmin
    .from('hub_clinical_exams')
    .update({ document_status: 'issued', guardian_id: parties.guardian.id })
    .in('id', examIds)
    .eq('clinic_id', opts.clinicId);

  await recordClinicalDocumentEvent({
    table: EXAM_EVENT_TABLE,
    clinic_id: opts.clinicId,
    document_id: docId,
    event_type: 'created',
    actor_user_id: opts.actorUserId ?? null,
    metadata: { validation_code: validationCode, version_no: nextVersion, scope: opts.scope },
  });

  void recordTimelineEvent({
    clinic_id: opts.clinicId,
    pet_id: parties.pet_id,
    hub_case_id: parties.hub_case_id,
    hub_encounter_id: opts.hubEncounterId,
    event_type: 'exam_order_issued',
    ref_type: 'exam_order_document',
    ref_id: docId,
    title: `Solicitação de exames emitida (v${nextVersion})`,
    body: `${validationCode} · ${exams.length} exame(s)`,
    created_by: opts.issuedBy ?? parties.veterinarian.id,
  });

  const enriched = {
    ...(doc as Record<string, unknown>),
    document_status: computeDocumentStatus({ revoked_at: null, expires_at: expiresAt }),
    public_url: publicUrl,
    content_hash_short: truncateContentHash(contentHash),
    public_token_masked: maskPublicToken(publicToken),
  };

  return {
    ok: true,
    result: {
      document: enriched,
      snapshot,
      public_url: publicUrl,
      content_hash_short: truncateContentHash(contentHash),
    },
  };
}

export async function loadExamOrderDocumentForPdf(
  clinicId: string,
  documentId: string,
): Promise<
  | {
      ok: true;
      snapshot: ExamOrderSnapshot;
      validation: {
        validation_code: string;
        public_url: string;
        content_hash: string;
        issued_at: string;
        expires_at: string | null;
        disclaimers: string[];
      };
    }
  | { ok: false; status: number; error: string }
> {
  const { data: doc, error } = await supabaseAdmin
    .from(EXAM_DOC_TABLE)
    .select('*')
    .eq('id', documentId)
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!doc) return { ok: false, status: 404, error: 'Documento não encontrado' };

  const row = doc as Record<string, unknown>;
  const snapshot = row.snapshot as ExamOrderSnapshot;
  if (!snapshot?.exams?.length) {
    return { ok: false, status: 409, error: 'Documento sem snapshot de emissão' };
  }

  const validationCode = String(row.validation_code ?? '');
  const publicUrl =
    (row.validation_url as string | null) ??
    (row.public_token ? resolveExamOrderPublicUrl(String(row.public_token)) : '');

  return {
    ok: true,
    snapshot,
    validation: {
      validation_code: validationCode,
      public_url: publicUrl,
      content_hash: String(row.content_hash ?? ''),
      issued_at: String(row.issued_at ?? snapshot.issued_at),
      expires_at: (row.expires_at as string | null) ?? null,
      disclaimers: snapshot.disclaimers ?? [],
    },
  };
}

export { EXAM_DOC_TABLE, EXAM_EVENT_TABLE, computeDocumentStatus, maskPublicToken, truncateContentHash };
