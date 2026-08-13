import type { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { uploadHubClinicalFileToStorage } from '../../utils/hubClinicalFileUpload.js';
import {
  CLINICAL_ATTACHMENTS_MIGRATION_HINT,
  isMissingPostgrestRelation,
} from '../../utils/supabaseSchemaErrors.js';
import { streamPrescriptionPdf, streamValidatablePrescriptionPdf } from './hubPrescriptionPdf';
import { recordTimelineEvent } from './hubClinicalTimelineController';
import { ensureCaseAndAdmissionEncounter, CaseSelectionRequiredError } from './hubClinicalCasesController';
import {
  computeDocumentStatus,
  maskPublicToken,
  snapshotToPdfView,
  truncateContentHash,
} from './prescriptionValidation';
import {
  issueValidatablePrescriptionDocument,
  loadPrescriptionDocumentForPdf,
  recordPrescriptionDocumentEvent,
} from './prescriptionDocumentIssue';

const uuidStr = z.string().uuid();

// ── Pet clinical flags ───────────────────────────────────────────────────────

const flagKeySchema = z.enum(['allergy', 'cardiac', 'aggressive', 'diabetic', 'epileptic', 'other']);

export const listHubPetClinicalFlags = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  const pet_id = uuidStr.safeParse(req.query.pet_id);
  if (!clinic_id.success || !pet_id.success) {
    return res.status(400).json({ error: 'clinic_id e pet_id obrigatórios' });
  }
  const { data, error } = await supabaseAdmin
    .from('hub_pet_clinical_flags')
    .select('*')
    .eq('clinic_id', clinic_id.data)
    .eq('pet_id', pet_id.data)
    .eq('active', true)
    .is('deleted_at', null)
    .order('flag_key');
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ flags: data ?? [] });
};

export const upsertHubPetClinicalFlag = async (req: Request, res: Response) => {
  const parsed = z
    .object({
      clinic_id: uuidStr,
      pet_id: uuidStr,
      flag_key: flagKeySchema,
      label: z.string().trim().min(1).max(120),
      notes: z.string().trim().max(2000).optional().nullable(),
      active: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;
  const { data: existing } = await supabaseAdmin
    .from('hub_pet_clinical_flags')
    .select('id')
    .eq('pet_id', b.pet_id)
    .eq('flag_key', b.flag_key)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('hub_pet_clinical_flags')
      .update({ label: b.label, notes: b.notes ?? null, active: b.active ?? true })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ flag: data });
  }
  const { data, error } = await supabaseAdmin
    .from('hub_pet_clinical_flags')
    .insert({
      clinic_id: b.clinic_id,
      pet_id: b.pet_id,
      flag_key: b.flag_key,
      label: b.label,
      notes: b.notes ?? null,
      active: b.active ?? true,
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ flag: data });
};

// ── Encounter events (evolução) ─────────────────────────────────────────────

export const listHubEncounterEvents = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  const pet_id = uuidStr.safeParse(req.query.pet_id);
  if (!clinic_id.success || !pet_id.success) {
    return res.status(400).json({ error: 'clinic_id e pet_id obrigatórios' });
  }
  const { data, error } = await supabaseAdmin
    .from('hub_encounter_events')
    .select('*')
    .eq('clinic_id', clinic_id.data)
    .eq('pet_id', pet_id.data)
    .is('deleted_at', null)
    .order('event_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ events: data ?? [] });
};

export const createHubEncounterEvent = async (req: Request, res: Response) => {
  const parsed = z
    .object({
      clinic_id: uuidStr,
      pet_id: uuidStr,
      hub_encounter_id: uuidStr.optional().nullable(),
      event_type: z
        .enum(['consultation', 'return_visit', 'hospitalization', 'surgery', 'vaccination', 'exam', 'note'])
        .optional(),
      title: z.string().trim().min(1).max(200),
      body: z.string().trim().max(8000).optional().nullable(),
      event_at: z.string().datetime({ offset: true }).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;
  const { data, error } = await supabaseAdmin
    .from('hub_encounter_events')
    .insert({
      clinic_id: b.clinic_id,
      pet_id: b.pet_id,
      hub_encounter_id: b.hub_encounter_id ?? null,
      event_type: b.event_type ?? 'note',
      title: b.title,
      body: b.body ?? null,
      event_at: b.event_at ?? new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ event: data });
};

// ── Prescriptions ───────────────────────────────────────────────────────────

const prescriptionItemInputSchema = z.object({
  medication_name: z.string().trim().min(1).max(200),
  presentation: z.string().trim().max(200).optional().nullable(),
  concentration: z.string().trim().max(200).optional().nullable(),
  quantity: z.string().trim().max(200).optional().nullable(),
  posology: z.string().trim().max(200).optional().nullable(),
  dosage: z.string().trim().max(200).optional().nullable(),
  frequency: z.string().trim().max(200).optional().nullable(),
  duration: z.string().trim().max(200).optional().nullable(),
  instructions: z.string().trim().max(2000).optional().nullable(),
  hub_inventory_item_id: uuidStr.optional().nullable(),
  administration: z.enum(['home_use', 'administered_in_clinic']).optional().default('home_use'),
});

function mapPrescriptionItemInsert(prescriptionId: string, it: z.infer<typeof prescriptionItemInputSchema>, orderIndex: number) {
  return {
    prescription_id: prescriptionId,
    medication_name: it.medication_name,
    presentation: it.presentation ?? null,
    concentration: it.concentration ?? it.dosage ?? null,
    quantity: it.quantity ?? null,
    posology: it.posology ?? it.frequency ?? null,
    dosage: it.dosage ?? it.concentration ?? null,
    frequency: it.frequency ?? it.posology ?? null,
    duration: it.duration ?? null,
    instructions: it.instructions ?? null,
    hub_inventory_item_id: it.hub_inventory_item_id ?? null,
    administration: it.administration ?? 'home_use',
    order_index: orderIndex,
  };
}

async function resolveEncounterGuardianId(
  encounterId: string | null | undefined,
  petId: string,
): Promise<string | null> {
  if (encounterId) {
    const { data: enc } = await supabaseAdmin
      .from('hub_encounters')
      .select('guardian_id')
      .eq('id', encounterId)
      .maybeSingle();
    if (enc?.guardian_id) return enc.guardian_id as string;
  }
  const { data: pgRow } = await supabaseAdmin
    .from('hub_pet_guardians')
    .select('guardian_id')
    .eq('pet_id', petId)
    .order('role', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (pgRow?.guardian_id as string | null | undefined) ?? null;
}

async function fetchHubPrescriptionWithItems(
  prescriptionId: string,
): Promise<{ prescription: Record<string, unknown>; items: Record<string, unknown>[] } | null> {
  const { data: rx, error: rxErr } = await supabaseAdmin
    .from('hub_prescriptions')
    .select('*')
    .eq('id', prescriptionId)
    .is('deleted_at', null)
    .maybeSingle();
  if (rxErr || !rx) return null;
  const { data: its, error: itErr } = await supabaseAdmin
    .from('hub_prescription_items')
    .select('*')
    .eq('prescription_id', prescriptionId)
    .order('order_index');
  if (itErr) return null;
  return { prescription: rx as Record<string, unknown>, items: its ?? [] };
}

export const listHubPrescriptions = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
  let q = supabaseAdmin
    .from('hub_prescriptions')
    .select('*')
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .order('prescribed_at', { ascending: false })
    .limit(100);
  const pet_id = req.query.pet_id ? uuidStr.safeParse(req.query.pet_id) : null;
  if (pet_id?.success) q = q.eq('pet_id', pet_id.data);
  const rx_case_id = req.query.hub_case_id ? uuidStr.safeParse(req.query.hub_case_id) : null;
  if (rx_case_id?.success) q = q.eq('hub_case_id', rx_case_id.data);
  const rx_encounter_id = req.query.hub_encounter_id ? uuidStr.safeParse(req.query.hub_encounter_id) : null;
  if (rx_encounter_id?.success) q = q.eq('hub_encounter_id', rx_encounter_id.data);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  const ids = (data ?? []).map((p: { id: string }) => p.id);
  let items: Record<string, unknown>[] = [];
  if (ids.length) {
    const { data: rows } = await supabaseAdmin
      .from('hub_prescription_items')
      .select('*')
      .in('prescription_id', ids)
      .order('order_index');
    items = rows ?? [];
  }
  const byRx = new Map<string, Record<string, unknown>[]>();
  for (const it of items) {
    const pid = it.prescription_id as string;
    const arr = byRx.get(pid) ?? [];
    arr.push(it);
    byRx.set(pid, arr);
  }
  return res.json({
    prescriptions: (data ?? []).map((p: Record<string, unknown>) => ({
      ...p,
      items: byRx.get(p.id as string) ?? [],
    })),
  });
};

export const createHubPrescription = async (req: Request, res: Response) => {
  const parsed = z
    .object({
      clinic_id: uuidStr,
      pet_id: uuidStr,
      hub_encounter_id: uuidStr.optional().nullable(),
      hub_case_id: uuidStr.optional().nullable(),
      hub_staff_member_id: uuidStr.optional().nullable(),
      notes: z.string().trim().max(4000).optional().nullable(),
      items: z.array(prescriptionItemInputSchema).min(1),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;

  /** Uma prescrição ativa/rascunho por atendimento: novos itens são anexados à existente. */
  if (b.hub_encounter_id) {
    const { data: issuedList } = await supabaseAdmin
      .from('hub_prescriptions')
      .select('id')
      .eq('hub_encounter_id', b.hub_encounter_id)
      .eq('clinic_id', b.clinic_id)
      .eq('pet_id', b.pet_id)
      .eq('status', 'issued')
      .is('deleted_at', null)
      .limit(1);
    if (issuedList?.length) {
      return res.status(409).json({
        error: 'Prescrição já emitida; não é possível adicionar medicamentos sem reemitir nova versão',
      });
    }

    const { data: existingList } = await supabaseAdmin
      .from('hub_prescriptions')
      .select('id')
      .eq('hub_encounter_id', b.hub_encounter_id)
      .eq('clinic_id', b.clinic_id)
      .eq('pet_id', b.pet_id)
      .in('status', ['draft', 'active'])
      .is('deleted_at', null)
      .order('prescribed_at', { ascending: false })
      .limit(1);
    const existingId = existingList?.[0]?.id as string | undefined;
    if (existingId) {
      const { data: maxRow } = await supabaseAdmin
        .from('hub_prescription_items')
        .select('order_index')
        .eq('prescription_id', existingId)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();
      const baseOrder = typeof maxRow?.order_index === 'number' ? maxRow.order_index + 1 : 0;
      const insertItems = b.items.map((it, i) => mapPrescriptionItemInsert(existingId, it, baseOrder + i));
      const { error: itemsErr } = await supabaseAdmin.from('hub_prescription_items').insert(insertItems);
      if (itemsErr) return res.status(500).json({ error: itemsErr.message });
      if (b.hub_staff_member_id) {
        await supabaseAdmin
          .from('hub_prescriptions')
          .update({ hub_staff_member_id: b.hub_staff_member_id })
          .eq('id', existingId);
      }
      void recordTimelineEvent({
        clinic_id: b.clinic_id,
        pet_id: b.pet_id,
        hub_case_id: b.hub_case_id ?? null,
        hub_encounter_id: b.hub_encounter_id,
        event_type: 'note',
        ref_type: 'prescription',
        ref_id: existingId,
        title: `Itens adicionados à prescrição (${b.items.length})`,
        body: b.items.map((it) => it.medication_name).join(', '),
        created_by: b.hub_staff_member_id ?? null,
      });
      const full = await fetchHubPrescriptionWithItems(existingId);
      if (!full) return res.status(500).json({ error: 'Erro ao recarregar prescrição' });
      return res.status(200).json({
        prescription: { ...full.prescription, items: full.items },
        merged_into_existing: true,
      });
    }
  }

  const guardianId = await resolveEncounterGuardianId(b.hub_encounter_id ?? null, b.pet_id);

  const { data: rx, error: rxErr } = await supabaseAdmin
    .from('hub_prescriptions')
    .insert({
      clinic_id: b.clinic_id,
      pet_id: b.pet_id,
      hub_encounter_id: b.hub_encounter_id ?? null,
      hub_case_id: b.hub_case_id ?? null,
      hub_staff_member_id: b.hub_staff_member_id ?? null,
      guardian_id: guardianId,
      notes: b.notes ?? null,
      status: 'active',
    })
    .select('*')
    .single();
  if (rxErr) return res.status(500).json({ error: rxErr.message });
  const insertItems = b.items.map((it, i) => mapPrescriptionItemInsert((rx as { id: string }).id, it, i));
  const { error: itemsErr } = await supabaseAdmin.from('hub_prescription_items').insert(insertItems);
  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  void recordTimelineEvent({
    clinic_id: b.clinic_id,
    pet_id: b.pet_id,
    hub_case_id: b.hub_case_id ?? null,
    hub_encounter_id: b.hub_encounter_id ?? null,
    event_type: 'prescription_issued',
    ref_type: 'prescription',
    ref_id: (rx as { id: string }).id,
    title: `Prescrição emitida (${b.items.length} item${b.items.length > 1 ? 's' : ''})`,
    body: b.items.map((it) => it.medication_name).join(', '),
    created_by: b.hub_staff_member_id ?? null,
  });

  const full = await fetchHubPrescriptionWithItems((rx as { id: string }).id);
  if (!full) return res.status(500).json({ error: 'Erro ao recarregar prescrição' });
  return res.status(201).json({ prescription: { ...full.prescription, items: full.items } });
};

export const patchHubPrescription = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  const parsed = z
    .object({
      clinic_id: uuidStr,
      notes: z.string().trim().max(4000).optional().nullable(),
      hub_staff_member_id: uuidStr.optional().nullable(),
      items: z.array(prescriptionItemInputSchema).min(1).optional(),
    })
    .safeParse(req.body);
  if (!id.success) return res.status(400).json({ error: id.error.flatten() });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;
  if (b.notes === undefined && !b.items) {
    return res.status(400).json({ error: 'Informe items e/ou notes para atualizar' });
  }

  const { data: rx, error: rxErr } = await supabaseAdmin
    .from('hub_prescriptions')
    .select('id, status, clinic_id')
    .eq('id', id.data)
    .eq('clinic_id', b.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (rxErr) return res.status(500).json({ error: rxErr.message });
  if (!rx) return res.status(404).json({ error: 'Prescrição não encontrada' });
  if (rx.status === 'cancelled') return res.status(409).json({ error: 'Prescrição cancelada não pode ser editada' });
  if (rx.status === 'issued') {
    return res.status(409).json({ error: 'Prescrição já emitida; não é possível editar sem reemitir nova versão' });
  }

  const rowUpdates: Record<string, unknown> = {};
  if (b.notes !== undefined) rowUpdates.notes = b.notes;
  if (b.hub_staff_member_id !== undefined) rowUpdates.hub_staff_member_id = b.hub_staff_member_id;

  if (b.items) {
    const { error: delErr } = await supabaseAdmin.from('hub_prescription_items').delete().eq('prescription_id', id.data);
    if (delErr) return res.status(500).json({ error: delErr.message });
    const insertRows = b.items.map((it, i) => mapPrescriptionItemInsert(id.data, it, i));
    const { error: insErr } = await supabaseAdmin.from('hub_prescription_items').insert(insertRows);
    if (insErr) return res.status(500).json({ error: insErr.message });
  }

  if (Object.keys(rowUpdates).length > 0) {
    const { error: upErr } = await supabaseAdmin.from('hub_prescriptions').update(rowUpdates).eq('id', id.data);
    if (upErr) return res.status(500).json({ error: upErr.message });
  } else if (b.items) {
    const { error: touchErr } = await supabaseAdmin
      .from('hub_prescriptions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id.data);
    if (touchErr) return res.status(500).json({ error: touchErr.message });
  }

  const full = await fetchHubPrescriptionWithItems(id.data);
  if (!full) return res.status(500).json({ error: 'Erro ao recarregar prescrição' });
  return res.json({ prescription: { ...full.prescription, items: full.items } });
};

export const issuePrescriptionDocument = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  const parsed = z
    .object({
      clinic_id: uuidStr,
      issued_by: uuidStr.optional().nullable(),
    })
    .safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: 'Parâmetros inválidos' });
  const { clinic_id, issued_by } = parsed.data;

  const actorUserId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  const issued = await issueValidatablePrescriptionDocument({
    prescriptionId: id.data,
    clinicId: clinic_id,
    issuedBy: issued_by ?? null,
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

export const listPrescriptionDocuments = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!id.success || !clinic_id.success) return res.status(400).json({ error: 'id e clinic_id obrigatórios' });

  const { data, error } = await supabaseAdmin
    .from('hub_prescription_documents')
    .select(
      'id, prescription_id, version_no, pdf_path, issued_by, issued_at, signature_status, created_at, validation_code, public_token, document_status, content_hash, expires_at, revoked_at, validation_url, snapshot',
    )
    .eq('prescription_id', id.data)
    .eq('clinic_id', clinic_id.data)
    .order('version_no', { ascending: false });

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
    const status = computeDocumentStatus({
      revoked_at: r.revoked_at as string | null,
      expires_at: r.expires_at as string | null,
    });
    const contentHash = r.content_hash as string | null;
    const publicToken = r.public_token as string | null;
    return {
      ...r,
      document_status: status,
      public_token: undefined,
      public_token_masked: publicToken ? maskPublicToken(publicToken) : null,
      content_hash_short: contentHash ? truncateContentHash(contentHash) : null,
      issued_by_member: staffMap.get(r.issued_by as string) ?? null,
    };
  });

  return res.json({ documents: enriched });
};

export const revokePrescriptionDocument = async (req: Request, res: Response) => {
  const prescriptionId = uuidStr.safeParse(req.params.id);
  const docId = uuidStr.safeParse(req.params.docId);
  const parsed = z
    .object({
      clinic_id: uuidStr,
      reason: z.string().trim().min(10).max(500),
      revoked_by: uuidStr.optional().nullable(),
    })
    .strict()
    .safeParse(req.body);
  if (!prescriptionId.success || !docId.success || !parsed.success) {
    return res.status(400).json({ error: 'Parâmetros inválidos', details: parsed.success ? undefined : parsed.error.flatten() });
  }
  const { clinic_id, reason, revoked_by } = parsed.data;

  const { data: rx, error: rxErr } = await supabaseAdmin
    .from('hub_prescriptions')
    .select('id, clinic_id, pet_id, hub_case_id, hub_encounter_id')
    .eq('id', prescriptionId.data)
    .eq('clinic_id', clinic_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (rxErr) return res.status(500).json({ error: rxErr.message });
  if (!rx) return res.status(404).json({ error: 'Prescrição não encontrada' });

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('hub_prescription_documents')
    .select('id, clinic_id, prescription_id, version_no, validation_code, revoked_at, expires_at, document_status')
    .eq('id', docId.data)
    .eq('prescription_id', prescriptionId.data)
    .eq('clinic_id', clinic_id)
    .maybeSingle();
  if (docErr) return res.status(500).json({ error: docErr.message });
  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
  if (doc.revoked_at) return res.status(409).json({ error: 'Receita já revogada' });

  const status = computeDocumentStatus({
    revoked_at: null,
    expires_at: doc.expires_at as string | null,
  });
  if (status === 'revoked') {
    return res.status(409).json({ error: 'Receita já revogada' });
  }

  const now = new Date().toISOString();
  const actorUserId = (req as Request & { user?: { id?: string } }).user?.id ?? null;

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('hub_prescription_documents')
    .update({
      revoked_at: now,
      revoked_by: revoked_by ?? null,
      revoke_reason: reason,
      document_status: 'revoked',
    })
    .eq('id', docId.data)
    .select(
      'id, prescription_id, version_no, validation_code, document_status, issued_at, expires_at, revoked_at, validation_url, content_hash',
    )
    .single();
  if (upErr || !updated) return res.status(500).json({ error: upErr?.message || 'Erro ao revogar receita' });

  await recordPrescriptionDocumentEvent({
    clinic_id,
    document_id: docId.data,
    event_type: 'revoked',
    actor_user_id: actorUserId,
    metadata: { reason },
  });

  void recordTimelineEvent({
    clinic_id,
    pet_id: rx.pet_id as string,
    hub_case_id: (rx.hub_case_id as string | null) ?? null,
    hub_encounter_id: (rx.hub_encounter_id as string | null) ?? null,
    event_type: 'note',
    ref_type: 'prescription_document',
    ref_id: docId.data,
    title: `Receita validável revogada (v${doc.version_no})`,
    body: `${doc.validation_code ?? '—'} · ${reason}`,
    created_by: revoked_by ?? null,
  });

  const contentHash = updated.content_hash as string | null;
  return res.json({
    document: {
      ...updated,
      document_status: 'revoked' as const,
      content_hash_short: contentHash ? truncateContentHash(contentHash) : null,
    },
  });
};

export const getHubPrescriptionPdf = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  const document_id = req.query.document_id ? uuidStr.safeParse(req.query.document_id) : null;
  if (!id.success || !clinic_id.success) return res.status(400).json({ error: 'id e clinic_id obrigatórios' });

  if (document_id?.success) {
    const loaded = await loadPrescriptionDocumentForPdf(id.data, clinic_id.data, document_id.data);
    if (!loaded.ok) return res.status(loaded.status).json({ error: loaded.error });

    const actorUserId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
    void recordPrescriptionDocumentEvent({
      clinic_id: clinic_id.data,
      document_id: document_id.data,
      event_type: 'pdf_downloaded',
      actor_user_id: actorUserId,
    });

    const pdfView = snapshotToPdfView(loaded.snapshot);
    await streamValidatablePrescriptionPdf(res, pdfView, loaded.validation);
    return;
  }

  const { data: rx, error } = await supabaseAdmin
    .from('hub_prescriptions')
    .select(
      `
      *,
      clinic:clinics(name, phone, email),
      pet:hub_pets(name, species, breed),
      staff:hub_staff_members(full_name, crmv, crmv_uf)
    `
    )
    .eq('id', id.data)
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!rx) return res.status(404).json({ error: 'Prescrição não encontrada' });

  const [{ data: items, error: itemsErr }, { data: petGuardian }] = await Promise.all([
    supabaseAdmin
      .from('hub_prescription_items')
      .select('*')
      .eq('prescription_id', id.data)
      .order('order_index'),
    supabaseAdmin
      .from('hub_pet_guardians')
      .select('guardian:hub_guardians(full_name, phone)')
      .eq('pet_id', rx.pet_id)
      .order('role', { ascending: true })
      .limit(1),
  ]);
  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  const guardianEmbed = petGuardian?.[0]?.guardian ?? null;
  streamPrescriptionPdf(res, { ...rx, items: items ?? [], guardian: guardianEmbed });
};

// ── Vaccinations ────────────────────────────────────────────────────────────

export const listHubVaccinations = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
  let q = supabaseAdmin
    .from('hub_vaccination_records')
    .select('*')
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .order('administered_at', { ascending: false });
  const pet_id = req.query.pet_id ? uuidStr.safeParse(req.query.pet_id) : null;
  if (pet_id?.success) q = q.eq('pet_id', pet_id.data);
  const hub_case_id = req.query.hub_case_id ? uuidStr.safeParse(req.query.hub_case_id) : null;
  if (hub_case_id?.success) q = q.eq('hub_case_id', hub_case_id.data);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ vaccinations: data ?? [] });
};

export const createHubVaccination = async (req: Request, res: Response) => {
  const parsed = z
    .object({
      clinic_id: uuidStr,
      pet_id: uuidStr,
      hub_encounter_id: uuidStr.optional().nullable(),
      hub_case_id: uuidStr.optional().nullable(),
      vaccine_name: z.string().trim().min(1).max(200),
      batch_number: z.string().trim().max(120).optional().nullable(),
      administered_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      next_dose_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      hub_staff_member_id: uuidStr.optional().nullable(),
      notes: z.string().trim().max(2000).optional().nullable(),
      // Fase 6
      source: z.enum(['in_clinic', 'external']).optional().default('in_clinic'),
      manufacturer: z.string().trim().max(200).optional().nullable(),
      hub_inventory_item_id: uuidStr.optional().nullable(),
      hub_inventory_lot_id: uuidStr.optional().nullable(),
      expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;

  let stockMovementId: string | null = null;

  // Baixa de estoque: vacina aplicada na clínica com item de estoque vinculado
  if (b.source === 'in_clinic' && b.hub_inventory_item_id) {
    const { data: mvmt, error: mvmtErr } = await supabaseAdmin
      .from('hub_stock_movements')
      .insert({
        clinic_id: b.clinic_id,
        hub_inventory_item_id: b.hub_inventory_item_id,
        hub_inventory_lot_id: b.hub_inventory_lot_id ?? null,
        movement_type: 'encounter_out',
        quantity: 1,
        unit: 'dose',
        notes: `Vacina aplicada: ${b.vaccine_name}`,
        hub_encounter_id: b.hub_encounter_id ?? null,
      })
      .select('id')
      .single();
    if (!mvmtErr && mvmt) {
      stockMovementId = (mvmt as { id: string }).id;
    } else if (mvmtErr) {
      console.error('createHubVaccination: erro ao baixar estoque', mvmtErr.message);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('hub_vaccination_records')
    .insert({
      clinic_id: b.clinic_id,
      pet_id: b.pet_id,
      hub_encounter_id: b.hub_encounter_id ?? null,
      hub_case_id: b.hub_case_id ?? null,
      vaccine_name: b.vaccine_name,
      batch_number: b.batch_number ?? null,
      administered_at: b.administered_at,
      next_dose_at: b.next_dose_at ?? null,
      hub_staff_member_id: b.hub_staff_member_id ?? null,
      notes: b.notes ?? null,
      source: b.source,
      manufacturer: b.manufacturer ?? null,
      hub_inventory_item_id: b.hub_inventory_item_id ?? null,
      hub_inventory_lot_id: b.hub_inventory_lot_id ?? null,
      expiry_date: b.expiry_date ?? null,
      stock_movement_id: stockMovementId,
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  void recordTimelineEvent({
    clinic_id: b.clinic_id,
    pet_id: b.pet_id,
    hub_case_id: b.hub_case_id ?? null,
    hub_encounter_id: b.hub_encounter_id ?? null,
    event_type: 'vaccination_applied',
    ref_type: 'vaccination',
    ref_id: (data as { id: string }).id,
    title: `Vacina aplicada: ${b.vaccine_name}`,
    body: b.next_dose_at ? `Próxima dose: ${b.next_dose_at}` : null,
    created_by: b.hub_staff_member_id ?? null,
  });

  return res.status(201).json({ vaccination: data });
};

// ── Clinical attachments ──────────────────────────────────────────────────────

export const listHubClinicalAttachments = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
  let q = supabaseAdmin
    .from('hub_clinical_attachments')
    .select('*')
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false });
  const pet_id = req.query.pet_id ? uuidStr.safeParse(req.query.pet_id) : null;
  const encounter_id = req.query.hub_encounter_id ? uuidStr.safeParse(req.query.hub_encounter_id) : null;
  if (pet_id?.success) q = q.eq('pet_id', pet_id.data);
  if (encounter_id?.success) q = q.eq('hub_encounter_id', encounter_id.data);
  const { data, error } = await q;
  if (error) {
    if (isMissingPostgrestRelation(error)) {
      return res.json({ attachments: [], schema_ready: false, migration_hint: CLINICAL_ATTACHMENTS_MIGRATION_HINT });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json({ attachments: data ?? [], schema_ready: true });
};

export const createHubClinicalAttachment = async (req: Request, res: Response) => {
  const parsed = z
    .object({
      clinic_id: uuidStr,
      pet_id: uuidStr,
      hub_encounter_id: uuidStr.optional().nullable(),
      hub_exam_id: uuidStr.optional().nullable(),
      file_name: z.string().trim().min(1).max(255),
      storage_path: z.string().trim().min(1).max(500),
      mime_type: z.string().trim().max(120).optional().nullable(),
      file_size_bytes: z.number().int().optional().nullable(),
      title: z.string().trim().max(200).optional().nullable(),
      notes: z.string().trim().max(2000).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabaseAdmin.from('hub_clinical_attachments').insert(parsed.data).select('*').single();
  if (error) {
    if (isMissingPostgrestRelation(error)) {
      return res.status(503).json({ error: CLINICAL_ATTACHMENTS_MIGRATION_HINT });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.status(201).json({ attachment: data });
};

const clinicalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas PDF, PNG, JPG ou WEBP são permitidos.'));
  },
}).single('file');

/** POST /api/hub/clinical/attachments/upload — multipart: file + clinic_id, pet_id, hub_encounter_id?, title? */
export const uploadHubClinicalAttachment = (req: Request, res: Response): void => {
  clinicalUpload(req, res, async (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado (campo: file)' });
    }
    const parsed = z
      .object({
        clinic_id: uuidStr,
        pet_id: uuidStr,
        hub_encounter_id: uuidStr.optional().nullable(),
        hub_exam_id: uuidStr.optional().nullable(),
        title: z.string().trim().max(200).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;
    try {
      const { url, path } = await uploadHubClinicalFileToStorage(
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
        },
        b.clinic_id,
        b.pet_id,
      );
      const { data, error } = await supabaseAdmin
        .from('hub_clinical_attachments')
        .insert({
          clinic_id: b.clinic_id,
          pet_id: b.pet_id,
          hub_encounter_id: b.hub_encounter_id ?? null,
          hub_exam_id: b.hub_exam_id ?? null,
          file_name: req.file.originalname,
          storage_path: url,
          mime_type: req.file.mimetype,
          file_size_bytes: req.file.size,
          title: b.title ?? req.file.originalname,
          notes: b.notes ?? null,
        })
        .select('*')
        .single();
      if (error) {
        if (isMissingPostgrestRelation(error)) {
          return res.status(503).json({ error: CLINICAL_ATTACHMENTS_MIGRATION_HINT });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json({ attachment: data });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao enviar anexo';
      return res.status(500).json({ error: msg });
    }
  });
};

// ── Hospital beds & hospitalizations ────────────────────────────────────────

export const listHubHospitalBeds = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
  let q = supabaseAdmin
    .from('hub_hospital_beds')
    .select('*')
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .order('code');
  const unit_id = req.query.unit_id ? uuidStr.safeParse(req.query.unit_id) : null;
  if (unit_id?.success) q = q.eq('unit_id', unit_id.data);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ beds: data ?? [] });
};

export const createHubHospitalBed = async (req: Request, res: Response) => {
  const parsed = z
    .object({
      clinic_id: uuidStr,
      unit_id: uuidStr.optional().nullable(),
      code: z.string().trim().min(1).max(40),
      label: z.string().trim().max(120).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabaseAdmin.from('hub_hospital_beds').insert(parsed.data).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ bed: data });
};

export const listHubHospitalizations = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
  let q = supabaseAdmin
    .from('hub_hospitalizations')
    .select('*, hub_hospital_beds(code, label), hub_pets(name), hub_guardians(full_name)')
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .order('admitted_at', { ascending: false });
  const status = req.query.status ? z.string().safeParse(req.query.status) : null;
  if (status?.success) q = q.eq('status', status.data);
  const hosp_case_id = req.query.hub_case_id ? uuidStr.safeParse(req.query.hub_case_id) : null;
  if (hosp_case_id?.success) q = q.eq('hub_case_id', hosp_case_id.data);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ hospitalizations: data ?? [] });
};

export const createHubHospitalization = async (req: Request, res: Response) => {
  const parsed = z
    .object({
      clinic_id: uuidStr,
      unit_id: uuidStr.optional().nullable(),
      pet_id: uuidStr,
      guardian_id: uuidStr.optional().nullable(),
      hub_encounter_id: uuidStr.optional().nullable(),
      hub_case_id: uuidStr.optional().nullable(),
      create_new_case: z.boolean().optional(),
      new_case_title: z.string().trim().max(500).optional().nullable(),
      hub_hospital_bed_id: uuidStr.optional().nullable(),
      hub_staff_member_id: uuidStr.optional().nullable(),
      admission_notes: z.string().trim().max(4000).optional().nullable(),
      reason: z.string().trim().max(1000).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;

  let caseId: string;
  let encounterId: string;
  try {
    const resolved = await ensureCaseAndAdmissionEncounter({
      clinic_id: b.clinic_id,
      unit_id: b.unit_id,
      pet_id: b.pet_id,
      guardian_id: b.guardian_id,
      hub_encounter_id: b.hub_encounter_id,
      hub_case_id: b.hub_case_id,
      create_new_case: b.create_new_case,
      new_case_title: b.new_case_title,
      encounter_chief_complaint: b.reason ?? b.admission_notes ?? 'Admissão de internação',
    });
    caseId = resolved.case_id;
    encounterId = resolved.encounter_id;
  } catch (e) {
    if (e instanceof CaseSelectionRequiredError) {
      return res.status(409).json({ error: e.message, code: e.code });
    }
    return res.status(400).json({ error: (e as Error)?.message });
  }

  const { data, error } = await supabaseAdmin
    .from('hub_hospitalizations')
    .insert({
      clinic_id: b.clinic_id,
      unit_id: b.unit_id ?? null,
      pet_id: b.pet_id,
      guardian_id: b.guardian_id ?? null,
      hub_case_id: caseId,
      hub_encounter_id: encounterId,
      hub_hospital_bed_id: b.hub_hospital_bed_id ?? null,
      hub_staff_member_id: b.hub_staff_member_id ?? null,
      admission_notes: b.admission_notes ?? null,
      reason: b.reason ?? null,
      status: 'active',
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (b.hub_hospital_bed_id) {
    await supabaseAdmin.from('hub_hospital_beds').update({ status: 'occupied' }).eq('id', b.hub_hospital_bed_id);
  }

  void recordTimelineEvent({
    clinic_id: b.clinic_id,
    pet_id: b.pet_id,
    hub_case_id: caseId,
    hub_encounter_id: encounterId,
    event_type: 'hospitalization_started',
    ref_type: 'hospitalization',
    ref_id: (data as { id: string }).id,
    title: 'Internação iniciada',
    body: b.reason ?? b.admission_notes ?? null,
    created_by: b.hub_staff_member_id ?? null,
  });

  return res.status(201).json({ hospitalization: data });
};

export const patchHubHospitalization = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  const parsed = z
    .object({
      clinic_id: uuidStr,
      status: z.enum(['active', 'discharged', 'death', 'transferred', 'cancelled']).optional(),
      discharge_notes: z.string().trim().max(4000).optional().nullable(),
      reason: z.string().trim().max(1000).optional().nullable(),
      hub_case_id: uuidStr.optional().nullable(),
    })
    .safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
  const { clinic_id, ...patch } = parsed.data;
  const { data: existing, error: getErr } = await supabaseAdmin
    .from('hub_hospitalizations')
    .select('id, hub_hospital_bed_id, status')
    .eq('id', id.data)
    .eq('clinic_id', clinic_id)
    .maybeSingle();
  if (getErr) return res.status(500).json({ error: getErr.message });
  if (!existing) return res.status(404).json({ error: 'Internação não encontrada' });

  const update: Record<string, unknown> = { ...patch };
  if (patch.status === 'discharged') {
    update.discharged_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('hub_hospitalizations')
    .update(update)
    .eq('id', id.data)
    .eq('clinic_id', clinic_id)
    .select('*, hub_hospital_beds(code, label), hub_pets(name), hub_guardians(full_name)')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });

  const discharged = patch.status === 'discharged' || patch.status === 'death' || patch.status === 'transferred';
  if (discharged && existing.hub_hospital_bed_id) {
    await supabaseAdmin
      .from('hub_hospital_beds')
      .update({ status: 'available' })
      .eq('id', existing.hub_hospital_bed_id);
  }

  const hospData = data as Record<string, unknown> | null;
  if (hospData) {
    const closeStatus = patch.status;
    if (closeStatus === 'discharged' || closeStatus === 'death' || closeStatus === 'transferred') {
      const timelineTitle =
        closeStatus === 'discharged' ? 'Alta da internação' :
        closeStatus === 'death' ? 'Óbito — internação encerrada' :
        'Transferência — internação encerrada';
      void recordTimelineEvent({
        clinic_id,
        pet_id: hospData.pet_id as string,
        hub_case_id: hospData.hub_case_id as string | null,
        hub_encounter_id: hospData.hub_encounter_id as string | null,
        event_type: closeStatus === 'discharged' ? 'hospitalization_discharged' : 'note',
        ref_type: 'hospitalization',
        ref_id: id.data,
        title: timelineTitle,
        body: patch.discharge_notes ?? null,
      });
    }
  }

  return res.json({ hospitalization: data });
};

export const addHubHospitalizationDailyNote = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  const parsed = z
    .object({
      note_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      evolution_notes: z.string().trim().min(1).max(8000),
      hub_staff_member_id: uuidStr.optional().nullable(),
    })
    .safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
  const { data, error } = await supabaseAdmin
    .from('hub_hospitalization_daily_notes')
    .upsert({ hospitalization_id: id.data, ...parsed.data }, { onConflict: 'hospitalization_id,note_date' })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ note: data });
};

// ── Hospitalization events ────────────────────────────────────────────────────

const hospitalizationEventKindSchema = z.enum(['vital', 'medication', 'feeding', 'fluid', 'nursing', 'note']);

export const listHubHospitalizationEvents = async (req: Request, res: Response) => {
  const hospitalization_id = uuidStr.safeParse(req.query.hospitalization_id);
  if (!hospitalization_id.success) return res.status(400).json({ error: 'hospitalization_id obrigatório' });

  let q = supabaseAdmin
    .from('hub_hospitalization_events')
    .select('id, hospitalization_id, kind, recorded_at, payload, hub_staff_member_id, created_at')
    .eq('hospitalization_id', hospitalization_id.data)
    .order('recorded_at', { ascending: false })
    .limit(500);

  if (req.query.kind) {
    const k = hospitalizationEventKindSchema.safeParse(req.query.kind);
    if (k.success) q = q.eq('kind', k.data);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ events: data ?? [] });
};

export const createHubHospitalizationEvent = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  const parsed = z
    .object({
      kind: hospitalizationEventKindSchema,
      recorded_at: z.string().datetime({ offset: true }).optional(),
      payload: z.record(z.string(), z.unknown()).optional().default({}),
      hub_staff_member_id: uuidStr.optional().nullable(),
    })
    .safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
  const b = parsed.data;
  const { data, error } = await supabaseAdmin
    .from('hub_hospitalization_events')
    .insert({
      hospitalization_id: id.data,
      kind: b.kind,
      recorded_at: b.recorded_at ?? new Date().toISOString(),
      payload: b.payload,
      hub_staff_member_id: b.hub_staff_member_id ?? null,
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ event: data });
};

// ── Surgeries ─────────────────────────────────────────────────────────────────

export const listHubSurgeries = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
  let q = supabaseAdmin
    .from('hub_surgeries')
    .select('*, hub_pets(name), hub_guardians(full_name)')
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true });
  const status = req.query.status ? z.string().safeParse(req.query.status) : null;
  if (status?.success) q = q.eq('status', status.data);
  const surg_case_id = req.query.hub_case_id ? uuidStr.safeParse(req.query.hub_case_id) : null;
  if (surg_case_id?.success) q = q.eq('hub_case_id', surg_case_id.data);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ surgeries: data ?? [] });
};

const jsonbField = z.record(z.string(), z.unknown()).optional().nullable();

export const createHubSurgery = async (req: Request, res: Response) => {
  const parsed = z
    .object({
      clinic_id: uuidStr,
      unit_id: uuidStr.optional().nullable(),
      pet_id: uuidStr,
      guardian_id: uuidStr.optional().nullable(),
      hub_encounter_id: uuidStr.optional().nullable(),
      hub_case_id: uuidStr.optional().nullable(),
      create_new_case: z.boolean().optional(),
      new_case_title: z.string().trim().max(500).optional().nullable(),
      hub_staff_member_id: uuidStr.optional().nullable(),
      title: z.string().trim().min(1).max(200),
      scheduled_at: z.string().datetime({ offset: true }).optional().nullable(),
      anesthetic_risk: z.enum(['I', 'II', 'III', 'IV', 'V', 'VI', 'E']).optional().nullable(),
      pre_op: jsonbField,
      procedure: jsonbField,
      team: z.array(z.record(z.string(), z.unknown())).optional().nullable(),
      materials: z.array(z.record(z.string(), z.unknown())).optional().nullable(),
      post_op: jsonbField,
      // Legacy fields (backward compat)
      anesthesia_notes: z.string().optional().nullable(),
      team_notes: z.string().optional().nullable(),
      materials_notes: z.string().optional().nullable(),
      post_op_notes: z.string().optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;

  let caseId: string;
  let encounterId: string;
  try {
    const resolved = await ensureCaseAndAdmissionEncounter({
      clinic_id: b.clinic_id,
      unit_id: b.unit_id,
      pet_id: b.pet_id,
      guardian_id: b.guardian_id,
      hub_encounter_id: b.hub_encounter_id,
      hub_case_id: b.hub_case_id,
      create_new_case: b.create_new_case,
      new_case_title: b.new_case_title,
      encounter_chief_complaint: `Cirurgia: ${b.title}`,
    });
    caseId = resolved.case_id;
    encounterId = resolved.encounter_id;
  } catch (e) {
    if (e instanceof CaseSelectionRequiredError) {
      return res.status(409).json({ error: e.message, code: e.code });
    }
    return res.status(400).json({ error: (e as Error)?.message });
  }

  const { data, error } = await supabaseAdmin
    .from('hub_surgeries')
    .insert({
      clinic_id: b.clinic_id,
      unit_id: b.unit_id ?? null,
      pet_id: b.pet_id,
      guardian_id: b.guardian_id ?? null,
      hub_encounter_id: encounterId,
      hub_case_id: caseId,
      hub_staff_member_id: b.hub_staff_member_id ?? null,
      title: b.title,
      scheduled_at: b.scheduled_at ?? null,
      anesthetic_risk: b.anesthetic_risk ?? null,
      pre_op: b.pre_op ?? {},
      procedure: b.procedure ?? {},
      team: b.team ?? [],
      materials: b.materials ?? [],
      post_op: b.post_op ?? {},
      anesthesia_notes: b.anesthesia_notes ?? null,
      team_notes: b.team_notes ?? null,
      materials_notes: b.materials_notes ?? null,
      post_op_notes: b.post_op_notes ?? null,
      status: 'scheduled',
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Agendamento: usar `note` (surgery_performed é reservado para conclusão)
  void recordTimelineEvent({
    clinic_id: b.clinic_id,
    pet_id: b.pet_id,
    hub_case_id: caseId,
    hub_encounter_id: encounterId,
    event_type: 'note',
    ref_type: 'surgery',
    ref_id: (data as { id: string }).id,
    title: `Cirurgia agendada: ${b.title}`,
    created_by: b.hub_staff_member_id ?? null,
  });

  return res.status(201).json({ surgery: data });
};

export const patchHubSurgery = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  const parsed = z
    .object({
      clinic_id: uuidStr,
      status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
      started_at: z.string().datetime({ offset: true }).optional().nullable(),
      completed_at: z.string().datetime({ offset: true }).optional().nullable(),
      discharge_at: z.string().datetime({ offset: true }).optional().nullable(),
      anesthetic_risk: z.enum(['I', 'II', 'III', 'IV', 'V', 'VI', 'E']).optional().nullable(),
      pre_op: jsonbField,
      procedure: jsonbField,
      team: z.array(z.record(z.string(), z.unknown())).optional().nullable(),
      materials: z.array(z.record(z.string(), z.unknown())).optional().nullable(),
      post_op: jsonbField,
      anesthesia_notes: z.string().optional().nullable(),
      team_notes: z.string().optional().nullable(),
      materials_notes: z.string().optional().nullable(),
      post_op_notes: z.string().optional().nullable(),
      hub_case_id: uuidStr.optional().nullable(),
    })
    .safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
  const { clinic_id, ...patch } = parsed.data;

  const { data: existing } = await supabaseAdmin
    .from('hub_surgeries')
    .select('pet_id, hub_case_id, hub_encounter_id, hub_staff_member_id, title')
    .eq('id', id.data)
    .eq('clinic_id', clinic_id)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from('hub_surgeries')
    .update(patch)
    .eq('id', id.data)
    .eq('clinic_id', clinic_id)
    .select('*')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Cirurgia não encontrada' });

  if (patch.status === 'completed' && existing) {
    const ex = existing as Record<string, unknown>;
    void recordTimelineEvent({
      clinic_id,
      pet_id: ex.pet_id as string,
      hub_case_id: ex.hub_case_id as string | null,
      hub_encounter_id: ex.hub_encounter_id as string | null,
      event_type: 'surgery_performed',
      ref_type: 'surgery',
      ref_id: id.data,
      title: `Cirurgia realizada: ${ex.title as string}`,
      created_by: ex.hub_staff_member_id as string | null,
    });
  }

  return res.json({ surgery: data });
};

/** Alertas simples: vacinas com próxima dose nos próximos 30 dias. */
export const getHubClinicalAlerts = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
  const today = new Date();
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);
  const todayStr = today.toISOString().slice(0, 10);
  const in30Str = in30.toISOString().slice(0, 10);
  const { data: vaccines, error } = await supabaseAdmin
    .from('hub_vaccination_records')
    .select('id, pet_id, vaccine_name, next_dose_at, hub_pets(name)')
    .eq('clinic_id', clinic_id.data)
    .is('deleted_at', null)
    .not('next_dose_at', 'is', null)
    .gte('next_dose_at', todayStr)
    .lte('next_dose_at', in30Str);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({
    alerts: (vaccines ?? []).map((v: Record<string, unknown>) => ({
      type: 'vaccine_due',
      message: `Vacina ${v.vaccine_name} — próxima dose ${v.next_dose_at}`,
      pet_id: v.pet_id,
      pet: v.hub_pets,
    })),
  });
};
