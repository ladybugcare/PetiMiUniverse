import type { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { uploadHubClinicalFileToStorage } from '../../utils/hubClinicalFileUpload.js';
import {
  CLINICAL_ATTACHMENTS_MIGRATION_HINT,
  isMissingPostgrestRelation,
} from '../../utils/supabaseSchemaErrors.js';
import { streamPrescriptionPdf } from './hubPrescriptionPdf';

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
      hub_staff_member_id: uuidStr.optional().nullable(),
      notes: z.string().trim().max(4000).optional().nullable(),
      items: z
        .array(
          z.object({
            medication_name: z.string().trim().min(1).max(200),
            dosage: z.string().trim().max(200).optional().nullable(),
            frequency: z.string().trim().max(200).optional().nullable(),
            duration: z.string().trim().max(200).optional().nullable(),
            instructions: z.string().trim().max(2000).optional().nullable(),
            hub_inventory_item_id: uuidStr.optional().nullable(),
          }),
        )
        .min(1),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;
  const { data: rx, error: rxErr } = await supabaseAdmin
    .from('hub_prescriptions')
    .insert({
      clinic_id: b.clinic_id,
      pet_id: b.pet_id,
      hub_encounter_id: b.hub_encounter_id ?? null,
      hub_staff_member_id: b.hub_staff_member_id ?? null,
      notes: b.notes ?? null,
      status: 'active',
    })
    .select('*')
    .single();
  if (rxErr) return res.status(500).json({ error: rxErr.message });
  const insertItems = b.items.map((it, i) => ({
    prescription_id: (rx as { id: string }).id,
    ...it,
    order_index: i,
  }));
  const { error: itemsErr } = await supabaseAdmin.from('hub_prescription_items').insert(insertItems);
  if (itemsErr) return res.status(500).json({ error: itemsErr.message });
  return res.status(201).json({ prescription: { ...rx, items: insertItems } });
};

export const getHubPrescriptionPdf = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!id.success || !clinic_id.success) return res.status(400).json({ error: 'id e clinic_id obrigatórios' });

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
      vaccine_name: z.string().trim().min(1).max(200),
      batch_number: z.string().trim().max(120).optional().nullable(),
      administered_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      next_dose_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      hub_staff_member_id: uuidStr.optional().nullable(),
      notes: z.string().trim().max(2000).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabaseAdmin.from('hub_vaccination_records').insert(parsed.data).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
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
      hub_hospital_bed_id: uuidStr.optional().nullable(),
      hub_staff_member_id: uuidStr.optional().nullable(),
      admission_notes: z.string().trim().max(4000).optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;
  const { data, error } = await supabaseAdmin.from('hub_hospitalizations').insert({ ...b, status: 'active' }).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  if (b.hub_hospital_bed_id) {
    await supabaseAdmin.from('hub_hospital_beds').update({ status: 'occupied' }).eq('id', b.hub_hospital_bed_id);
  }
  return res.status(201).json({ hospitalization: data });
};

export const patchHubHospitalization = async (req: Request, res: Response) => {
  const id = uuidStr.safeParse(req.params.id);
  const parsed = z
    .object({
      clinic_id: uuidStr,
      status: z.enum(['active', 'discharged', 'cancelled']).optional(),
      discharge_notes: z.string().trim().max(4000).optional().nullable(),
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

  if (patch.status === 'discharged' && existing.hub_hospital_bed_id) {
    await supabaseAdmin
      .from('hub_hospital_beds')
      .update({ status: 'available' })
      .eq('id', existing.hub_hospital_bed_id);
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
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ surgeries: data ?? [] });
};

export const createHubSurgery = async (req: Request, res: Response) => {
  const parsed = z
    .object({
      clinic_id: uuidStr,
      unit_id: uuidStr.optional().nullable(),
      pet_id: uuidStr,
      guardian_id: uuidStr.optional().nullable(),
      hub_encounter_id: uuidStr.optional().nullable(),
      hub_staff_member_id: uuidStr.optional().nullable(),
      title: z.string().trim().min(1).max(200),
      scheduled_at: z.string().datetime({ offset: true }).optional().nullable(),
      anesthesia_notes: z.string().optional().nullable(),
      team_notes: z.string().optional().nullable(),
      materials_notes: z.string().optional().nullable(),
      post_op_notes: z.string().optional().nullable(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabaseAdmin
    .from('hub_surgeries')
    .insert({ ...parsed.data, status: 'scheduled' })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
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
      anesthesia_notes: z.string().optional().nullable(),
      team_notes: z.string().optional().nullable(),
      materials_notes: z.string().optional().nullable(),
      post_op_notes: z.string().optional().nullable(),
    })
    .safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
  const { clinic_id, ...patch } = parsed.data;
  const { data, error } = await supabaseAdmin
    .from('hub_surgeries')
    .update(patch)
    .eq('id', id.data)
    .eq('clinic_id', clinic_id)
    .select('*')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Cirurgia não encontrada' });
  return res.json({ surgery: data });
};

// ── Clinical templates ───────────────────────────────────────────────────────

export const listHubClinicalTemplates = async (req: Request, res: Response) => {
  const clinic_id = uuidStr.safeParse(req.query.clinic_id);
  if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });
  const { data, error } = await supabaseAdmin
    .from('hub_clinical_templates')
    .select('*')
    .eq('clinic_id', clinic_id.data)
    .eq('active', true)
    .is('deleted_at', null)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ templates: data ?? [] });
};

export const createHubClinicalTemplate = async (req: Request, res: Response) => {
  const parsed = z
    .object({
      clinic_id: uuidStr,
      name: z.string().trim().min(1).max(200),
      template_kind: z.enum(['consultation', 'dermatology', 'vaccination', 'return_visit', 'other']).optional(),
      anamnesis: z.record(z.string(), z.unknown()).optional(),
      physical_exam: z.record(z.string(), z.unknown()).optional(),
      diagnosis: z.record(z.string(), z.unknown()).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabaseAdmin.from('hub_clinical_templates').insert(parsed.data).select('*').single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ template: data });
};

export const applyHubClinicalTemplate = async (req: Request, res: Response) => {
  const encounter_id = uuidStr.safeParse(req.params.encounterId);
  const parsed = z.object({ clinic_id: uuidStr, template_id: uuidStr }).safeParse(req.body);
  if (!encounter_id.success || !parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
  const { data: tpl, error: tplErr } = await supabaseAdmin
    .from('hub_clinical_templates')
    .select('anamnesis, physical_exam, diagnosis')
    .eq('id', parsed.data.template_id)
    .eq('clinic_id', parsed.data.clinic_id)
    .maybeSingle();
  if (tplErr || !tpl) return res.status(404).json({ error: 'Template não encontrado' });
  const { data, error } = await supabaseAdmin
    .from('hub_encounters')
    .update({
      anamnesis: tpl.anamnesis,
      physical_exam: tpl.physical_exam,
      diagnosis: tpl.diagnosis,
    })
    .eq('id', encounter_id.data)
    .eq('clinic_id', parsed.data.clinic_id)
    .select('id, anamnesis, physical_exam, diagnosis')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ encounter: data });
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
