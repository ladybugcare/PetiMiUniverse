import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';

const uuidStr = z.string().uuid();

const caseStatusSchema = z.enum(['active', 'monitoring', 'resolved', 'cancelled']);

const createCaseSchema = z
  .object({
    clinic_id: uuidStr,
    unit_id: uuidStr.optional().nullable(),
    pet_id: uuidStr,
    guardian_id_snapshot: uuidStr.optional().nullable(),
    primary_veterinarian_id: uuidStr.optional().nullable(),
    title: z.string().trim().min(1).max(500),
    summary: z.string().trim().max(4000).optional().nullable(),
    status: caseStatusSchema.optional().default('active'),
    tags: z.array(z.string().trim().max(100)).optional().default([]),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
    opened_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const patchCaseSchema = z
  .object({
    clinic_id: uuidStr,
    title: z.string().trim().min(1).max(500).optional(),
    summary: z.string().trim().max(4000).optional().nullable(),
    status: caseStatusSchema.optional(),
    tags: z.array(z.string().trim().max(100)).optional(),
    primary_veterinarian_id: uuidStr.optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const CASE_SELECT = `
  id, clinic_id, unit_id, pet_id, guardian_id_snapshot, primary_veterinarian_id,
  title, summary, status, tags, metadata, opened_at, closed_at, created_at, updated_at
`;

async function enrichCase(row: Record<string, unknown>) {
  const petId = row.pet_id as string;
  const vetId = row.primary_veterinarian_id as string | null;
  const guardianId = row.guardian_id_snapshot as string | null;

  const [petRes, vetRes, guardianRes] = await Promise.all([
    supabaseAdmin
      .from('hub_pets')
      .select('id, name, species, breed, birth_date')
      .eq('id', petId)
      .maybeSingle(),
    vetId
      ? supabaseAdmin.from('hub_staff_members').select('id, full_name').eq('id', vetId).maybeSingle()
      : Promise.resolve({ data: null }),
    guardianId
      ? supabaseAdmin.from('hub_guardians').select('id, full_name').eq('id', guardianId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    ...row,
    pet: petRes.data,
    primary_veterinarian: vetRes.data,
    guardian_snapshot: guardianRes.data,
  };
}

/** GET /clinical/cases — lista casos de uma clínica, filtros opcionais por pet_id e status. */
export const listHubClinicalCases = async (req: Request, res: Response) => {
  try {
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!clinic_id.success) return res.status(400).json({ error: 'clinic_id obrigatório' });

    const pet_id = req.query.pet_id ? uuidStr.safeParse(req.query.pet_id) : null;
    const status = req.query.status ? caseStatusSchema.safeParse(req.query.status) : null;

    let q = supabaseAdmin
      .from('hub_clinical_cases')
      .select(CASE_SELECT)
      .eq('clinic_id', clinic_id.data)
      .is('deleted_at', null)
      .order('opened_at', { ascending: false })
      .limit(200);

    if (pet_id?.success) q = q.eq('pet_id', pet_id.data);
    if (status?.success) q = q.eq('status', status.data);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ cases: data ?? [] });
  } catch (e: unknown) {
    console.error('listHubClinicalCases', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao listar casos clínicos' });
  }
};

/** GET /clinical/cases/:id */
export const getHubClinicalCase = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic_id.success) {
      return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
    }

    const { data, error } = await supabaseAdmin
      .from('hub_clinical_cases')
      .select(CASE_SELECT)
      .eq('id', id.data)
      .eq('clinic_id', clinic_id.data)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Caso clínico não encontrado' });

    const enriched = await enrichCase(data as Record<string, unknown>);
    return res.json({ case: enriched });
  } catch (e: unknown) {
    console.error('getHubClinicalCase', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao carregar caso clínico' });
  }
};

/** POST /clinical/cases */
export const createHubClinicalCase = async (req: Request, res: Response) => {
  try {
    const parsed = createCaseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;

    const { data: pet } = await supabaseAdmin
      .from('hub_pets')
      .select('id')
      .eq('id', b.pet_id)
      .eq('clinic_id', b.clinic_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!pet) return res.status(400).json({ error: 'Pet inválido para esta clínica' });

    const insert = {
      clinic_id: b.clinic_id,
      unit_id: b.unit_id ?? null,
      pet_id: b.pet_id,
      guardian_id_snapshot: b.guardian_id_snapshot ?? null,
      primary_veterinarian_id: b.primary_veterinarian_id ?? null,
      title: b.title,
      summary: b.summary ?? null,
      status: b.status,
      tags: b.tags,
      metadata: b.metadata,
      opened_at: b.opened_at ?? new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('hub_clinical_cases')
      .insert(insert)
      .select(CASE_SELECT)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const enriched = await enrichCase(data as Record<string, unknown>);
    return res.status(201).json({ case: enriched });
  } catch (e: unknown) {
    console.error('createHubClinicalCase', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar caso clínico' });
  }
};

/** PATCH /clinical/cases/:id — edita título/summary/status/tags/primary_vet. */
export const patchHubClinicalCase = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'id inválido' });

    const parsed = patchCaseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const b = parsed.data;

    const patch: Record<string, unknown> = {};
    if (b.title !== undefined) patch.title = b.title;
    if (b.summary !== undefined) patch.summary = b.summary;
    if (b.tags !== undefined) patch.tags = b.tags;
    if (b.primary_veterinarian_id !== undefined) patch.primary_veterinarian_id = b.primary_veterinarian_id;
    if (b.metadata !== undefined) patch.metadata = b.metadata;

    if (b.status !== undefined) {
      patch.status = b.status;
      if (b.status === 'resolved' || b.status === 'cancelled') {
        patch.closed_at = new Date().toISOString();
      } else {
        patch.closed_at = null;
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const { data, error } = await supabaseAdmin
      .from('hub_clinical_cases')
      .update(patch)
      .eq('id', id.data)
      .eq('clinic_id', b.clinic_id)
      .is('deleted_at', null)
      .select(CASE_SELECT)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Caso clínico não encontrado' });

    const enriched = await enrichCase(data as Record<string, unknown>);
    return res.json({ case: enriched });
  } catch (e: unknown) {
    console.error('patchHubClinicalCase', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao atualizar caso clínico' });
  }
};

/** DELETE /clinical/cases/:id — soft-delete. */
export const deleteHubClinicalCase = async (req: Request, res: Response) => {
  try {
    const id = uuidStr.safeParse(req.params.id);
    const clinic_id = uuidStr.safeParse(req.query.clinic_id);
    if (!id.success || !clinic_id.success) {
      return res.status(400).json({ error: 'id e clinic_id são obrigatórios' });
    }

    const { data: enc } = await supabaseAdmin
      .from('hub_encounters')
      .select('id')
      .eq('hub_case_id', id.data)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (enc) {
      return res.status(409).json({ error: 'Caso possui atendimentos vinculados e não pode ser removido' });
    }

    const { error } = await supabaseAdmin
      .from('hub_clinical_cases')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id.data)
      .eq('clinic_id', clinic_id.data)
      .is('deleted_at', null);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).send();
  } catch (e: unknown) {
    console.error('deleteHubClinicalCase', e);
    return res.status(500).json({ error: (e as Error)?.message || 'Erro ao remover caso clínico' });
  }
};

/**
 * Utilitário interno: retorna ou cria um caso clínico para o encounter.
 * Chamado por hubEncountersController ao criar/abrir um atendimento.
 *
 * Lógica:
 * - Se hub_case_id foi explicitamente enviado → valida que pertence ao pet/clínica e está ativo/monitoring.
 * - Se create_new_case=true  → cria novo caso.
 * - Se nenhum → verifica se há casos active/monitoring para o pet; se sim, reaproveita o mais recente.
 *               Se não, cria auto-caso.
 */
export async function resolveOrCreateClinicalCase(opts: {
  clinic_id: string;
  unit_id?: string | null;
  pet_id: string;
  guardian_id?: string | null;
  primary_veterinarian_id?: string | null;
  chief_complaint?: string | null;
  started_at?: string;
  hub_case_id?: string | null;
  create_new_case?: boolean;
  /** Título do novo caso quando `create_new_case` (sobrepõe queixa como título). */
  new_case_title?: string | null;
}): Promise<string> {
  const {
    clinic_id,
    unit_id,
    pet_id,
    guardian_id,
    primary_veterinarian_id,
    chief_complaint,
    started_at,
    hub_case_id,
    create_new_case,
    new_case_title,
  } = opts;

  // Caso fornecido explicitamente: validar
  if (hub_case_id) {
    const { data: existing } = await supabaseAdmin
      .from('hub_clinical_cases')
      .select('id, status')
      .eq('id', hub_case_id)
      .eq('clinic_id', clinic_id)
      .eq('pet_id', pet_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) {
      throw new Error('Caso clínico não encontrado ou não pertence a este pet/clínica');
    }
    if (existing.status === 'resolved' || existing.status === 'cancelled') {
      throw new Error('Não é possível adicionar atendimento a um caso resolvido ou cancelado');
    }
    return existing.id as string;
  }

  // Criar novo caso explicitamente
  if (create_new_case) {
    return createAutoCase({
      clinic_id,
      unit_id,
      pet_id,
      guardian_id,
      primary_veterinarian_id,
      chief_complaint,
      started_at,
      case_title: new_case_title ?? null,
    });
  }

  // Sem indicação explícita: buscar caso ativo/monitoring mais recente
  const { data: activeCases } = await supabaseAdmin
    .from('hub_clinical_cases')
    .select('id, status')
    .eq('clinic_id', clinic_id)
    .eq('pet_id', pet_id)
    .in('status', ['active', 'monitoring'])
    .is('deleted_at', null)
    .order('opened_at', { ascending: false })
    .limit(1);

  if (activeCases && activeCases.length > 0) {
    return (activeCases[0] as { id: string }).id;
  }

  // Sem caso ativo → cria auto-caso
  return createAutoCase({ clinic_id, unit_id, pet_id, guardian_id, primary_veterinarian_id, chief_complaint, started_at });
}

async function createAutoCase(opts: {
  clinic_id: string;
  unit_id?: string | null;
  pet_id: string;
  guardian_id?: string | null;
  primary_veterinarian_id?: string | null;
  chief_complaint?: string | null;
  started_at?: string;
  /** Se informado, usa como título do caso em vez da queixa principal. */
  case_title?: string | null;
}): Promise<string> {
  const title =
    opts.case_title?.trim() || opts.chief_complaint?.trim() || 'Atendimento avulso';
  const { data, error } = await supabaseAdmin
    .from('hub_clinical_cases')
    .insert({
      clinic_id: opts.clinic_id,
      unit_id: opts.unit_id ?? null,
      pet_id: opts.pet_id,
      guardian_id_snapshot: opts.guardian_id ?? null,
      primary_veterinarian_id: opts.primary_veterinarian_id ?? null,
      title,
      status: 'active',
      opened_at: opts.started_at ?? new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw new Error(`Erro ao criar caso clínico automático: ${error.message}`);
  return (data as { id: string }).id;
}
