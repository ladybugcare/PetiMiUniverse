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
  buildSpecialistReferralSnapshot,
  computeSpecialistReferralContentHash,
  mapReferralRowToSnapshotItem,
  resolveSpecialistReferralPublicUrl,
  resolveSpecialistReferralValidityDays,
  type SpecialistReferralSnapshot,
} from './specialistReferralValidation';
import { recordTimelineEvent } from './hubClinicalTimelineController';

const REF_DOC_TABLE = 'hub_clinical_specialist_referral_documents';
const REF_EVENT_TABLE = 'hub_clinical_specialist_referral_document_events';

const REFERRAL_SELECT = `
  id, clinic_id, pet_id, hub_encounter_id, specialty, specialist_name, specialist_contact,
  referral_reason, clinical_summary, priority, notes, status
`;

async function fetchActiveReferralsForEncounter(
  clinicId: string,
  encounterId: string,
  referralId?: string | null,
): Promise<Record<string, unknown>[]> {
  let q = supabaseAdmin
    .from('hub_clinical_specialist_referrals')
    .select(REFERRAL_SELECT)
    .eq('clinic_id', clinicId)
    .eq('hub_encounter_id', encounterId)
    .is('deleted_at', null)
    .neq('status', 'cancelled');

  if (referralId) q = q.eq('id', referralId);

  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

async function nextVersionNo(
  encounterId: string,
  scope: ClinicalDocumentScope,
  referralId?: string | null,
): Promise<number> {
  let q = supabaseAdmin
    .from(REF_DOC_TABLE)
    .select('version_no')
    .eq('hub_encounter_id', encounterId)
    .eq('scope', scope)
    .order('version_no', { ascending: false })
    .limit(1);

  if (scope === 'single' && referralId) q = q.eq('referral_id', referralId);

  const { data } = await q.maybeSingle();
  return data ? (data.version_no as number) + 1 : 1;
}

export async function issueSpecialistReferralDocument(opts: {
  clinicId: string;
  hubEncounterId: string;
  scope: ClinicalDocumentScope;
  referralId?: string | null;
  issuedBy?: string | null;
  actorUserId?: string | null;
}): Promise<
  | { ok: true; result: { document: Record<string, unknown>; snapshot: SpecialistReferralSnapshot; public_url: string; content_hash_short: string } }
  | { ok: false; status: number; error: string }
> {
  const partiesLoaded = await loadEncounterIssueParties(opts.clinicId, opts.hubEncounterId);
  if (!partiesLoaded.ok) return partiesLoaded;

  const { parties } = partiesLoaded;

  if (opts.scope === 'single' && !opts.referralId) {
    return { ok: false, status: 400, error: 'referral_id obrigatório para emissão individual' };
  }

  let referrals: Record<string, unknown>[];
  try {
    referrals = await fetchActiveReferralsForEncounter(
      opts.clinicId,
      opts.hubEncounterId,
      opts.scope === 'single' ? opts.referralId : null,
    );
  } catch (e) {
    return { ok: false, status: 500, error: (e as Error).message };
  }

  if (!referrals.length) {
    return { ok: false, status: 409, error: 'Nenhum encaminhamento ativo encontrado para emissão' };
  }

  const issuedAt = new Date().toISOString();
  const defaults = await fetchClinicJsonDefaults(opts.clinicId, 'specialist_referral_defaults');
  const validityDays = resolveSpecialistReferralValidityDays(defaults);
  const customDisclaimer = typeof defaults.disclaimer_text === 'string' ? defaults.disclaimer_text : null;
  const nextVersion = await nextVersionNo(opts.hubEncounterId, opts.scope, opts.referralId);

  const snapshot = buildSpecialistReferralSnapshot({
    encounterId: opts.hubEncounterId,
    documentVersion: nextVersion,
    scope: opts.scope,
    issuedAt,
    parties,
    referrals: referrals.map(mapReferralRowToSnapshotItem),
    customDisclaimer,
  });

  const contentHash = computeSpecialistReferralContentHash(snapshot);
  let validationCode: string;
  let publicToken: string;
  try {
    validationCode = await generateUniqueCode('RF', REF_DOC_TABLE);
    publicToken = await generateUniquePublicToken(REF_DOC_TABLE);
  } catch (e) {
    return { ok: false, status: 500, error: (e as Error).message };
  }

  const publicUrl = resolveSpecialistReferralPublicUrl(publicToken);
  const expiresAt = addDaysIso(issuedAt, validityDays);

  const { data: doc, error: docErr } = await supabaseAdmin
    .from(REF_DOC_TABLE)
    .insert({
      clinic_id: opts.clinicId,
      hub_encounter_id: opts.hubEncounterId,
      referral_id: opts.scope === 'single' ? opts.referralId : null,
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
        error: 'Banco desatualizado: execute as migrations 65–66 de encaminhamentos.',
      };
    }
    return { ok: false, status: 500, error: msg };
  }

  const docId = (doc as { id: string }).id;
  const referralIds = referrals.map((r) => r.id as string);

  await supabaseAdmin
    .from('hub_clinical_specialist_referrals')
    .update({ status: 'issued', guardian_id: parties.guardian.id })
    .in('id', referralIds)
    .eq('clinic_id', opts.clinicId);

  await recordClinicalDocumentEvent({
    table: REF_EVENT_TABLE,
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
    event_type: 'specialist_referral_issued',
    ref_type: 'specialist_referral_document',
    ref_id: docId,
    title: `Encaminhamento emitido (v${nextVersion})`,
    body: `${validationCode} · ${referrals.length} encaminhamento(s)`,
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

export async function loadSpecialistReferralDocumentForPdf(
  clinicId: string,
  documentId: string,
): Promise<
  | {
      ok: true;
      snapshot: SpecialistReferralSnapshot;
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
    .from(REF_DOC_TABLE)
    .select('*')
    .eq('id', documentId)
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!doc) return { ok: false, status: 404, error: 'Documento não encontrado' };

  const row = doc as Record<string, unknown>;
  const snapshot = row.snapshot as SpecialistReferralSnapshot;
  if (!snapshot?.referrals?.length) {
    return { ok: false, status: 409, error: 'Documento sem snapshot de emissão' };
  }

  const validationCode = String(row.validation_code ?? '');
  const publicUrl =
    (row.validation_url as string | null) ??
    (row.public_token ? resolveSpecialistReferralPublicUrl(String(row.public_token)) : '');

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

export { REF_DOC_TABLE, REF_EVENT_TABLE, computeDocumentStatus, maskPublicToken, truncateContentHash };
