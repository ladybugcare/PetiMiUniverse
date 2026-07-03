import { supabaseAdmin } from '../../config/supabase';
import {
  addDaysIso,
  buildPrescriptionSnapshot,
  computeContentHash,
  computeDocumentStatus,
  generatePublicToken,
  generateValidationCode,
  type LoadedPrescriptionIssueContext,
  mapLoadedIssueContext,
  maskPublicToken,
  resolvePrescriptionPublicUrl,
  resolvePrescriptionValidityDays,
  truncateContentHash,
  type PrescriptionSnapshot,
} from './prescriptionValidation';
import { recordTimelineEvent } from './hubClinicalTimelineController';

const CODE_RETRY_MAX = 8;

async function isValidationCodeTaken(code: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('hub_prescription_documents')
    .select('id')
    .eq('validation_code', code)
    .maybeSingle();
  return Boolean(data);
}

async function isPublicTokenTaken(token: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('hub_prescription_documents')
    .select('id')
    .eq('public_token', token)
    .maybeSingle();
  return Boolean(data);
}

async function generateUniqueValidationCode(): Promise<string> {
  for (let i = 0; i < CODE_RETRY_MAX; i++) {
    const code = generateValidationCode();
    if (!(await isValidationCodeTaken(code))) return code;
  }
  throw new Error('Não foi possível gerar código de validação único');
}

async function generateUniquePublicToken(): Promise<string> {
  for (let i = 0; i < CODE_RETRY_MAX; i++) {
    const token = generatePublicToken();
    if (!(await isPublicTokenTaken(token))) return token;
  }
  throw new Error('Não foi possível gerar token público único');
}

async function fetchPrescriptionDefaults(clinicId: string): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin
    .from('hub_clinic_settings')
    .select('prescription_defaults')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  return ((data as { prescription_defaults?: Record<string, unknown> } | null)?.prescription_defaults ??
    {}) as Record<string, unknown>;
}

async function recordPrescriptionDocumentEvent(opts: {
  clinic_id: string;
  document_id: string;
  event_type: 'created' | 'viewed' | 'pdf_downloaded' | 'revoked';
  actor_user_id?: string | null;
  actor_ip?: string | null;
  actor_user_agent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from('hub_prescription_document_events').insert({
      clinic_id: opts.clinic_id,
      document_id: opts.document_id,
      event_type: opts.event_type,
      actor_user_id: opts.actor_user_id ?? null,
      actor_ip: opts.actor_ip ?? null,
      actor_user_agent: opts.actor_user_agent ?? null,
      metadata: opts.metadata ?? {},
    });
  } catch (e) {
    console.error('[prescription_document_event]', e);
  }
}

export async function loadPrescriptionIssueContext(
  prescriptionId: string,
  clinicId: string,
): Promise<
  | { ok: true; ctx: LoadedPrescriptionIssueContext }
  | { ok: false; status: number; error: string }
> {
  const { data: rx, error: rxErr } = await supabaseAdmin
    .from('hub_prescriptions')
    .select(
      `
      *,
      clinic:clinics(id, name),
      pet:hub_pets(id, name, species, breed),
      guardian:hub_guardians(id, full_name),
      staff:hub_staff_members(id, full_name, crmv, crmv_uf),
      encounter:hub_encounters(id, guardian_id, pet_id, hub_staff_member_id)
    `,
    )
    .eq('id', prescriptionId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();

  if (rxErr) return { ok: false, status: 500, error: rxErr.message };
  if (!rx) return { ok: false, status: 404, error: 'Prescrição não encontrada' };

  const rxRow = rx as Record<string, unknown>;
  if (!rxRow.hub_encounter_id) {
    return { ok: false, status: 409, error: 'Receita validável exige prescrição vinculada a um atendimento' };
  }
  if (!rxRow.pet_id) {
    return { ok: false, status: 409, error: 'Prescrição sem pet vinculado' };
  }
  if (!rxRow.hub_staff_member_id) {
    return { ok: false, status: 409, error: 'Prescrição sem veterinário responsável' };
  }

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from('hub_prescription_items')
    .select('*')
    .eq('prescription_id', prescriptionId)
    .order('order_index');
  if (itemsErr) return { ok: false, status: 500, error: itemsErr.message };
  if (!items?.length) {
    return { ok: false, status: 409, error: 'Adicione ao menos um medicamento antes de emitir' };
  }

  const encounter = (rxRow.encounter ?? null) as
    | { guardian_id?: string | null; pet_id?: string | null; hub_staff_member_id?: string | null }
    | { guardian_id?: string | null; pet_id?: string | null; hub_staff_member_id?: string | null }[]
    | null;
  const enc = Array.isArray(encounter) ? encounter[0] : encounter;

  let guardianEmbed = rxRow.guardian;
  if (!guardianEmbed && enc?.guardian_id) {
    const { data: gRow } = await supabaseAdmin
      .from('hub_guardians')
      .select('id, full_name')
      .eq('id', enc.guardian_id)
      .maybeSingle();
    guardianEmbed = gRow;
  }
  if (!guardianEmbed && rxRow.pet_id) {
    const { data: pgRow } = await supabaseAdmin
      .from('hub_pet_guardians')
      .select('guardian:hub_guardians(id, full_name)')
      .eq('pet_id', rxRow.pet_id)
      .order('role', { ascending: true })
      .limit(1)
      .maybeSingle();
    guardianEmbed = (pgRow as { guardian?: unknown } | null)?.guardian ?? null;
  }

  const ctx = mapLoadedIssueContext(
    rxRow,
    items as Record<string, unknown>[],
    rxRow.clinic,
    rxRow.pet,
    guardianEmbed,
    rxRow.staff,
  );

  return { ok: true, ctx };
}

export type IssuedPrescriptionDocumentResult = {
  document: Record<string, unknown>;
  snapshot: PrescriptionSnapshot;
  public_url: string;
  content_hash_short: string;
};

export async function issueValidatablePrescriptionDocument(opts: {
  prescriptionId: string;
  clinicId: string;
  issuedBy?: string | null;
  actorUserId?: string | null;
}): Promise<
  | { ok: true; result: IssuedPrescriptionDocumentResult }
  | { ok: false; status: number; error: string }
> {
  const loaded = await loadPrescriptionIssueContext(opts.prescriptionId, opts.clinicId);
  if (!loaded.ok) return loaded;

  const { ctx } = loaded;
  const rxRow = ctx.prescription;

  const { data: latest } = await supabaseAdmin
    .from('hub_prescription_documents')
    .select('version_no')
    .eq('prescription_id', opts.prescriptionId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = latest ? (latest.version_no as number) + 1 : 1;
  const issuedAt = new Date().toISOString();
  const defaults = await fetchPrescriptionDefaults(opts.clinicId);
  const validityDays = resolvePrescriptionValidityDays(defaults);
  const customDisclaimer =
    typeof defaults.disclaimer_text === 'string' ? defaults.disclaimer_text : null;

  const snapshot = buildPrescriptionSnapshot({
    prescriptionId: opts.prescriptionId,
    documentVersion: nextVersion,
    issuedAt,
    notes: (rxRow.notes as string | null | undefined) ?? null,
    clinic: ctx.clinic,
    pet: ctx.pet,
    guardian: ctx.guardian,
    veterinarian: ctx.veterinarian,
    items: ctx.items,
    customDisclaimer,
  });

  const contentHash = computeContentHash(snapshot);
  const validationCode = await generateUniqueValidationCode();
  const publicToken = await generateUniquePublicToken();
  const publicUrl = resolvePrescriptionPublicUrl(publicToken);
  const expiresAt = addDaysIso(issuedAt, validityDays);

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('hub_prescription_documents')
    .insert({
      clinic_id: opts.clinicId,
      prescription_id: opts.prescriptionId,
      version_no: nextVersion,
      issued_by: opts.issuedBy ?? ctx.veterinarian.id,
      issued_at: issuedAt,
      signature_status: 'none',
      validation_code: validationCode,
      public_token: publicToken,
      document_status: 'valid',
      content_hash: contentHash,
      snapshot,
      expires_at: expiresAt,
      validation_url: publicUrl,
    })
    .select('*')
    .single();

  if (docErr || !doc) {
    const msg = docErr?.message || 'Erro ao emitir documento';
    if (/column|relation|schema|does not exist/i.test(msg)) {
      return {
        ok: false,
        status: 500,
        error:
          'Banco desatualizado: execute as migrations 58–61 da receita validável (hub_prescription_documents e colunas de validação).',
      };
    }
    return { ok: false, status: 500, error: msg };
  }

  const docId = (doc as { id: string }).id;

  await supabaseAdmin
    .from('hub_prescriptions')
    .update({
      status: 'issued',
      guardian_id: ctx.guardian.id,
      hub_staff_member_id: ctx.veterinarian.id,
    })
    .eq('id', opts.prescriptionId)
    .eq('clinic_id', opts.clinicId);

  await recordPrescriptionDocumentEvent({
    clinic_id: opts.clinicId,
    document_id: docId,
    event_type: 'created',
    actor_user_id: opts.actorUserId ?? null,
    metadata: { validation_code: validationCode, version_no: nextVersion },
  });

  void recordTimelineEvent({
    clinic_id: opts.clinicId,
    pet_id: String(rxRow.pet_id),
    hub_case_id: (rxRow.hub_case_id as string | null | undefined) ?? null,
    hub_encounter_id: (rxRow.hub_encounter_id as string | null | undefined) ?? null,
    event_type: 'prescription_issued',
    ref_type: 'prescription_document',
    ref_id: docId,
    title: `Receita validável emitida (v${nextVersion})`,
    body: `${validationCode} · ${ctx.items.length} medicamento(s)`,
    created_by: opts.issuedBy ?? ctx.veterinarian.id,
  });

  const enriched = {
    ...(doc as Record<string, unknown>),
    document_status: computeDocumentStatus({
      revoked_at: null,
      expires_at: expiresAt,
    }),
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

export async function loadPrescriptionDocumentForPdf(
  prescriptionId: string,
  clinicId: string,
  documentId: string,
): Promise<
  | {
      ok: true;
      snapshot: PrescriptionSnapshot;
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
    .from('hub_prescription_documents')
    .select('*')
    .eq('id', documentId)
    .eq('prescription_id', prescriptionId)
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!doc) return { ok: false, status: 404, error: 'Documento não encontrado' };

  const row = doc as Record<string, unknown>;
  const snapshot = row.snapshot as PrescriptionSnapshot;
  if (!snapshot?.medications?.length) {
    return { ok: false, status: 409, error: 'Documento sem snapshot de emissão' };
  }

  const validationCode = String(row.validation_code ?? '');
  const publicUrl =
    (row.validation_url as string | null) ??
    (row.public_token ? resolvePrescriptionPublicUrl(String(row.public_token)) : '');
  const contentHash = String(row.content_hash ?? '');

  return {
    ok: true,
    snapshot,
    validation: {
      validation_code: validationCode,
      public_url: publicUrl,
      content_hash: contentHash,
      issued_at: String(row.issued_at ?? snapshot.issued_at),
      expires_at: (row.expires_at as string | null) ?? null,
      disclaimers: snapshot.disclaimers ?? [],
    },
  };
}

export { recordPrescriptionDocumentEvent, maskPublicToken, computeDocumentStatus, truncateContentHash };
