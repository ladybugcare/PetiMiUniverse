import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { ALLOCATION_POLICIES, getResourceAvailability } from './hubResourcesService';

const uuidStr = z.string().uuid();
const slugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]+$/)
  .max(64);

const LEVE_TRAZ_SLUG = 'leva_traz';

const KIND_SELECT =
  'id, clinic_id, service_group_slug, name, allocation_policy, sort_order, active, created_at, updated_at';
const RESOURCE_SELECT =
  'id, clinic_id, unit_id, resource_kind_id, name, active, sort_order, notes, created_at, updated_at';

function rejectLevaTraz(slug: string, res: Response): boolean {
  if (slug === LEVE_TRAZ_SLUG) {
    res.status(400).json({ error: 'Leva e Traz usa a frota de veículos, não o catálogo de recursos.' });
    return true;
  }
  return false;
}

export const listHubResourceKinds = async (req: Request, res: Response) => {
  try {
    const clinicId = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicId.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const group = req.query.service_group ? slugSchema.safeParse(req.query.service_group) : null;
    if (group && !group.success) return res.status(400).json({ error: 'service_group inválido' });

    let kindsQ = supabaseAdmin
      .from('hub_resource_kinds')
      .select(KIND_SELECT)
      .eq('clinic_id', clinicId.data)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (group?.success) kindsQ = kindsQ.eq('service_group_slug', group.data);

    const [kindsRes, settingsRes] = await Promise.all([
      kindsQ,
      supabaseAdmin
        .from('hub_resource_group_settings')
        .select('service_group_slug, enabled')
        .eq('clinic_id', clinicId.data),
    ]);
    if (kindsRes.error) return res.status(500).json({ error: kindsRes.error.message });
    if (settingsRes.error) return res.status(500).json({ error: settingsRes.error.message });
    return res.json({ kinds: kindsRes.data ?? [], settings: settingsRes.data ?? [] });
  } catch (e: unknown) {
    console.error('listHubResourceKinds', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao listar tipos de recurso' });
  }
};

const createKindSchema = z.object({
  clinic_id: uuidStr,
  service_group_slug: slugSchema,
  name: z.string().trim().min(1).max(80),
  allocation_policy: z.enum(ALLOCATION_POLICIES).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export const createHubResourceKind = async (req: Request, res: Response) => {
  try {
    const parsed = createKindSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    if (rejectLevaTraz(parsed.data.service_group_slug, res)) return;
    const { data, error } = await supabaseAdmin
      .from('hub_resource_kinds')
      .insert({
        clinic_id: parsed.data.clinic_id,
        service_group_slug: parsed.data.service_group_slug,
        name: parsed.data.name,
        allocation_policy: parsed.data.allocation_policy ?? 'optional',
        sort_order: parsed.data.sort_order ?? 0,
      })
      .select(KIND_SELECT)
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe um tipo com esse nome neste grupo.' });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({ kind: data });
  } catch (e: unknown) {
    console.error('createHubResourceKind', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar tipo de recurso' });
  }
};

const patchKindSchema = z.object({
  clinic_id: uuidStr,
  name: z.string().trim().min(1).max(80).optional(),
  allocation_policy: z.enum(ALLOCATION_POLICIES).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});

export const patchHubResourceKind = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const body = patchKindSchema.safeParse(req.body);
    if (!id.success || !body.success) return res.status(400).json({ error: 'Dados inválidos' });
    const { clinic_id, ...fields } = body.data;
    const { data, error } = await supabaseAdmin
      .from('hub_resource_kinds')
      .update(fields)
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .select(KIND_SELECT)
      .maybeSingle();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe um tipo com esse nome neste grupo.' });
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: 'Tipo de recurso não encontrado' });
    return res.json({ kind: data });
  } catch (e: unknown) {
    console.error('patchHubResourceKind', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar tipo de recurso' });
  }
};

export const deleteHubResourceKind = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinicId = uuidStr.safeParse(req.query.clinic_id ?? req.body?.clinic_id);
    if (!id.success || !clinicId.success) return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('hub_resource_kinds')
      .update({ deleted_at: now, active: false })
      .eq('id', id.data)
      .eq('clinic_id', clinicId.data)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Tipo de recurso não encontrado' });
    await supabaseAdmin
      .from('hub_resources')
      .update({ deleted_at: now, active: false })
      .eq('resource_kind_id', id.data)
      .eq('clinic_id', clinicId.data)
      .is('deleted_at', null);
    return res.status(204).send();
  } catch (e: unknown) {
    console.error('deleteHubResourceKind', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao excluir tipo de recurso' });
  }
};

const putGroupSettingSchema = z.object({
  clinic_id: uuidStr,
  service_group_slug: slugSchema,
  enabled: z.boolean(),
});

export const putHubResourceGroupSetting = async (req: Request, res: Response) => {
  try {
    const parsed = putGroupSettingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos' });
    if (rejectLevaTraz(parsed.data.service_group_slug, res)) return;
    const { data, error } = await supabaseAdmin
      .from('hub_resource_group_settings')
      .upsert(
        {
          clinic_id: parsed.data.clinic_id,
          service_group_slug: parsed.data.service_group_slug,
          enabled: parsed.data.enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id,service_group_slug' },
      )
      .select('service_group_slug, enabled')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ setting: data });
  } catch (e: unknown) {
    console.error('putHubResourceGroupSetting', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao salvar configuração' });
  }
};

export const listHubResources = async (req: Request, res: Response) => {
  try {
    const clinicId = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicId.success) return res.status(400).json({ error: 'clinic_id inválido' });
    const unitId = req.query.unit_id ? uuidStr.safeParse(req.query.unit_id) : null;
    if (unitId && !unitId.success) return res.status(400).json({ error: 'unit_id inválido' });
    const group = req.query.service_group ? slugSchema.safeParse(req.query.service_group) : null;
    if (group && !group.success) return res.status(400).json({ error: 'service_group inválido' });
    const includeInactive = req.query.include_inactive === 'true';

    let kindsQ = supabaseAdmin
      .from('hub_resource_kinds')
      .select('id, name, service_group_slug, allocation_policy')
      .eq('clinic_id', clinicId.data)
      .is('deleted_at', null);
    if (group?.success) kindsQ = kindsQ.eq('service_group_slug', group.data);
    const { data: kinds, error: kindErr } = await kindsQ;
    if (kindErr) return res.status(500).json({ error: kindErr.message });
    const kindList = kinds ?? [];
    if (kindList.length === 0) return res.json({ resources: [] });

    let q = supabaseAdmin
      .from('hub_resources')
      .select(RESOURCE_SELECT)
      .eq('clinic_id', clinicId.data)
      .in(
        'resource_kind_id',
        kindList.map((k: { id: string }) => k.id),
      )
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (unitId?.success) q = q.eq('unit_id', unitId.data);
    if (!includeInactive) q = q.eq('active', true);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const kindById = new Map(
      kindList.map((k: { id: string; name: string; service_group_slug: string; allocation_policy: string }) => [k.id, k]),
    );
    const resources = (data ?? []).map((row: { resource_kind_id: string }) => {
      const kind = kindById.get(row.resource_kind_id);
      return {
        ...row,
        kind_name: kind?.name ?? 'Recurso',
        service_group_slug: kind?.service_group_slug ?? null,
        allocation_policy: kind?.allocation_policy ?? 'optional',
      };
    });
    return res.json({ resources });
  } catch (e: unknown) {
    console.error('listHubResources', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao listar recursos' });
  }
};

const createResourceSchema = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr,
  resource_kind_id: uuidStr,
  name: z.string().trim().min(1).max(120),
  sort_order: z.number().int().min(0).max(9999).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const createHubResource = async (req: Request, res: Response) => {
  try {
    const parsed = createResourceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    const b = parsed.data;
    const { data: kind } = await supabaseAdmin
      .from('hub_resource_kinds')
      .select('id, name, service_group_slug, allocation_policy')
      .eq('id', b.resource_kind_id)
      .eq('clinic_id', b.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!kind) return res.status(400).json({ error: 'Tipo de recurso inválido.' });
    const { data: unit } = await supabaseAdmin
      .from('units')
      .select('id')
      .eq('id', b.unit_id)
      .eq('clinic_id', b.clinic_id)
      .maybeSingle();
    if (!unit) return res.status(400).json({ error: 'Unidade inválida.' });

    const { data, error } = await supabaseAdmin
      .from('hub_resources')
      .insert({
        clinic_id: b.clinic_id,
        unit_id: b.unit_id,
        resource_kind_id: b.resource_kind_id,
        name: b.name,
        sort_order: b.sort_order ?? 0,
        notes: b.notes ?? null,
      })
      .select(RESOURCE_SELECT)
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe um recurso com esse nome nesta unidade.' });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json({
      resource: {
        ...data,
        kind_name: kind.name,
        service_group_slug: kind.service_group_slug,
        allocation_policy: kind.allocation_policy,
      },
    });
  } catch (e: unknown) {
    console.error('createHubResource', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar recurso' });
  }
};

const patchResourceSchema = z.object({
  clinic_id: uuidStr,
  name: z.string().trim().min(1).max(120).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().optional(),
});

export const patchHubResource = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const body = patchResourceSchema.safeParse(req.body);
    if (!id.success || !body.success) return res.status(400).json({ error: 'Dados inválidos' });
    const { clinic_id, ...fields } = body.data;
    const { data, error } = await supabaseAdmin
      .from('hub_resources')
      .update(fields)
      .eq('id', id.data)
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null)
      .select(RESOURCE_SELECT)
      .maybeSingle();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe um recurso com esse nome nesta unidade.' });
      return res.status(500).json({ error: error.message });
    }
    if (!data) return res.status(404).json({ error: 'Recurso não encontrado' });
    return res.json({ resource: data });
  } catch (e: unknown) {
    console.error('patchHubResource', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar recurso' });
  }
};

export const deleteHubResource = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinicId = uuidStr.safeParse(req.query.clinic_id ?? req.body?.clinic_id);
    if (!id.success || !clinicId.success) return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('hub_resources')
      .update({ deleted_at: now, active: false })
      .eq('id', id.data)
      .eq('clinic_id', clinicId.data)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Recurso não encontrado' });
    return res.status(204).send();
  } catch (e: unknown) {
    console.error('deleteHubResource', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao excluir recurso' });
  }
};

const availabilityQuery = z.object({
  clinic_id: uuidStr,
  unit_id: uuidStr,
  hub_service_type_id: uuidStr,
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  exclude_appointment_id: uuidStr.optional(),
  mode: z.enum(['window', 'now']).optional(),
});

export const getHubResourceAvailability = async (req: Request, res: Response) => {
  try {
    const parsed = availabilityQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Parâmetros inválidos', details: parsed.error.flatten() });
    const b = parsed.data;
    const result = await getResourceAvailability({
      clinicId: b.clinic_id,
      unitId: b.unit_id,
      serviceTypeId: b.hub_service_type_id,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      excludeAppointmentId: b.exclude_appointment_id ?? null,
      mode: b.mode ?? 'window',
    });
    if ('error' in result) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (e: unknown) {
    console.error('getHubResourceAvailability', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao consultar disponibilidade' });
  }
};

export const getHubServiceTypeResourceKinds = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinicId = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinicId.success) return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
    const { data, error } = await supabaseAdmin
      .from('hub_service_type_resource_kinds')
      .select('resource_kind_id')
      .eq('clinic_id', clinicId.data)
      .eq('hub_service_type_id', id.data);
    if (error) return res.status(500).json({ error: error.message });
    const ids = (data ?? []).map((r: { resource_kind_id: string }) => r.resource_kind_id);
    return res.json({ inherit: ids.length === 0, resource_kind_ids: ids });
  } catch (e: unknown) {
    console.error('getHubServiceTypeResourceKinds', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao ler restrição de recursos' });
  }
};

const putServiceKindsSchema = z.object({
  clinic_id: uuidStr,
  resource_kind_ids: z.array(uuidStr).max(40),
});

export const putHubServiceTypeResourceKinds = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const body = putServiceKindsSchema.safeParse(req.body);
    if (!id.success || !body.success) return res.status(400).json({ error: 'Dados inválidos' });
    const { data: service } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, service_group')
      .eq('id', id.data)
      .eq('clinic_id', body.data.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado' });

    const ids = [...new Set(body.data.resource_kind_ids)];
    if (ids.length > 0) {
      const { data: kinds, error: kindErr } = await supabaseAdmin
        .from('hub_resource_kinds')
        .select('id')
        .eq('clinic_id', body.data.clinic_id)
        .eq('service_group_slug', service.service_group as string)
        .in('id', ids)
        .is('deleted_at', null);
      if (kindErr) return res.status(500).json({ error: kindErr.message });
      if ((kinds ?? []).length !== ids.length) {
        return res.status(400).json({ error: 'Um dos tipos não pertence ao grupo deste serviço.' });
      }
    }

    const { error: delErr } = await supabaseAdmin
      .from('hub_service_type_resource_kinds')
      .delete()
      .eq('clinic_id', body.data.clinic_id)
      .eq('hub_service_type_id', id.data);
    if (delErr) return res.status(500).json({ error: delErr.message });

    if (ids.length > 0) {
      const { error: insErr } = await supabaseAdmin.from('hub_service_type_resource_kinds').insert(
        ids.map((resource_kind_id) => ({
          clinic_id: body.data.clinic_id,
          hub_service_type_id: id.data,
          resource_kind_id,
        })),
      );
      if (insErr) return res.status(500).json({ error: insErr.message });
    }
    return res.json({ inherit: ids.length === 0, resource_kind_ids: ids });
  } catch (e: unknown) {
    console.error('putHubServiceTypeResourceKinds', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao salvar restrição de recursos' });
  }
};
