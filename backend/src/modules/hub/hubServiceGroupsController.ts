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
    description: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

const patchBodySchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().trim().min(1).max(200).optional(),
    color: hexColorSchema.optional(),
    display_order: z.number().int().min(0).max(9999).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    /** `true` arquiva; `false` restaura. */
    archived: z.boolean().optional(),
  })
  .strict();

const patchJobFunctionsBodySchema = z
  .object({
    clinic_id: uuidStr,
    job_titles: z.array(z.string().trim().min(1).max(200)),
  })
  .strict();

const GROUP_SELECT_FULL =
  'id, clinic_id, name, slug, color, display_order, description, archived_at, created_at, updated_at';

const GROUP_SELECT_LEGACY =
  'id, clinic_id, name, slug, color, display_order, created_at, updated_at';

type HubServiceGroupRow = {
  id: string;
  clinic_id: string;
  name: string;
  slug: string;
  color: string;
  display_order: number;
  description?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
};

function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  return err?.code === '42703' || /column .* does not exist/i.test(err?.message ?? '');
}

/** Lista grupos; faz fallback se `description` / `archived_at` ainda não existirem na BD. */
async function queryHubServiceGroups(clinicId: string): Promise<{
  rows: HubServiceGroupRow[];
  error: { code?: string; message?: string } | null;
}> {
  const full = await supabaseAdmin
    .from('hub_service_groups')
    .select(GROUP_SELECT_FULL)
    .eq('clinic_id', clinicId)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (!full.error) {
    return { rows: (full.data ?? []) as HubServiceGroupRow[], error: null };
  }

  if (!isMissingColumnError(full.error)) {
    return { rows: [], error: full.error };
  }

  const legacy = await supabaseAdmin
    .from('hub_service_groups')
    .select(GROUP_SELECT_LEGACY)
    .eq('clinic_id', clinicId)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (legacy.error) {
    return { rows: [], error: legacy.error };
  }

  const rows = (legacy.data ?? []).map((r) => ({
    ...(r as HubServiceGroupRow),
    description: null,
    archived_at: null,
  }));
  return { rows, error: null };
}

/** Mapeamento padrão grupo → funções (`job_title`). Idempotente — só insere em falta. */
export const DEFAULT_HUB_SERVICE_GROUP_JOB_FUNCTIONS: ReadonlyArray<{
  slug: string;
  job_titles: readonly string[];
}> = [
  { slug: 'banho_tosa', job_titles: ['Banho & Tosa'] },
  {
    slug: 'clinica',
    job_titles: ['Médico(a) Veterinário(a)', 'Auxiliar Veterinário(a)', 'Enfermeiro(a) Veterinário(a)'],
  },
  { slug: 'cirurgia', job_titles: ['Médico(a) Veterinário(a)', 'Enfermeiro(a) Veterinário(a)'] },
  { slug: 'hotel', job_titles: ['Recreador(a)', 'Auxiliar Veterinário(a)'] },
  { slug: 'creche', job_titles: ['Recreador(a)'] },
  { slug: 'leva_traz', job_titles: ['Motorista'] },
  { slug: 'internacao', job_titles: ['Enfermeiro(a) Veterinário(a)', 'Auxiliar Veterinário(a)'] },
  { slug: 'outros', job_titles: ['Outros'] },
] as const;

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

/** Insere mapeamentos grupo↔função em falta (não remove customizações). */
export async function ensureDefaultGroupJobFunctions(clinicId: string): Promise<void> {
  await ensureDefaultHubServiceGroups(clinicId);

  const { data: existing, error: selErr } = await supabaseAdmin
    .from('hub_service_group_job_functions')
    .select('service_group_slug, job_title')
    .eq('clinic_id', clinicId);

  if (selErr) {
    console.warn('[hub_service_group_job_functions] ensure select', selErr.message);
    return;
  }

  const have = new Set(
    (existing ?? []).map(
      (r) => `${(r as { service_group_slug: string }).service_group_slug}\0${(r as { job_title: string }).job_title}`,
    ),
  );

  const toInsert: { clinic_id: string; service_group_slug: string; job_title: string }[] = [];
  for (const row of DEFAULT_HUB_SERVICE_GROUP_JOB_FUNCTIONS) {
    for (const job_title of row.job_titles) {
      const key = `${row.slug}\0${job_title}`;
      if (!have.has(key)) {
        toInsert.push({ clinic_id: clinicId, service_group_slug: row.slug, job_title });
      }
    }
  }

  if (toInsert.length === 0) return;

  const { error: insErr } = await supabaseAdmin.from('hub_service_group_job_functions').insert(toInsert);
  if (insErr && insErr.code !== '23505') {
    console.warn('[hub_service_group_job_functions] ensure insert', insErr.message);
  }
}

async function fetchJobFunctionsMap(clinicId: string): Promise<Map<string, string[]>> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_group_job_functions')
    .select('service_group_slug, job_title')
    .eq('clinic_id', clinicId)
    .order('job_title', { ascending: true });

  if (error) {
    console.warn('[hub_service_group_job_functions] fetch', error.message);
    return new Map();
  }

  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    const slug = (row as { service_group_slug: string }).service_group_slug;
    const title = (row as { job_title: string }).job_title;
    const list = map.get(slug) ?? [];
    list.push(title);
    map.set(slug, list);
  }
  return map;
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

    await ensureDefaultGroupJobFunctions(clinic_id);

    const { rows: groups, error: gErr } = await queryHubServiceGroups(clinic_id);

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

    const jobFnMap = await fetchJobFunctionsMap(clinic_id);

    const service_groups = groups.map((row) => {
      const slug = (row as { slug: string }).slug;
      return {
        ...row,
        service_count: counts.get(slug) ?? 0,
        job_functions: jobFnMap.get(slug) ?? [],
      };
    });

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
    const { clinic_id, name, color, display_order, description } = body.data;
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
      description: description?.trim() || null,
    };

    const { data, error } = await supabaseAdmin.from('hub_service_groups').insert([row]).select(GROUP_SELECT_FULL).single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe um grupo com este slug nesta clínica' });
      }
      console.error('[hub_service_groups] create', error);
      return res.status(500).json({ error: 'Erro ao criar grupo' });
    }

    const service_count = await countServicesUsingGroupSlug(clinic_id, slug);
    return res.status(201).json({ service_group: { ...data, service_count, job_functions: [] } });
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
    const { clinic_id, name, color, display_order, description, archived } = body.data;

    if (
      name === undefined &&
      color === undefined &&
      display_order === undefined &&
      description === undefined &&
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
    if (description !== undefined) patch.description = description?.trim() || null;
    if (archived === true) patch.archived_at = new Date().toISOString();
    else if (archived === false) patch.archived_at = null;

    const { data, error } = await supabaseAdmin
      .from('hub_service_groups')
      .update(patch)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .select(GROUP_SELECT_FULL)
      .single();

    if (error) {
      console.error('[hub_service_groups] patch', error);
      return res.status(500).json({ error: 'Erro ao atualizar grupo' });
    }

    const slug = (existing as { slug: string }).slug;
    const jobFnMap = await fetchJobFunctionsMap(clinic_id);
    const service_count = await countServicesUsingGroupSlug(clinic_id, slug);
    return res.json({
      service_group: { ...data, service_count, job_functions: jobFnMap.get(slug) ?? [] },
    });
  } catch (e) {
    console.error('[hub_service_groups] patch', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/** GET /api/hub/service-groups/job-mappings?clinic_id= */
export const getHubServiceGroupJobMappings = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
    }
    const clinic_id = parsed.data;
    await ensureDefaultGroupJobFunctions(clinic_id);
    const map = await fetchJobFunctionsMap(clinic_id);
    const mappings: Record<string, string[]> = {};
    for (const [slug, titles] of map.entries()) {
      mappings[slug] = titles;
    }
    return res.json({ mappings });
  } catch (e) {
    console.error('[hub_service_groups] job-mappings', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/** PATCH /api/hub/service-groups/:id/job-functions */
export const patchHubServiceGroupJobFunctions = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    if (!idParsed.success) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const id = idParsed.data;

    const body = patchJobFunctionsBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    }
    const { clinic_id, job_titles } = body.data;

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
    const uniqueTitles = [...new Set(job_titles.map((t) => t.trim()).filter(Boolean))];

    await supabaseAdmin
      .from('hub_service_group_job_functions')
      .delete()
      .eq('clinic_id', clinic_id)
      .eq('service_group_slug', slug);

    if (uniqueTitles.length > 0) {
      const rows = uniqueTitles.map((job_title) => ({
        clinic_id,
        service_group_slug: slug,
        job_title,
      }));
      const { error: insErr } = await supabaseAdmin.from('hub_service_group_job_functions').insert(rows);
      if (insErr) {
        console.error('[hub_service_group_job_functions] patch insert', insErr);
        return res.status(500).json({ error: 'Erro ao guardar funções do grupo' });
      }
    }

    const service_count = await countServicesUsingGroupSlug(clinic_id, slug);
    const { data: groupRow } = await supabaseAdmin
      .from('hub_service_groups')
      .select(GROUP_SELECT_FULL)
      .eq('id', id)
      .single();

    return res.json({
      service_group: {
        ...groupRow,
        service_count,
        job_functions: uniqueTitles,
      },
    });
  } catch (e) {
    console.error('[hub_service_groups] patch job-functions', e);
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
