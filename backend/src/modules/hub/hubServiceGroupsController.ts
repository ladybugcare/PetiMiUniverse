import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { slugifyServiceGroupLabel, isValidServiceGroupSlug } from './serviceTypeCode';

const uuidStr = z.string().uuid();

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Cor deve ser #RRGGBB' });

const createBodySchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().max(64).optional(),
    color: hexColorSchema,
    display_order: z.number().int().min(0).max(9999).optional(),
  })
  .strict();

const patchBodySchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().trim().min(1).max(200).optional(),
    color: hexColorSchema.optional(),
    display_order: z.number().int().min(0).max(9999).optional(),
    /** `true` arquiva; `false` restaura. */
    archived: z.boolean().optional(),
  })
  .strict();

const GROUP_SELECT =
  'id, clinic_id, name, slug, color, display_order, archived_at, created_at, updated_at';

/** Grupos que devem existir em toda a clínica (Configurações + cores na agenda). Idempotente. */
export const DEFAULT_HUB_SERVICE_GROUP_ROWS = [
  { slug: 'banho_tosa', name: 'Banho & Tosa', color: '#f0642f', display_order: 10 },
  { slug: 'hotel', name: 'Hotel', color: '#1565c0', display_order: 20 },
  { slug: 'creche', name: 'Creche', color: '#00897b', display_order: 30 },
  { slug: 'clinica', name: 'Clínica', color: '#7b1fa2', display_order: 40 },
  { slug: 'cirurgia', name: 'Cirurgia', color: '#c62828', display_order: 50 },
  { slug: 'leva_traz', name: 'Leva e Traz', color: '#5d4037', display_order: 60 },
  { slug: 'internacao', name: 'Internação', color: '#546e7a', display_order: 70 },
  { slug: 'outros', name: 'Outros', color: '#78909c', display_order: 80 },
] as const;

export type DefaultHubServiceGroupSlug = (typeof DEFAULT_HUB_SERVICE_GROUP_ROWS)[number]['slug'];

/** Insere em `hub_service_groups` as linhas em falta para a clínica (não altera nome/cor existentes). */
export async function ensureDefaultHubServiceGroups(clinicId: string): Promise<void> {
  const { data: existing, error: selErr } = await supabaseAdmin
    .from('hub_service_groups')
    .select('slug')
    .eq('clinic_id', clinicId);
  if (selErr) {
    console.warn('[hub_service_groups] ensureDefaultHubServiceGroups select', selErr.message);
    return;
  }
  const have = new Set((existing ?? []).map((r) => (r as { slug: string }).slug));
  const toInsert = DEFAULT_HUB_SERVICE_GROUP_ROWS.filter((row) => !have.has(row.slug)).map((row) => ({
    clinic_id: clinicId,
    slug: row.slug,
    name: row.name,
    color: row.color,
    display_order: row.display_order,
  }));
  if (toInsert.length === 0) return;
  const { error: insErr } = await supabaseAdmin.from('hub_service_groups').insert(toInsert);
  if (insErr && insErr.code !== '23505') {
    console.warn('[hub_service_groups] ensureDefaultHubServiceGroups insert', insErr.message);
  }
}

async function countServicesUsingGroupSlug(clinicId: string, slug: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('hub_service_types')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('service_group', slug)
    .is('deleted_at', null);
  if (error) {
    console.error('[hub_service_groups] countServicesUsingGroupSlug', error);
    return 0;
  }
  return count ?? 0;
}

export const listHubServiceGroups = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
    }
    const clinic_id = parsed.data;

    await ensureDefaultHubServiceGroups(clinic_id);

    const { data: groups, error: gErr } = await supabaseAdmin
      .from('hub_service_groups')
      .select(GROUP_SELECT)
      .eq('clinic_id', clinic_id)
      .order('archived_at', { ascending: true, nullsFirst: true })
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (gErr) {
      console.error('[hub_service_groups] list', gErr);
      return res.status(500).json({ error: 'Erro ao listar grupos de serviço' });
    }

    const { data: types, error: tErr } = await supabaseAdmin
      .from('hub_service_types')
      .select('service_group')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null);

    if (tErr) {
      console.error('[hub_service_groups] list types for counts', tErr);
    }

    const counts = new Map<string, number>();
    for (const row of types ?? []) {
      const g = (row as { service_group?: string }).service_group || 'outros';
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }

    const service_groups = (groups ?? []).map((row) => ({
      ...row,
      service_count: counts.get((row as { slug: string }).slug) ?? 0,
    }));

    return res.json({ service_groups });
  } catch (e) {
    console.error('[hub_service_groups] list', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const createHubServiceGroup = async (req: Request, res: Response) => {
  try {
    const body = createBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    }
    const { clinic_id, name, color, display_order } = body.data;
    const slugInput = body.data.slug?.trim();
    const slugRaw = slugInput ? slugifyServiceGroupLabel(slugInput) : slugifyServiceGroupLabel(name);
    const slug = slugRaw || 'grupo';
    if (!isValidServiceGroupSlug(slug)) {
      return res.status(400).json({ error: 'Slug do grupo inválido' });
    }

    const row = {
      clinic_id,
      name: name.trim(),
      slug,
      color,
      display_order: display_order ?? 0,
    };

    const { data, error } = await supabaseAdmin.from('hub_service_groups').insert([row]).select(GROUP_SELECT).single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe um grupo com este slug nesta clínica' });
      }
      console.error('[hub_service_groups] create', error);
      return res.status(500).json({ error: 'Erro ao criar grupo' });
    }

    const service_count = await countServicesUsingGroupSlug(clinic_id, slug);
    return res.status(201).json({ service_group: { ...data, service_count } });
  } catch (e) {
    console.error('[hub_service_groups] create', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const patchHubServiceGroup = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    if (!idParsed.success) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const id = idParsed.data;

    const body = patchBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    }
    const { clinic_id, name, color, display_order, archived } = body.data;

    if (
      name === undefined &&
      color === undefined &&
      display_order === undefined &&
      archived === undefined
    ) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('hub_service_groups')
      .select('id, clinic_id, slug')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }
    if (existing.clinic_id !== clinic_id) {
      return res.status(403).json({ error: 'Grupo não pertence a esta clínica' });
    }

    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (color !== undefined) patch.color = color;
    if (display_order !== undefined) patch.display_order = display_order;
    if (archived === true) patch.archived_at = new Date().toISOString();
    else if (archived === false) patch.archived_at = null;

    const { data, error } = await supabaseAdmin
      .from('hub_service_groups')
      .update(patch)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .select(GROUP_SELECT)
      .single();

    if (error) {
      console.error('[hub_service_groups] patch', error);
      return res.status(500).json({ error: 'Erro ao atualizar grupo' });
    }

    const service_count = await countServicesUsingGroupSlug(clinic_id, (existing as { slug: string }).slug);
    return res.json({ service_group: { ...data, service_count } });
  } catch (e) {
    console.error('[hub_service_groups] patch', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const deleteHubServiceGroup = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    if (!idParsed.success) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const id = idParsed.data;

    const clinicParsed = uuidStr.safeParse(req.query.clinic_id);
    if (!clinicParsed.success) {
      return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
    }
    const clinic_id = clinicParsed.data;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('hub_service_groups')
      .select('id, clinic_id, slug')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }
    if (existing.clinic_id !== clinic_id) {
      return res.status(403).json({ error: 'Grupo não pertence a esta clínica' });
    }

    const slug = (existing as { slug: string }).slug;
    const n = await countServicesUsingGroupSlug(clinic_id, slug);
    if (n > 0) {
      return res.status(409).json({
        error: `Não é possível apagar: existem ${n} serviço(s) ativo(s) com este grupo.`,
      });
    }

    const { error } = await supabaseAdmin.from('hub_service_groups').delete().eq('id', id).eq('clinic_id', clinic_id);

    if (error) {
      console.error('[hub_service_groups] delete', error);
      return res.status(500).json({ error: 'Erro ao apagar grupo' });
    }

    return res.status(204).send();
  } catch (e) {
    console.error('[hub_service_groups] delete', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
