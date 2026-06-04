import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const uuidStr = z.string().uuid();

const timelineEventTypeSchema = z.enum([
  'encounter_created',
  'encounter_completed',
  'encounter_amended',
  'exam_requested',
  'exam_result_received',
  'prescription_issued',
  'vaccination_applied',
  'hospitalization_started',
  'hospitalization_discharged',
  'surgery_performed',
  'return_scheduled',
  'note',
]);

const TIMELINE_SELECT = `
  id, clinic_id, pet_id, hub_case_id, hub_encounter_id,
  event_type, ref_type, ref_id, title, body, event_at, created_by, created_at
`;

/** GET /clinical/timeline?clinic_id&pet_id|hub_case_id */
export const listHubClinicalTimeline = async (req: Request, res: Response) => {
  try {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });

    const pet_id = req.query.pet_id ? uuidStr.safeParse(req.query.pet_id) : null;
    const hub_case_id = req.query.hub_case_id ? uuidStr.safeParse(req.query.hub_case_id) : null;

    if (!pet_id?.success && !hub_case_id?.success) {
      return res.status(400).json({ error: 'Informe pet_id ou hub_case_id' });
    }

    let q = supabaseAdmin
      .from('hub_clinical_timeline_events')
      .select(TIMELINE_SELECT)
      .eq('clinic_id', clinic_id.data)
      .is('deleted_at', null)
      .order('event_at', { ascending: false })
      .limit(200);

    if (hub_case_id?.success) {
      q = q.eq('hub_case_id', hub_case_id.data);
    } else if (pet_id?.success) {
      q = q.eq('pet_id', pet_id.data);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const events = data ?? [];

    const staffIds = [...new Set(events.map((e: Record<string, unknown>) => e.created_by as string).filter(Boolean))];
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

    const enriched = events.map((ev: Record<string, unknown>) => ({
      ...ev,
      created_by_member: staffMap.get(ev.created_by as string) ?? null,
    }));

    return res.json({ events: enriched });
  } catch (e: unknown) {
    console.error('listHubClinicalTimeline', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar timeline' });
  }
};

/** POST /clinical/timeline — adiciona nota manual. */
export const createHubClinicalTimelineNote = async (req: Request, res: Response) => {
  try {
    const parsed = z
      .object({
        clinic_id: uuidStr,
        pet_id: uuidStr,
        hub_case_id: uuidStr.optional().nullable(),
        hub_encounter_id: uuidStr.optional().nullable(),
        title: z.string().trim().min(1).max(500),
        body: z.string().trim().max(4000).optional().nullable(),
        event_at: z.string().datetime({ offset: true }).optional(),
        created_by: uuidStr.optional().nullable(),
      })
      .strict()
      .safeParse(req.body);

    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;

    const { data, error } = await supabaseAdmin
      .from('hub_clinical_timeline_events')
      .insert({
        clinic_id: b.clinic_id,
        pet_id: b.pet_id,
        hub_case_id: b.hub_case_id ?? null,
        hub_encounter_id: b.hub_encounter_id ?? null,
        event_type: 'note',
        ref_type: null,
        ref_id: null,
        title: b.title,
        body: b.body ?? null,
        event_at: b.event_at ?? new Date().toISOString(),
        created_by: b.created_by ?? null,
      })
      .select(TIMELINE_SELECT)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ event: data });
  } catch (e: unknown) {
    console.error('createHubClinicalTimelineNote', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar nota na timeline' });
  }
};

/**
 * Utilitário interno: grava um marco clínico na timeline.
 * Chamado por controllers (encounters, exams, prescriptions, etc.) em ações relevantes.
 * Falhas silenciosas — não bloqueia a operação principal.
 */
export async function recordTimelineEvent(opts: {
  clinic_id: string;
  pet_id: string;
  hub_case_id?: string | null;
  hub_encounter_id?: string | null;
  event_type: z.infer<typeof timelineEventTypeSchema>;
  ref_type?: string | null;
  ref_id?: string | null;
  title: string;
  body?: string | null;
  event_at?: string;
  created_by?: string | null;
}): Promise<void> {
  try {
    await supabaseAdmin.from('hub_clinical_timeline_events').insert({
      clinic_id: opts.clinic_id,
      pet_id: opts.pet_id,
      hub_case_id: opts.hub_case_id ?? null,
      hub_encounter_id: opts.hub_encounter_id ?? null,
      event_type: opts.event_type,
      ref_type: opts.ref_type ?? null,
      ref_id: opts.ref_id ?? null,
      title: opts.title,
      body: opts.body ?? null,
      event_at: opts.event_at ?? new Date().toISOString(),
      created_by: opts.created_by ?? null,
    });
  } catch (err) {
    console.error('recordTimelineEvent failed (non-blocking):', err);
  }
}
