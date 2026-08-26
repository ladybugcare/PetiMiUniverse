import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { recordTimelineEvent } from './hubClinicalTimelineController';
import {
  careLocationBodyFields,
  careLocationKindSchema,
  loadPartnerClinicMap,
  resolveCareLocation,
} from './hubCareLocation';

const uuidStr = z.string().uuid();

const examStatusSchema = z.enum(['requested', 'collected', 'sent', 'result_received', 'completed', 'cancelled']);
const labKindSchema = z.enum(['internal', 'external']);

const createExamSchema = z
  .object({
    clinic_id: uuidStr,
    pet_id: uuidStr,
    hub_case_id: uuidStr.optional().nullable(),
    hub_encounter_id: uuidStr.optional().nullable(),
    guardian_id: uuidStr.optional().nullable(),
    exam_type: z.string().trim().min(1).max(300),
    lab_kind: labKindSchema.optional().default('internal'),
    lab_name: z.string().trim().max(300).optional().nullable(),
    external_lab_name: z.string().trim().max(300).optional().nullable(),
    external_order_code: z.string().trim().max(200).optional().nullable(),
    external_result_url: z.string().url().optional().nullable(),
    requested_by: uuidStr.optional().nullable(),
    urgency: z.enum(['routine', 'urgent']).optional().nullable(),
    clinical_indication: z.string().trim().max(4000).optional().nullable(),
    fasting_required: z.boolean().optional().default(false),
    collection_instructions: z.string().trim().max(4000).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
    ...careLocationBodyFields,
  })
  .strict();

const patchExamSchema = z
  .object({
    clinic_id: uuidStr,
    exam_type: z.string().trim().min(1).max(300).optional(),
    lab_kind: labKindSchema.optional(),
    lab_name: z.string().trim().max(300).optional().nullable(),
    external_lab_name: z.string().trim().max(300).optional().nullable(),
    external_order_code: z.string().trim().max(200).optional().nullable(),
    external_result_url: z.string().url().optional().nullable(),
    status: examStatusSchema.optional(),
    urgency: z.enum(['routine', 'urgent']).optional().nullable(),
    clinical_indication: z.string().trim().max(4000).optional().nullable(),
    fasting_required: z.boolean().optional(),
    collection_instructions: z.string().trim().max(4000).optional().nullable(),
    collected_at: z.string().datetime({ offset: true }).optional().nullable(),
    result_at: z.string().datetime({ offset: true }).optional().nullable(),
    result_text: z.string().trim().max(8000).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    requested_by: uuidStr.optional().nullable(),
    ...careLocationBodyFields,
  })
  .strict();

const EXAM_SELECT = `
  id, clinic_id, pet_id, hub_case_id, hub_encounter_id, guardian_id,
  exam_type, lab_kind, lab_name,
  external_lab_name, external_order_code, external_result_url,
  urgency, clinical_indication, fasting_required, collection_instructions, document_status,
  status, requested_at, collected_at, result_at, result_text,
  requested_by, notes, metadata, care_location_kind, hub_partner_clinic_id,
  created_at, updated_at
`;

async function enrichExam(row: Record<string, unknown>) {
  const requestedById = row.requested_by as string | null;
  const partnerId = row.hub_partner_clinic_id as string | null;
  const clinicId = row.clinic_id as string;

  const [staffRes, partnerMap] = await Promise.all([
    requestedById
      ? supabaseAdmin.from('hub_staff_members').select('id, full_name').eq('id', requestedById).maybeSingle()
      : Promise.resolve({ data: null }),
    partnerId && clinicId
      ? loadPartnerClinicMap(clinicId, [partnerId])
      : Promise.resolve(new Map<string, { id: string; name: string }>()),
  ]);

  return {
    ...row,
    requested_by_member: staffRes.data,
    partner_clinic: partnerId ? partnerMap.get(partnerId) ?? null : null,
  };
}

async function inheritCareLocationFromEncounter(
  clinicId: string,
  encounterId: string | null | undefined,
): Promise<{ care_location_kind: 'own_unit' | 'partner_clinic'; hub_partner_clinic_id: string | null } | null> {
  if (!encounterId) return null;
  const { data } = await supabaseAdmin
    .from('hub_encounters')
    .select('care_location_kind, hub_partner_clinic_id')
    .eq('id', encounterId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) return null;
  const row = data as { care_location_kind?: string; hub_partner_clinic_id?: string | null };
  return {
    care_location_kind: (row.care_location_kind as 'own_unit' | 'partner_clinic') ?? 'own_unit',
    hub_partner_clinic_id: row.hub_partner_clinic_id ?? null,
  };
}

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** GET /clinical/exams?clinic_id&pet_id?&hub_case_id?&hub_encounter_id?&status?&care_location_kind?&hub_partner_clinic_id? */
export const listHubClinicalExams = async (req: Request, res: Response) => {
  try {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });

    let q = supabaseAdmin
      .from('hub_clinical_exams')
      .select(EXAM_SELECT)
      .eq('clinic_id', clinic_id.data)
      .is('deleted_at', null)
      .order('requested_at', { ascending: false })
      .limit(200);

    if (req.query.pet_id) {
      const v = uuidStr.safeParse(req.query.pet_id);
      if (v.success) q = q.eq('pet_id', v.data);
    }
    if (req.query.hub_case_id) {
      const v = uuidStr.safeParse(req.query.hub_case_id);
      if (v.success) q = q.eq('hub_case_id', v.data);
    }
    if (req.query.hub_encounter_id) {
      const v = uuidStr.safeParse(req.query.hub_encounter_id);
      if (v.success) q = q.eq('hub_encounter_id', v.data);
    }
    if (req.query.status) {
      const v = examStatusSchema.safeParse(req.query.status);
      if (v.success) q = q.eq('status', v.data);
    }
    if (req.query.care_location_kind) {
      const v = careLocationKindSchema.safeParse(req.query.care_location_kind);
      if (v.success) q = q.eq('care_location_kind', v.data);
    }
    if (req.query.hub_partner_clinic_id) {
      const v = uuidStr.safeParse(req.query.hub_partner_clinic_id);
      if (v.success) q = q.eq('hub_partner_clinic_id', v.data);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const rows = (data ?? []) as Record<string, unknown>[];
    const partnerMap = await loadPartnerClinicMap(
      clinic_id.data,
      rows.map((r) => r.hub_partner_clinic_id as string).filter(Boolean),
    );
    const exams = rows.map((r) => ({
      ...r,
      partner_clinic: r.hub_partner_clinic_id
        ? partnerMap.get(r.hub_partner_clinic_id as string) ?? null
        : null,
    }));

    return res.json({ exams });
  } catch (e: unknown) {
    console.error('listHubClinicalExams', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao listar exames' });
  }
};

/** GET /clinical/exams/export.csv */
export const exportHubClinicalExamsCsv = async (req: Request, res: Response) => {
  try {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });

    let q = supabaseAdmin
      .from('hub_clinical_exams')
      .select(EXAM_SELECT)
      .eq('clinic_id', clinic_id.data)
      .is('deleted_at', null)
      .order('requested_at', { ascending: false })
      .limit(2000);

    if (req.query.status) {
      const v = examStatusSchema.safeParse(req.query.status);
      if (v.success) q = q.eq('status', v.data);
    }
    if (req.query.care_location_kind) {
      const v = careLocationKindSchema.safeParse(req.query.care_location_kind);
      if (v.success) q = q.eq('care_location_kind', v.data);
    }
    if (req.query.hub_partner_clinic_id) {
      const v = uuidStr.safeParse(req.query.hub_partner_clinic_id);
      if (v.success) q = q.eq('hub_partner_clinic_id', v.data);
    }
    if (typeof req.query.from === 'string' && req.query.from) {
      q = q.gte('requested_at', req.query.from);
    }
    if (typeof req.query.to === 'string' && req.query.to) {
      q = q.lte('requested_at', req.query.to);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const rows = (data ?? []) as Record<string, unknown>[];
    const petIds = [...new Set(rows.map((r) => r.pet_id as string).filter(Boolean))];
    const guIds = [...new Set(rows.map((r) => r.guardian_id as string | null).filter(Boolean))] as string[];
    const partnerIds = rows.map((r) => r.hub_partner_clinic_id as string).filter(Boolean);

    const [petsRes, gusRes, partnerMap] = await Promise.all([
      petIds.length
        ? supabaseAdmin.from('hub_pets').select('id, name').in('id', petIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      guIds.length
        ? supabaseAdmin.from('hub_guardians').select('id, full_name').in('id', guIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      loadPartnerClinicMap(clinic_id.data, partnerIds),
    ]);

    const petMap = new Map((petsRes.data ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
    const guMap = new Map(
      (gusRes.data ?? []).map((g: { id: string; full_name: string }) => [g.id, g.full_name]),
    );

    const header = [
      'requested_at',
      'exam_type',
      'status',
      'pet_name',
      'guardian_name',
      'care_location_kind',
      'partner_clinic_name',
      'lab_kind',
      'lab_name',
      'result_at',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      const kind = (r.care_location_kind as string) ?? 'own_unit';
      const partnerName =
        kind === 'partner_clinic' && r.hub_partner_clinic_id
          ? partnerMap.get(r.hub_partner_clinic_id as string)?.name ?? ''
          : '';
      lines.push(
        [
          csvEscape(r.requested_at),
          csvEscape(r.exam_type),
          csvEscape(r.status),
          csvEscape(petMap.get(r.pet_id as string) ?? ''),
          csvEscape(r.guardian_id ? guMap.get(r.guardian_id as string) ?? '' : ''),
          csvEscape(kind),
          csvEscape(partnerName),
          csvEscape(r.lab_kind),
          csvEscape(r.lab_name ?? r.external_lab_name ?? ''),
          csvEscape(r.result_at ?? ''),
        ].join(','),
      );
    }

    const body = `\uFEFF${lines.join('\n')}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="exames.csv"');
    return res.status(200).send(body);
  } catch (e: unknown) {
    console.error('exportHubClinicalExamsCsv', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao exportar exames' });
  }
};

/** GET /clinical/exams/:id */
export const getHubClinicalExam = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic_id.success) {
      return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
    }
    const { data, error } = await supabaseAdmin
      .from('hub_clinical_exams')
      .select(EXAM_SELECT)
      .eq('id', id.data)
      .eq('clinic_id', clinic_id.data)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Exame não encontrado' });
    const enriched = await enrichExam(data as Record<string, unknown>);
    return res.json({ exam: enriched });
  } catch (e: unknown) {
    console.error('getHubClinicalExam', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar exame' });
  }
};

/** POST /clinical/exams */
export const createHubClinicalExam = async (req: Request, res: Response) => {
  try {
    const parsed = createExamSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;

    const inherited = await inheritCareLocationFromEncounter(b.clinic_id, b.hub_encounter_id);
    const careKind = b.care_location_kind ?? inherited?.care_location_kind ?? 'own_unit';
    const partnerId =
      b.hub_partner_clinic_id !== undefined
        ? b.hub_partner_clinic_id
        : (inherited?.hub_partner_clinic_id ?? null);

    const careResolved = await resolveCareLocation({
      clinicId: b.clinic_id,
      care_location_kind: careKind,
      hub_partner_clinic_id: partnerId,
      unit_id: null,
      allowNullUnit: true,
    });
    if (!careResolved.ok) {
      return res.status(400).json({ error: careResolved.error });
    }

    const { data, error } = await supabaseAdmin
      .from('hub_clinical_exams')
      .insert({
        clinic_id: b.clinic_id,
        pet_id: b.pet_id,
        hub_case_id: b.hub_case_id ?? null,
        hub_encounter_id: b.hub_encounter_id ?? null,
        exam_type: b.exam_type,
        lab_kind: b.lab_kind,
        lab_name: b.lab_name ?? null,
        external_lab_name: b.external_lab_name ?? null,
        external_order_code: b.external_order_code ?? null,
        external_result_url: b.external_result_url ?? null,
        requested_by: b.requested_by ?? null,
        guardian_id: b.guardian_id ?? null,
        urgency: b.urgency ?? null,
        clinical_indication: b.clinical_indication ?? null,
        fasting_required: b.fasting_required ?? false,
        collection_instructions: b.collection_instructions ?? null,
        notes: b.notes ?? null,
        metadata: b.metadata,
        care_location_kind: careResolved.value.care_location_kind,
        hub_partner_clinic_id: careResolved.value.hub_partner_clinic_id,
        status: 'requested',
        document_status: 'active',
      })
      .select(EXAM_SELECT)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const exam = data as Record<string, unknown>;

    void recordTimelineEvent({
      clinic_id: b.clinic_id,
      pet_id: b.pet_id,
      hub_case_id: b.hub_case_id ?? null,
      hub_encounter_id: b.hub_encounter_id ?? null,
      event_type: 'exam_requested',
      ref_type: 'exam',
      ref_id: exam.id as string,
      title: `Exame solicitado: ${b.exam_type}`,
      body: b.lab_kind === 'external' ? `Laboratório: ${b.external_lab_name ?? b.lab_name ?? '—'}` : null,
      created_by: b.requested_by ?? null,
    });

    const enriched = await enrichExam(exam);
    return res.status(201).json({ exam: enriched });
  } catch (e: unknown) {
    console.error('createHubClinicalExam', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar exame' });
  }
};

/** PATCH /clinical/exams/:id — transições de status e atualização de dados. */
export const patchHubClinicalExam = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'id inválido' });
    const parsed = patchExamSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;

    const { data: current } = await supabaseAdmin
      .from('hub_clinical_exams')
      .select(
        'status, document_status, pet_id, hub_case_id, hub_encounter_id, exam_type, clinic_id, care_location_kind, hub_partner_clinic_id',
      )
      .eq('id', id.data)
      .eq('clinic_id', b.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!current) return res.status(404).json({ error: 'Exame não encontrado' });

    const c = current as Record<string, unknown>;
    const contentFields = [
      'exam_type',
      'lab_kind',
      'lab_name',
      'external_lab_name',
      'urgency',
      'clinical_indication',
      'fasting_required',
      'collection_instructions',
      'notes',
    ] as const;
    const touchesContent = contentFields.some((f) => b[f] !== undefined);
    if (touchesContent && c.document_status === 'issued') {
      return res.status(409).json({
        error: 'Exame emitido não pode ser editado. Revogue o documento ou adicione um novo item.',
      });
    }
    const patch: Record<string, unknown> = {};
    if (b.exam_type !== undefined) patch.exam_type = b.exam_type;
    if (b.lab_kind !== undefined) patch.lab_kind = b.lab_kind;
    if (b.lab_name !== undefined) patch.lab_name = b.lab_name;
    if (b.external_lab_name !== undefined) patch.external_lab_name = b.external_lab_name;
    if (b.external_order_code !== undefined) patch.external_order_code = b.external_order_code;
    if (b.external_result_url !== undefined) patch.external_result_url = b.external_result_url;
    if (b.urgency !== undefined) patch.urgency = b.urgency;
    if (b.clinical_indication !== undefined) patch.clinical_indication = b.clinical_indication;
    if (b.fasting_required !== undefined) patch.fasting_required = b.fasting_required;
    if (b.collection_instructions !== undefined) patch.collection_instructions = b.collection_instructions;
    if (b.status !== undefined) patch.status = b.status;
    if (b.collected_at !== undefined) patch.collected_at = b.collected_at;
    if (b.result_at !== undefined) patch.result_at = b.result_at;
    if (b.result_text !== undefined) patch.result_text = b.result_text;
    if (b.notes !== undefined) patch.notes = b.notes;
    if (b.metadata !== undefined) patch.metadata = b.metadata;
    if (b.requested_by !== undefined) patch.requested_by = b.requested_by;

    if (b.care_location_kind !== undefined || b.hub_partner_clinic_id !== undefined) {
      const nextKind =
        b.care_location_kind ??
        ((c.care_location_kind as 'own_unit' | 'partner_clinic' | null) ?? 'own_unit');
      const nextPartner =
        b.hub_partner_clinic_id !== undefined
          ? b.hub_partner_clinic_id
          : ((c.hub_partner_clinic_id as string | null) ?? null);
      const careResolved = await resolveCareLocation({
        clinicId: b.clinic_id,
        care_location_kind: nextKind,
        hub_partner_clinic_id: nextPartner,
        unit_id: null,
        allowNullUnit: true,
        requireActivePartner: b.hub_partner_clinic_id !== undefined || b.care_location_kind === 'partner_clinic',
      });
      if (!careResolved.ok) {
        return res.status(400).json({ error: careResolved.error });
      }
      patch.care_location_kind = careResolved.value.care_location_kind;
      patch.hub_partner_clinic_id = careResolved.value.hub_partner_clinic_id;
    }

    const { data, error } = await supabaseAdmin
      .from('hub_clinical_exams')
      .update(patch)
      .eq('id', id.data)
      .eq('clinic_id', b.clinic_id)
      .is('deleted_at', null)
      .select(EXAM_SELECT)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Exame não encontrado' });

    if (b.status === 'result_received' || b.status === 'completed') {
      const prevStatus = c.status as string;
      if (prevStatus !== b.status) {
        void recordTimelineEvent({
          clinic_id: b.clinic_id,
          pet_id: c.pet_id as string,
          hub_case_id: c.hub_case_id as string | null,
          hub_encounter_id: c.hub_encounter_id as string | null,
          event_type: 'exam_result_received',
          ref_type: 'exam',
          ref_id: id.data,
          title: `Resultado recebido: ${c.exam_type as string}`,
          body: b.result_text ?? null,
        });
      }
    }

    const enriched = await enrichExam(data as Record<string, unknown>);
    return res.json({ exam: enriched });
  } catch (e: unknown) {
    console.error('patchHubClinicalExam', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar exame' });
  }
};

/** DELETE /clinical/exams/:id — soft-delete. */
export const deleteHubClinicalExam = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic_id.success) {
      return res.status(400).json({ error: 'id e clinic_id obrigatórios' });
    }
    const { error } = await supabaseAdmin
      .from('hub_clinical_exams')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id.data)
      .eq('clinic_id', clinic_id.data)
      .is('deleted_at', null);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).send();
  } catch (e: unknown) {
    console.error('deleteHubClinicalExam', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao remover exame' });
  }
};
