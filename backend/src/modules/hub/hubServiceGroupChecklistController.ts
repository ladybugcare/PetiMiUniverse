import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { slugifyServiceNameToCode } from './serviceTypeCode';
import { ensureDefaultHubServiceGroups } from './hubServiceGroupsController';
import {
  hasSystemChecklistDefault,
  parseChecklistTemplateItems,
  resolveChecklistTemplateItems,
  type ChecklistTemplateItem,
} from './serviceGroupChecklistDefaults';

const uuidStr = z.string().uuid();
const slugParamSchema = z.string().trim().regex(/^[a-z0-9_]{1,64}$/);

const checklistItemInputSchema = z
  .object({
    key: z.string().trim().regex(/^[a-z0-9_]{1,64}$/).optional(),
    label: z.string().trim().min(1).max(200),
    default_checked: z.boolean().optional(),
  })
  .strict();

const putBodySchema = z
  .object({
    clinic_id: uuidStr,
    items: z.array(checklistItemInputSchema).max(30),
  })
  .strict();

type TemplateRow = {
  service_group_slug: string;
  items: unknown;
};

function normalizeChecklistItemsInput(
  items: z.infer<typeof putBodySchema>['items'],
): ChecklistTemplateItem[] {
  const usedKeys = new Set<string>();
  const result: ChecklistTemplateItem[] = [];

  for (const item of items) {
    let key = item.key?.trim() ?? '';
    if (!key) {
      const base = slugifyServiceNameToCode(item.label);
      key = base;
      let n = 2;
      while (usedKeys.has(key)) {
        key = `${base}_${n}`;
        n += 1;
      }
    }
    if (usedKeys.has(key)) {
      throw new Error(`Chave de checklist duplicada: ${key}`);
    }
    usedKeys.add(key);
    result.push({
      key,
      label: item.label.trim(),
      default_checked: Boolean(item.default_checked),
    });
  }
  return result;
}

async function loadTemplateRows(clinicId: string): Promise<TemplateRow[]> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_group_checklist_templates')
    .select('service_group_slug, items')
    .eq('clinic_id', clinicId)
    .is('unit_id', null);
  if (error) {
    console.error('[hub_service_group_checklist] load rows', error);
    return [];
  }
  return (data ?? []) as TemplateRow[];
}

async function findServiceGroupSlug(clinicId: string, slug: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_groups')
    .select('slug')
    .eq('clinic_id', clinicId)
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error('[hub_service_group_checklist] find group', error);
    return false;
  }
  return Boolean(data);
}

function buildGroupChecklistPayload(
  slug: string,
  name: string,
  color: string,
  templateBySlug: Map<string, ChecklistTemplateItem[]>,
) {
  const customItems = templateBySlug.has(slug) ? templateBySlug.get(slug)! : null;
  const isCustom = templateBySlug.has(slug);
  const items = resolveChecklistTemplateItems(slug, isCustom ? customItems : null);
  return {
    slug,
    name,
    color,
    items,
    is_custom: isCustom,
    has_system_default: hasSystemChecklistDefault(slug),
  };
}

/** Carrega itens efetivos do checklist de um grupo (nível clínica; MVP). */
export async function loadServiceGroupChecklistTemplateItems(
  clinicId: string,
  serviceGroupSlug: string,
): Promise<ChecklistTemplateItem[]> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_group_checklist_templates')
    .select('items')
    .eq('clinic_id', clinicId)
    .eq('service_group_slug', serviceGroupSlug)
    .is('unit_id', null)
    .maybeSingle();
  if (error) {
    console.error('[hub_service_group_checklist] load template', error);
    return resolveChecklistTemplateItems(serviceGroupSlug, null);
  }
  if (!data) {
    return resolveChecklistTemplateItems(serviceGroupSlug, null);
  }
  return resolveChecklistTemplateItems(serviceGroupSlug, parseChecklistTemplateItems(data.items));
}

export const listHubServiceGroupChecklists = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
    }
    const clinicId = parsed.data;
    await ensureDefaultHubServiceGroups(clinicId);

    const [{ rows: groups, error: groupsErr }, templateRows] = await Promise.all([
      supabaseAdmin
        .from('hub_service_groups')
        .select('slug, name, color, display_order, archived_at')
        .eq('clinic_id', clinicId)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true })
        .then((r) => ({ rows: r.data ?? [], error: r.error })),
      loadTemplateRows(clinicId),
    ]);

    if (groupsErr) {
      console.error('[hub_service_group_checklist] list groups', groupsErr);
      return res.status(500).json({ error: groupsErr.message });
    }

    const templateBySlug = new Map<string, ChecklistTemplateItem[]>();
    for (const row of templateRows) {
      templateBySlug.set(row.service_group_slug, parseChecklistTemplateItems(row.items));
    }

    const activeGroups = (groups as Array<{ slug: string; name: string; color: string; archived_at?: string | null }>)
      .filter((g) => !g.archived_at)
      .map((g) => buildGroupChecklistPayload(g.slug, g.name, g.color, templateBySlug));

    return res.json({ groups: activeGroups });
  } catch (e) {
    console.error('[hub_service_group_checklist] list', e);
    return res.status(500).json({ error: 'Erro ao listar checklists' });
  }
};

export const getHubServiceGroupChecklist = async (req: Request, res: Response) => {
  try {
    const slugParsed = slugParamSchema.safeParse(req.params.slug);
    if (!slugParsed.success) {
      return res.status(400).json({ error: 'slug inválido' });
    }
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicParsed.success) {
      return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
    }
    const clinicId = clinicParsed.data;
    const slug = slugParsed.data;

    await ensureDefaultHubServiceGroups(clinicId);
    const exists = await findServiceGroupSlug(clinicId, slug);
    if (!exists) {
      return res.status(404).json({ error: 'Grupo de serviço não encontrado' });
    }

    const { data: group, error: groupErr } = await supabaseAdmin
      .from('hub_service_groups')
      .select('slug, name, color')
      .eq('clinic_id', clinicId)
      .eq('slug', slug)
      .maybeSingle();
    if (groupErr || !group) {
      return res.status(404).json({ error: 'Grupo de serviço não encontrado' });
    }

    const { data: templateRow } = await supabaseAdmin
      .from('hub_service_group_checklist_templates')
      .select('items')
      .eq('clinic_id', clinicId)
      .eq('service_group_slug', slug)
      .is('unit_id', null)
      .maybeSingle();

    const isCustom = Boolean(templateRow);
    const customItems = isCustom ? parseChecklistTemplateItems(templateRow!.items) : null;
    const g = group as { slug: string; name: string; color: string };

    return res.json({
      group: {
        slug: g.slug,
        name: g.name,
        color: g.color,
        items: resolveChecklistTemplateItems(slug, isCustom ? customItems : null),
        is_custom: isCustom,
        has_system_default: hasSystemChecklistDefault(slug),
      },
    });
  } catch (e) {
    console.error('[hub_service_group_checklist] get', e);
    return res.status(500).json({ error: 'Erro ao carregar checklist' });
  }
};

export const putHubServiceGroupChecklist = async (req: Request, res: Response) => {
  try {
    const slugParsed = slugParamSchema.safeParse(req.params.slug);
    if (!slugParsed.success) {
      return res.status(400).json({ error: 'slug inválido' });
    }
    const body = putBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    }
    const slug = slugParsed.data;
    const { clinic_id, items } = body.data;

    await ensureDefaultHubServiceGroups(clinic_id);
    const exists = await findServiceGroupSlug(clinic_id, slug);
    if (!exists) {
      return res.status(404).json({ error: 'Grupo de serviço não encontrado' });
    }

    let normalized: ChecklistTemplateItem[];
    try {
      normalized = normalizeChecklistItemsInput(items);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    const { data: group } = await supabaseAdmin
      .from('hub_service_groups')
      .select('slug, name, color')
      .eq('clinic_id', clinic_id)
      .eq('slug', slug)
      .maybeSingle();

    const { error } = await supabaseAdmin.from('hub_service_group_checklist_templates').upsert(
      {
        clinic_id,
        unit_id: null,
        service_group_slug: slug,
        items: normalized,
      },
      { onConflict: 'clinic_id,unit_id,service_group_slug' },
    );

    if (error) {
      console.error('[hub_service_group_checklist] put', error);
      return res.status(500).json({ error: error.message });
    }

    const g = group as { slug: string; name: string; color: string };
    return res.json({
      group: {
        slug: g.slug,
        name: g.name,
        color: g.color,
        items: normalized,
        is_custom: true,
        has_system_default: hasSystemChecklistDefault(slug),
      },
    });
  } catch (e) {
    console.error('[hub_service_group_checklist] put', e);
    return res.status(500).json({ error: 'Erro ao salvar checklist' });
  }
};

export const deleteHubServiceGroupChecklist = async (req: Request, res: Response) => {
  try {
    const slugParsed = slugParamSchema.safeParse(req.params.slug);
    if (!slugParsed.success) {
      return res.status(400).json({ error: 'slug inválido' });
    }
    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicParsed.success) {
      return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
    }
    const clinicId = clinicParsed.data;
    const slug = slugParsed.data;

    await ensureDefaultHubServiceGroups(clinicId);
    const exists = await findServiceGroupSlug(clinicId, slug);
    if (!exists) {
      return res.status(404).json({ error: 'Grupo de serviço não encontrado' });
    }

    const { data: group } = await supabaseAdmin
      .from('hub_service_groups')
      .select('slug, name, color')
      .eq('clinic_id', clinicId)
      .eq('slug', slug)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from('hub_service_group_checklist_templates')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('service_group_slug', slug)
      .is('unit_id', null);

    if (error) {
      console.error('[hub_service_group_checklist] delete', error);
      return res.status(500).json({ error: error.message });
    }

    const g = group as { slug: string; name: string; color: string };
    return res.json({
      group: {
        slug: g.slug,
        name: g.name,
        color: g.color,
        items: resolveChecklistTemplateItems(slug, null),
        is_custom: false,
        has_system_default: hasSystemChecklistDefault(slug),
      },
    });
  } catch (e) {
    console.error('[hub_service_group_checklist] delete', e);
    return res.status(500).json({ error: 'Erro ao restaurar checklist padrão' });
  }
};
