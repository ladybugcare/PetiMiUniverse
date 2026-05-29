import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import {
  GROOMING_CHECKLIST_DEFAULT_ITEMS,
  mergeGroomingChecklistState,
  type GroomingChecklistTemplateItem,
} from './groomingChecklistDefaults';
import { buildGroomingDisplayTags } from './groomingPetTags';

const uuidStr = z.string().uuid();
const GROOMING_SERVICE_GROUP = 'banho_tosa';

const SESSION_SELECT = `
  id, clinic_id, unit_id, pet_id, guardian_id, hub_appointment_id, hub_staff_member_id,
  grooming_stage, priority, checked_in_at, started_at, ready_at, delivered_at, closed_at,
  paused_at,
  tutor_notes_snapshot, operational_notes, checklist, created_at, updated_at
`;

async function loadChecklistTemplateItems(
  clinicId: string,
  unitId: string | null | undefined,
): Promise<GroomingChecklistTemplateItem[]> {
  const { data, error } = await supabaseAdmin
    .from('hub_grooming_checklist_templates')
    .select('items, unit_id, created_at')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: true });
  if (error || !data?.length) return GROOMING_CHECKLIST_DEFAULT_ITEMS;
  const unitRow = unitId ? data.find((r) => (r as { unit_id?: string }).unit_id === unitId) : undefined;
  const row =
    unitRow ??
    data.find((r) => !(r as { unit_id?: string | null }).unit_id) ??
    data[0];
  const items = (row as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return GROOMING_CHECKLIST_DEFAULT_ITEMS;
  const parsed = items
    .filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
    .map((x) => ({
      key: String(x.key),
      label: String(x.label || x.key),
      default_checked: Boolean(x.default_checked),
    }))
    .filter((x) => x.key);
  return parsed.length ? parsed : GROOMING_CHECKLIST_DEFAULT_ITEMS;
}

async function groomingParentTypeIdsForAppointment(
  clinicId: string,
  appointmentId: string,
  groomingTypeSet: Set<string>,
): Promise<string[]> {
  const { data: appt } = await supabaseAdmin
    .from('hub_appointments')
    .select('hub_service_type_id')
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  const { data: lines } = await supabaseAdmin
    .from('hub_appointment_services')
    .select('hub_service_type_id')
    .eq('appointment_id', appointmentId)
    .order('order_index', { ascending: true });
  const ids = new Set<string>();
  if (appt?.hub_service_type_id && groomingTypeSet.has(appt.hub_service_type_id as string)) {
    ids.add(appt.hub_service_type_id as string);
  }
  for (const l of lines ?? []) {
    const sid = (l as { hub_service_type_id: string }).hub_service_type_id;
    if (groomingTypeSet.has(sid)) ids.add(sid);
  }
  return [...ids];
}

async function getGroomingTypeIdSet(clinicId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_types')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('service_group', GROOMING_SERVICE_GROUP)
    .is('deleted_at', null);
  if (error) throw error;
  return new Set((data ?? []).map((r: { id: string }) => r.id));
}

async function listAvailableAddonsForParents(
  clinicId: string,
  parentServiceTypeIds: string[],
): Promise<Array<{ id: string; name: string; sale_amount: number | null }>> {
  if (parentServiceTypeIds.length === 0) {
    const { data: links } = await supabaseAdmin
      .from('hub_service_group_addons')
      .select('addon_service_type_id')
      .eq('clinic_id', clinicId)
      .eq('service_group_slug', GROOMING_SERVICE_GROUP);
    const addonIds = [...new Set((links ?? []).map((l) => l.addon_service_type_id as string))];
    if (addonIds.length === 0) return [];
    const { data: types, error: tErr } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, name, sale_amount')
      .eq('clinic_id', clinicId)
      .in('id', addonIds)
      .eq('is_addon', true)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (tErr) throw tErr;
    return (types ?? []).map((t) => ({
      id: t.id as string,
      name: String(t.name),
      sale_amount: t.sale_amount != null ? Number(t.sale_amount) : null,
    }));
  }

  const { data: avRows, error: avErr } = await supabaseAdmin
    .from('hub_service_type_addon_availability')
    .select('addon_service_type_id')
    .in('parent_service_type_id', parentServiceTypeIds)
    .eq('is_available', true);
  if (avErr) throw avErr;
  const allowed = new Set((avRows ?? []).map((r) => r.addon_service_type_id as string));
  if (allowed.size === 0) return [];

  const { data: types, error: tErr } = await supabaseAdmin
    .from('hub_service_types')
    .select('id, name, sale_amount')
    .eq('clinic_id', clinicId)
    .in('id', [...allowed])
    .eq('is_addon', true)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (tErr) throw tErr;
  return (types ?? []).map((t) => ({
    id: t.id as string,
    name: String(t.name),
    sale_amount: t.sale_amount != null ? Number(t.sale_amount) : null,
  }));
}

/** GET /grooming/sessions/:id/drawer */
export const getHubGroomingSessionDrawer = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic_id.success) {
      return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
    }

    const { data: session, error: sErr } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select(SESSION_SELECT)
      .eq('id', id.data)
      .eq('clinic_id', clinic_id.data)
      .is('deleted_at', null)
      .maybeSingle();
    if (sErr) return res.status(500).json({ error: sErr.message });
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    const petId = session.pet_id as string;
    const unitId = session.unit_id as string | null;

    const [templateItems, groomingSet, petRes, flagsRes, lastVisitRes, extrasRes] = await Promise.all([
      loadChecklistTemplateItems(clinic_id.data, unitId),
      getGroomingTypeIdSet(clinic_id.data),
      supabaseAdmin
        .from('hub_pets')
        .select('id, name, species, breed, size_tier, birth_date, coat_type, notes, avatar_url')
        .eq('id', petId)
        .maybeSingle(),
      supabaseAdmin
        .from('hub_pet_clinical_flags')
        .select('flag_key, label')
        .eq('clinic_id', clinic_id.data)
        .eq('pet_id', petId)
        .eq('active', true)
        .is('deleted_at', null)
        .order('flag_key'),
      supabaseAdmin
        .from('hub_grooming_sessions')
        .select('closed_at')
        .eq('clinic_id', clinic_id.data)
        .eq('pet_id', petId)
        .neq('id', id.data)
        .not('closed_at', 'is', null)
        .is('deleted_at', null)
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('hub_grooming_session_extras')
        .select('id, hub_service_type_id, name_snapshot, sale_amount_snapshot, created_at')
        .eq('hub_grooming_session_id', id.data)
        .eq('clinic_id', clinic_id.data)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
    ]);

    const pet = petRes.data;
    const allTags = buildGroomingDisplayTags(
      (flagsRes.data ?? []) as Array<{ flag_key: string; label: string }>,
      (pet as { notes?: string } | null)?.notes,
    );

    const checklist = mergeGroomingChecklistState(
      session.checklist as Record<string, { done?: boolean }> | null,
      templateItems,
    );

    let appointment_lines: Array<{
      id: string;
      hub_service_type_id: string;
      name: string;
      duration_minutes: number | null;
      executed_at: string | null;
      sale_amount_applied: number | null;
    }> = [];
    let parentIds: string[] = [];

    const apptId = session.hub_appointment_id as string | null;
    if (apptId) {
      parentIds = await groomingParentTypeIdsForAppointment(clinic_id.data, apptId, groomingSet);
      const { data: lineRows, error: lErr } = await supabaseAdmin
        .from('hub_appointment_services')
        .select(
          'id, hub_service_type_id, duration_minutes, executed_at, sale_amount_applied, order_index',
        )
        .eq('appointment_id', apptId)
        .order('order_index', { ascending: true });
      if (lErr) return res.status(500).json({ error: lErr.message });

      const stIds = [...new Set((lineRows ?? []).map((r) => (r as { hub_service_type_id: string }).hub_service_type_id))];
      const { data: sts } = await supabaseAdmin
        .from('hub_service_types')
        .select('id, name, service_group, default_duration_minutes')
        .in('id', stIds);
      const stMap = new Map((sts ?? []).map((s) => [s.id as string, s as Record<string, unknown>]));

      appointment_lines = (lineRows ?? [])
        .map((row) => {
          const r = row as {
            id: string;
            hub_service_type_id: string;
            duration_minutes: number;
            executed_at: string | null;
            sale_amount_applied: number | null;
          };
          const st = stMap.get(r.hub_service_type_id);
          if (!st || String(st.service_group) !== GROOMING_SERVICE_GROUP) return null;
          return {
            id: r.id,
            hub_service_type_id: r.hub_service_type_id,
            name: String(st.name),
            duration_minutes: (st.default_duration_minutes as number | null) ?? r.duration_minutes,
            executed_at: r.executed_at ?? null,
            sale_amount_applied: r.sale_amount_applied != null ? Number(r.sale_amount_applied) : null,
          };
        })
        .filter(Boolean) as typeof appointment_lines;
    }

    const available_addons = await listAvailableAddonsForParents(clinic_id.data, parentIds);

    return res.json({
      session,
      pet,
      checklist_template: templateItems,
      checklist,
      clinical_tags: allTags,
      last_grooming_closed_at: (lastVisitRes.data as { closed_at?: string } | null)?.closed_at ?? null,
      appointment_lines,
      extras: extrasRes.data ?? [],
      available_addons,
    });
  } catch (e: unknown) {
    console.error('getHubGroomingSessionDrawer', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar drawer' });
  }
};

const postExtraSchema = z
  .object({
    clinic_id: uuidStr,
    hub_service_type_id: uuidStr,
    created_by_staff_id: uuidStr.optional().nullable(),
  })
  .strict();

/** POST /grooming/sessions/:id/extras */
export const postHubGroomingSessionExtra = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const parsed = postExtraSchema.safeParse(req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ error: parsed.success ? id.error : parsed.error.flatten() });
    const { clinic_id, hub_service_type_id, created_by_staff_id } = parsed.data;

    const { data: session, error: sErr } = await supabaseAdmin
      .from('hub_grooming_sessions')
      .select('id, hub_appointment_id, unit_id')
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (sErr) return res.status(500).json({ error: sErr.message });
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    const { data: addonType, error: aErr } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, name, sale_amount, is_addon, clinic_id, deleted_at, service_group')
      .eq('id', hub_service_type_id)
      .maybeSingle();
    if (aErr) return res.status(500).json({ error: aErr.message });
    if (
      !addonType ||
      addonType.clinic_id !== clinic_id ||
      addonType.deleted_at ||
      addonType.is_addon !== true
    ) {
      return res.status(400).json({ error: 'Tipo de serviço inválido para adicional' });
    }

    const groomingSet = await getGroomingTypeIdSet(clinic_id);
    let parentIds: string[] = [];
    const apptId = session.hub_appointment_id as string | null;
    if (apptId) {
      parentIds = await groomingParentTypeIdsForAppointment(clinic_id, apptId, groomingSet);
    }

    const available = await listAvailableAddonsForParents(clinic_id, parentIds);
    if (!available.some((a) => a.id === hub_service_type_id)) {
      return res.status(400).json({ error: 'Este adicional não está disponível para esta sessão' });
    }

    const saleSnap = addonType.sale_amount != null ? Number(addonType.sale_amount) : null;
    const { data: row, error: insErr } = await supabaseAdmin
      .from('hub_grooming_session_extras')
      .insert({
        clinic_id,
        hub_grooming_session_id: id.data,
        hub_service_type_id,
        parent_service_type_id: parentIds[0] ?? null,
        name_snapshot: String(addonType.name),
        sale_amount_snapshot: saleSnap,
        created_by_staff_id: created_by_staff_id ?? null,
      })
      .select('id, hub_service_type_id, name_snapshot, sale_amount_snapshot, created_at')
      .single();
    if (insErr) return res.status(500).json({ error: insErr.message });

    return res.status(201).json({ extra: row });
  } catch (e: unknown) {
    console.error('postHubGroomingSessionExtra', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao adicionar adicional' });
  }
};

const patchLineSchema = z
  .object({
    clinic_id: uuidStr,
    executed: z.boolean(),
    executed_by_staff_id: uuidStr.optional().nullable(),
  })
  .strict();

/** PATCH /grooming/appointment-service-lines/:lineId */
export const patchHubGroomingAppointmentServiceLine = async (req: Request, res: Response) => {
  try {
    const lineId = uuidStr.safeParse(req.params.lineId);
    const parsed = patchLineSchema.safeParse(req.body);
    if (!lineId.success || !parsed.success) {
      return res.status(400).json({ error: 'lineId e body inválidos' });
    }
    const { clinic_id, executed, executed_by_staff_id } = parsed.data;

    const { data: line, error: lErr } = await supabaseAdmin
      .from('hub_appointment_services')
      .select('id, appointment_id')
      .eq('id', lineId.data)
      .maybeSingle();
    if (lErr) return res.status(500).json({ error: lErr.message });
    if (!line) return res.status(404).json({ error: 'Linha não encontrada' });

    const { data: appt, error: aErr } = await supabaseAdmin
      .from('hub_appointments')
      .select('id, clinic_id')
      .eq('id', line.appointment_id as string)
      .maybeSingle();
    if (aErr) return res.status(500).json({ error: aErr.message });
    if (!appt || appt.clinic_id !== clinic_id) return res.status(403).json({ error: 'Agendamento inválido' });

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      executed_at: executed ? now : null,
      executed_by_staff_id: executed ? executed_by_staff_id ?? null : null,
    };

    const { data: updated, error: uErr } = await supabaseAdmin
      .from('hub_appointment_services')
      .update(patch)
      .eq('id', lineId.data)
      .select('id, appointment_id, hub_service_type_id, executed_at, executed_by_staff_id')
      .maybeSingle();
    if (uErr) return res.status(500).json({ error: uErr.message });

    return res.json({ line: updated });
  } catch (e: unknown) {
    console.error('patchHubGroomingAppointmentServiceLine', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar linha' });
  }
};
