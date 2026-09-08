import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import { recordTimelineEvent } from './hubClinicalTimelineController';

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
    /** Obrigatório ao reabrir caso resolvido/cancelado (status → active/monitoring). */
    reopen_reason: z.string().trim().min(8).max(1000).optional(),
  })
  .strict();

const CASE_SELECT = `
  id, clinic_id, unit_id, pet_id, guardian_id_snapshot, primary_veterinarian_id,
  title, summary, status, tags, metadata, opened_at, closed_at, created_at, updated_at
`;

const GENERIC_CASE_TITLE_RE =
  /^(atendimento avulso|caso avulso|consulta|caso clínico|atendimento clínico)(\s*[—–-]\s*\d{2}\/\d{2}\/\d{4})?$/i;

export function isGenericClinicalCaseTitle(title?: string | null): boolean {
  const t = (title ?? '').trim();
  return t.length === 0 || GENERIC_CASE_TITLE_RE.test(t);
}

function formatCaseTitleDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

/** Título do auto-caso: queixa/título explícito, senão consulta datada (nunca "Atendimento avulso"). */
export function resolveAutoCaseTitle(opts: {
  case_title?: string | null;
  chief_complaint?: string | null;
  appointment_title?: string | null;
  started_at?: string;
}): string {
  for (const raw of [opts.case_title, opts.chief_complaint, opts.appointment_title]) {
    const t = raw?.trim();
    if (t && !isGenericClinicalCaseTitle(t)) return t.slice(0, 500);
  }
  const dateLabel = formatCaseTitleDate(opts.started_at);
  return dateLabel ? `Consulta — ${dateLabel}` : 'Consulta';
}

/** Se o caso ainda tem título genérico e há uma queixa útil, promove o título. */
export async function maybePromoteGenericCaseTitle(opts: {
  case_id?: string | null;
  clinic_id: string;
  candidate?: string | null;
}): Promise<void> {
  const next = opts.candidate?.trim();
  if (!opts.case_id || !next || isGenericClinicalCaseTitle(next)) return;

  const { data } = await supabaseAdmin
    .from('hub_clinical_cases')
    .select('id, title')
    .eq('id', opts.case_id)
    .eq('clinic_id', opts.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!data || !isGenericClinicalCaseTitle(data.title as string | null)) return;

  await supabaseAdmin
    .from('hub_clinical_cases')
    .update({ title: next.slice(0, 500) })
    .eq('id', opts.case_id)
    .eq('clinic_id', opts.clinic_id);
}

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
      const { data: current } = await supabaseAdmin
        .from('hub_clinical_cases')
        .select('status, closed_at')
        .eq('id', id.data)
        .eq('clinic_id', b.clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!current) return res.status(404).json({ error: 'Caso clínico não encontrado' });

      const opening = b.status === 'active' || b.status === 'monitoring';
      const wasClosed = current.status === 'resolved' || current.status === 'cancelled';

      if (wasClosed && opening) {
        try {
          await reopenClosedClinicalCase({
            case_id: id.data,
            clinic_id: b.clinic_id,
            reason: assertReopenReason(b.reopen_reason),
            reopened_by: req.user?.id ?? null,
            allowCancelled: true,
            nextStatus: b.status === 'monitoring' ? 'monitoring' : 'active',
          });
        } catch (reopenErr: unknown) {
          return res.status(400).json({ error: (reopenErr as Error)?.message || 'Erro ao reabrir caso' });
        }
      } else {
        patch.status = b.status;
        if (b.status === 'resolved' || b.status === 'cancelled') {
          patch.closed_at = new Date().toISOString();
        } else {
          patch.closed_at = null;
        }
      }
    }

    if (Object.keys(patch).length === 0 && b.status === undefined) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    if (Object.keys(patch).length === 0) {
      const { data: afterReopen } = await supabaseAdmin
        .from('hub_clinical_cases')
        .select(CASE_SELECT)
        .eq('id', id.data)
        .eq('clinic_id', b.clinic_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!afterReopen) return res.status(404).json({ error: 'Caso clínico não encontrado' });
      const enriched = await enrichCase(afterReopen as Record<string, unknown>);
      return res.json({ case: enriched });
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
 * Erro lançado quando um pet tem caso(s) ativo(s) mas nenhuma escolha explícita foi feita.
 * Permite que o caller retorne 409 com código tipado para a UI exibir o seletor de caso.
 */
export class CaseSelectionRequiredError extends Error {
  readonly code = 'CASE_SELECTION_REQUIRED';
  constructor() {
    super('Este pet possui caso(s) clínico(s) ativo(s). Associe a um caso existente ou crie um novo.');
    this.name = 'CaseSelectionRequiredError';
  }
}

export class CaseReopenRequiredError extends Error {
  readonly code = 'CASE_REOPEN_REQUIRED';
  constructor() {
    super('Este caso está resolvido. Informe o motivo para reabri-lo e continuar.');
    this.name = 'CaseReopenRequiredError';
  }
}

export const REOPEN_REASON_MIN = 8;

export function assertReopenReason(reason?: string | null): string {
  const t = reason?.trim() ?? '';
  if (t.length < REOPEN_REASON_MIN) {
    throw new Error(`Informe o motivo da reabertura do caso (mínimo ${REOPEN_REASON_MIN} caracteres).`);
  }
  return t;
}

type CaseReopenRecord = {
  at: string;
  previous_status: string;
  previous_closed_at: string | null;
  reason: string;
  reopened_by: string | null;
};

/**
 * Reabre caso resolvido (ou cancelado, se `allowCancelled`).
 * Preserva o fechamento original em `metadata.first_closed_at` + `reopen_history`.
 */
export async function reopenClosedClinicalCase(opts: {
  case_id: string;
  clinic_id: string;
  reason: string;
  reopened_by?: string | null;
  allowCancelled?: boolean;
  nextStatus?: 'active' | 'monitoring';
}): Promise<void> {
  const reason = assertReopenReason(opts.reason);
  const { data: row } = await supabaseAdmin
    .from('hub_clinical_cases')
    .select('id, pet_id, status, closed_at, metadata')
    .eq('id', opts.case_id)
    .eq('clinic_id', opts.clinic_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!row) throw new Error('Caso clínico não encontrado');

  const status = row.status as string;
  if (status === 'active' || status === 'monitoring') return;
  if (status === 'cancelled' && !opts.allowCancelled) {
    throw new Error('Caso cancelado não pode ser reaberto. Abra um caso novo.');
  }
  if (status !== 'resolved' && status !== 'cancelled') {
    throw new Error('Este caso não pode ser reaberto.');
  }

  const now = new Date().toISOString();
  const prevMeta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;
  const history = Array.isArray(prevMeta.reopen_history) ? [...prevMeta.reopen_history] : [];
  const record: CaseReopenRecord = {
    at: now,
    previous_status: status,
    previous_closed_at: (row.closed_at as string | null) ?? null,
    reason,
    reopened_by: opts.reopened_by ?? null,
  };
  history.push(record);

  const metadata = {
    ...prevMeta,
    first_closed_at: prevMeta.first_closed_at ?? row.closed_at ?? null,
    last_reopened_at: now,
    last_reopen_reason: reason,
    reopen_history: history,
  };

  const { error } = await supabaseAdmin
    .from('hub_clinical_cases')
    .update({
      status: opts.nextStatus ?? 'active',
      closed_at: null,
      metadata,
    })
    .eq('id', opts.case_id)
    .eq('clinic_id', opts.clinic_id);

  if (error) throw new Error(`Erro ao reabrir caso: ${error.message}`);

  const petId = row.pet_id as string | null;
  if (petId) {
    const closedLabel = record.previous_closed_at
      ? new Date(record.previous_closed_at).toLocaleDateString('pt-BR')
      : 'sem data';
    void recordTimelineEvent({
      clinic_id: opts.clinic_id,
      pet_id: petId,
      hub_case_id: opts.case_id,
      event_type: 'note',
      ref_type: 'case',
      ref_id: opts.case_id,
      title: 'Caso reaberto',
      body: `Status anterior: ${status === 'resolved' ? 'resolvido' : 'cancelado'} (fechado em ${closedLabel}). Motivo: ${reason}`,
      created_by: opts.reopened_by ?? null,
    });
  }
}

/**
 * Utilitário interno: retorna ou cria um caso clínico para o encounter.
 * Chamado por hubEncountersController e hubClinicalModulesController.
 *
 * Lógica:
 * - Se hub_case_id foi explicitamente enviado → valida que pertence ao pet/clínica e está ativo/monitoring.
 * - Se create_new_case=true  → cria novo caso.
 * - Se nenhum e existir ≥1 caso active/monitoring → lança CaseSelectionRequiredError (UI deve perguntar).
 * - Se nenhum caso ativo → cria auto-caso.
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
  /** Título do agendamento, usado só se não houver queixa/título explícito. */
  appointment_title?: string | null;
  /** Motivo obrigatório para reabrir caso resolvido e vincular o atendimento. */
  reopen_reason?: string | null;
  reopened_by?: string | null;
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
    appointment_title,
    reopen_reason,
    reopened_by,
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
    if (existing.status === 'cancelled') {
      throw new Error('Caso cancelado não pode receber atendimento. Abra um caso novo.');
    }
    if (existing.status === 'resolved') {
      if (!reopen_reason?.trim()) {
        throw new CaseReopenRequiredError();
      }
      await reopenClosedClinicalCase({
        case_id: existing.id as string,
        clinic_id,
        reason: reopen_reason,
        reopened_by: reopened_by ?? null,
      });
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
      appointment_title,
    });
  }

  // Sem indicação explícita: verificar casos ativos
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
    throw new CaseSelectionRequiredError();
  }

  // Sem caso ativo → cria auto-caso
  return createAutoCase({
    clinic_id,
    unit_id,
    pet_id,
    guardian_id,
    primary_veterinarian_id,
    chief_complaint,
    started_at,
    case_title: new_case_title ?? null,
    appointment_title,
  });
}

/**
 * Garante que uma internação/cirurgia tenha caso clínico e atendimento de referência.
 * Se não houver `hub_encounter_id`, cria um encounter de admissão automaticamente.
 * Retorna os IDs resolvidos.
 */
export async function ensureCaseAndAdmissionEncounter(opts: {
  clinic_id: string;
  unit_id?: string | null;
  pet_id: string;
  guardian_id?: string | null;
  hub_encounter_id?: string | null;
  hub_case_id?: string | null;
  create_new_case?: boolean;
  new_case_title?: string | null;
  encounter_chief_complaint: string;
  reopen_reason?: string | null;
  reopened_by?: string | null;
  hub_staff_member_id?: string | null;
  hub_service_type_id?: string | null;
}): Promise<{ case_id: string; encounter_id: string }> {
  const {
    clinic_id,
    unit_id,
    pet_id,
    guardian_id,
    hub_encounter_id,
    hub_case_id,
    create_new_case,
    new_case_title,
    encounter_chief_complaint,
    reopen_reason,
    reopened_by,
    hub_staff_member_id,
    hub_service_type_id,
  } = opts;

  // Encounter fornecido: validar e extrair case_id dele
  if (hub_encounter_id) {
    const { data: enc } = await supabaseAdmin
      .from('hub_encounters')
      .select('id, hub_case_id, hub_staff_member_id, hub_service_type_id')
      .eq('id', hub_encounter_id)
      .eq('clinic_id', clinic_id)
      .eq('pet_id', pet_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!enc) throw new Error('Atendimento não encontrado ou não pertence a este pet/clínica');
    const encPatch: Record<string, unknown> = {};
    if (hub_staff_member_id && !(enc as { hub_staff_member_id?: string | null }).hub_staff_member_id) {
      encPatch.hub_staff_member_id = hub_staff_member_id;
    }
    if (hub_service_type_id && !(enc as { hub_service_type_id?: string | null }).hub_service_type_id) {
      encPatch.hub_service_type_id = hub_service_type_id;
    }
    if (Object.keys(encPatch).length > 0) {
      await supabaseAdmin
        .from('hub_encounters')
        .update(encPatch)
        .eq('id', hub_encounter_id)
        .eq('clinic_id', clinic_id);
    }
    const caseId = (enc.hub_case_id as string | null) ?? null;

    // Se o encounter já tem case, usar; se não, criar/resolver
    const finalCaseId = caseId ?? await resolveOrCreateClinicalCase({
      clinic_id, unit_id, pet_id, guardian_id, hub_case_id, create_new_case, new_case_title,
      chief_complaint: encounter_chief_complaint,
      reopen_reason, reopened_by,
    });

    return { case_id: finalCaseId, encounter_id: hub_encounter_id };
  }

  // Sem encounter: resolver/criar caso primeiro
  const finalCaseId = await resolveOrCreateClinicalCase({
    clinic_id,
    unit_id,
    pet_id,
    guardian_id,
    hub_case_id,
    create_new_case,
    new_case_title,
    chief_complaint: encounter_chief_complaint,
    reopen_reason,
    reopened_by,
  });

  // Criar encounter de admissão
  const { data: enc, error: encErr } = await supabaseAdmin
    .from('hub_encounters')
    .insert({
      clinic_id,
      unit_id: unit_id ?? null,
      pet_id,
      guardian_id: guardian_id ?? null,
      hub_case_id: finalCaseId,
      encounter_type: 'procedure',
      status: 'in_progress',
      chief_complaint: encounter_chief_complaint,
      started_at: new Date().toISOString(),
      hub_staff_member_id: hub_staff_member_id ?? null,
      hub_service_type_id: hub_service_type_id ?? null,
    })
    .select('id')
    .single();

  if (encErr || !enc) throw new Error(`Erro ao criar atendimento de admissão: ${encErr?.message}`);

  return { case_id: finalCaseId, encounter_id: (enc as { id: string }).id };
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
  appointment_title?: string | null;
}): Promise<string> {
  const title = resolveAutoCaseTitle({
    case_title: opts.case_title,
    chief_complaint: opts.chief_complaint,
    appointment_title: opts.appointment_title,
    started_at: opts.started_at,
  });
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
