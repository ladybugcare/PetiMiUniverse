import type { Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../config/supabase';
import {
  ensureUniqueHubServiceTypeCode,
  ensureUniqueHubServiceTypeCodeLiteral,
  slugifyServiceGroupLabel,
  slugifyServiceNameToCode,
  type HubServiceGroup,
} from './serviceTypeCode';
import {
  computeReferenceAmountsFromMatrix,
  parsePricingMatrixJson,
  pricingMatrixKindMatchesGroup,
  serviceGroupAllowsPricingMatrix,
  type HubServicePricingMatrix,
} from './hubServiceTypesPricingMatrix';

const uuidStr = z.string().uuid();

/** Grupo operacional: valores pré-definidos (banho_tosa, …) ou slug personalizado normalizado. */
const serviceGroupSchema = z
  .string()
  .trim()
  .min(1, { message: 'Grupo obrigatório' })
  .max(160, { message: 'Texto do grupo muito longo' })
  .transform((s) => slugifyServiceGroupLabel(s))
  .pipe(
    z
      .string()
      .min(1, { message: 'Grupo inválido após normalização' })
      .max(64, { message: 'Grupo muito longo' })
      .regex(/^[a-z0-9_]+$/, { message: 'Grupo: use letras minúsculas, números e _ (sem espaços)' })
  );

const optionalAgendaColor = z
  .union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.literal(''), z.null()])
  .optional();

const moneyAmountSchema = z.coerce.number().finite().min(0, { message: 'O valor não pode ser negativo' }).max(99_999_999.99, {
  message: 'Valor muito alto',
});

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

const createServiceTypeBodySchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().trim().min(1).max(200),
    service_group: serviceGroupSchema,
    cost_amount: moneyAmountSchema,
    sale_amount: moneyAmountSchema,
    default_duration_minutes: z.number().int().positive().optional().nullable(),
    description: z.string().max(4000).optional().nullable(),
    allow_scheduling: z.boolean().optional(),
    agenda_color: optionalAgendaColor,
    internal_notes: z.string().max(4000).optional().nullable(),
    /** Matriz opcional (porte, período, consulta, km); alinhada a `service_group`. */
    pricing_matrix: z.unknown().optional().nullable(),
    /** Legado / migração: se enviado, deve coincidir com o slug gerado ou ser único. Preferir omitir. */
    code: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_]+$/)
      .optional(),
  })
  .strict();

const updateServiceTypeBodySchema = z
  .object({
    clinic_id: uuidStr,
    name: z.string().trim().min(1).max(200).optional(),
    service_group: serviceGroupSchema.optional(),
    cost_amount: moneyAmountSchema.optional(),
    sale_amount: moneyAmountSchema.optional(),
    default_duration_minutes: z.number().int().positive().optional().nullable(),
    description: z.string().max(4000).optional().nullable(),
    allow_scheduling: z.boolean().optional(),
    agenda_color: optionalAgendaColor,
    internal_notes: z.string().max(4000).optional().nullable(),
    pricing_matrix: z.unknown().optional().nullable(),
    code_locked: z.boolean().optional(),
    active: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

const SELECT_FIELDS =
  'id, clinic_id, code, name, service_group, cost_amount, sale_amount, pricing_matrix, default_duration_minutes, active, allow_scheduling, agenda_color, description, internal_notes, code_locked, created_at, updated_at, deleted_at';

const DEFAULT_TYPES: Array<{
  code: string;
  name: string;
  default_duration_minutes: number | null;
  service_group: HubServiceGroup;
  allow_scheduling: boolean;
  agenda_color: string | null;
}> = [
  {
    code: 'consulta',
    name: 'Consulta veterinária',
    default_duration_minutes: 30,
    service_group: 'clinica',
    allow_scheduling: true,
    agenda_color: '#2e7d32',
  },
  {
    code: 'banho_tosa',
    name: 'Banho e tosa',
    default_duration_minutes: 60,
    service_group: 'banho_tosa',
    allow_scheduling: true,
    agenda_color: '#f0642f',
  },
  {
    code: 'hotel_daycare',
    name: 'Hotel / daycare',
    default_duration_minutes: null,
    service_group: 'hotel',
    allow_scheduling: true,
    agenda_color: '#1565c0',
  },
];

export const listHubServiceTypes = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
    }
    const clinic_id = parsed.data;
    const includeArchived = req.query.include_archived === 'true' || req.query.include_archived === '1';

    let q = supabaseAdmin
      .from('hub_service_types')
      .select(SELECT_FIELDS)
      .eq('clinic_id', clinic_id)
      .order('name', { ascending: true });

    if (!includeArchived) {
      q = q.is('deleted_at', null);
    }

    const { data, error } = await q;

    if (error) {
      console.error('[hub_service_types] list', error);
      return res.status(500).json({ error: 'Erro ao listar tipos de serviço' });
    }

    return res.json({ service_types: data ?? [] });
  } catch (e) {
    console.error('[hub_service_types] list', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const createHubServiceType = async (req: Request, res: Response) => {
  try {
    const body = createServiceTypeBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    }
    const {
      clinic_id,
      name,
      service_group,
      cost_amount,
      sale_amount,
      default_duration_minutes,
      description,
      allow_scheduling,
      agenda_color,
      internal_notes,
      code: codeOverride,
      pricing_matrix: pricing_matrix_raw,
    } = body.data;

    const group = service_group;

    let pricing_matrix: HubServicePricingMatrix | null = null;
    if (pricing_matrix_raw !== undefined && pricing_matrix_raw !== null) {
      if (!serviceGroupAllowsPricingMatrix(group)) {
        return res.status(400).json({ error: 'Este grupo não suporta matriz de preços' });
      }
      const parsed = parsePricingMatrixJson(pricing_matrix_raw);
      if (typeof parsed === 'object' && parsed && 'error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }
      if (parsed === null) {
        pricing_matrix = null;
      } else {
        const match = pricingMatrixKindMatchesGroup(group, parsed);
        if (match !== true) {
          return res.status(400).json({ error: match.error });
        }
        pricing_matrix = parsed;
      }
    } else if (pricing_matrix_raw === null) {
      pricing_matrix = null;
    }

    let costDb = roundMoney2(cost_amount);
    let saleDb = roundMoney2(sale_amount);
    if (pricing_matrix) {
      const ref = computeReferenceAmountsFromMatrix(pricing_matrix);
      costDb = ref.cost_amount;
      saleDb = ref.sale_amount;
    }

    let code: string;
    if (codeOverride) {
      code = await ensureUniqueHubServiceTypeCodeLiteral(
        supabaseAdmin,
        clinic_id,
        codeOverride.trim().toLowerCase()
      );
    } else {
      code = await ensureUniqueHubServiceTypeCode(supabaseAdmin, clinic_id, name);
    }

    const row = {
      clinic_id,
      code,
      name,
      service_group,
      cost_amount: costDb,
      sale_amount: saleDb,
      default_duration_minutes: default_duration_minutes ?? null,
      pricing_matrix,
      description: description ?? null,
      allow_scheduling: allow_scheduling ?? true,
      agenda_color:
        agenda_color === undefined || agenda_color === null || agenda_color === '' ? null : agenda_color,
      internal_notes: internal_notes ?? null,
      code_locked: false,
      active: true,
      deleted_at: null,
    };

    const { data, error } = await supabaseAdmin
      .from('hub_service_types')
      .insert([row])
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe um tipo com este código nesta clínica' });
      }
      console.error('[hub_service_types] create', error);
      return res.status(500).json({ error: 'Erro ao criar tipo de serviço' });
    }

    return res.status(201).json({ service_type: data });
  } catch (e) {
    console.error('[hub_service_types] create', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const updateHubServiceType = async (req: Request, res: Response) => {
  try {
    const idParsed = uuidStr.safeParse(req.params.id);
    if (!idParsed.success) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const id = idParsed.data;

    const body = updateServiceTypeBodySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
    }
    const {
      clinic_id,
      name,
      service_group,
      cost_amount,
      sale_amount,
      default_duration_minutes,
      description,
      allow_scheduling,
      agenda_color,
      internal_notes,
      code_locked,
      active,
      archived,
      pricing_matrix: pricing_matrix_raw,
    } = body.data;

    if (
      name === undefined &&
      service_group === undefined &&
      cost_amount === undefined &&
      sale_amount === undefined &&
      default_duration_minutes === undefined &&
      description === undefined &&
      allow_scheduling === undefined &&
      agenda_color === undefined &&
      internal_notes === undefined &&
      code_locked === undefined &&
      active === undefined &&
      archived === undefined &&
      pricing_matrix_raw === undefined
    ) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, clinic_id, code, name, code_locked, deleted_at, service_group')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Tipo não encontrado' });
    }
    if (existing.clinic_id !== clinic_id) {
      return res.status(403).json({ error: 'Tipo não pertence a esta clínica' });
    }

    const patch: Record<string, unknown> = {};
    if (archived === true) patch.deleted_at = new Date().toISOString();
    else if (archived === false) patch.deleted_at = null;
    if (name !== undefined) patch.name = name;
    if (service_group !== undefined) patch.service_group = service_group;
    if (cost_amount !== undefined) patch.cost_amount = roundMoney2(cost_amount);
    if (sale_amount !== undefined) patch.sale_amount = roundMoney2(sale_amount);
    if (default_duration_minutes !== undefined) patch.default_duration_minutes = default_duration_minutes;
    if (description !== undefined) patch.description = description;
    if (allow_scheduling !== undefined) patch.allow_scheduling = allow_scheduling;
    if (agenda_color !== undefined) {
      patch.agenda_color = agenda_color === '' || agenda_color === null ? null : agenda_color;
    }
    if (internal_notes !== undefined) patch.internal_notes = internal_notes;
    if (code_locked !== undefined) patch.code_locked = code_locked;
    if (active !== undefined) patch.active = active;

    const nextGroup = service_group !== undefined ? service_group : existing.service_group;

    if (pricing_matrix_raw !== undefined) {
      if (pricing_matrix_raw === null) {
        patch.pricing_matrix = null;
      } else {
        if (!serviceGroupAllowsPricingMatrix(nextGroup)) {
          return res.status(400).json({ error: 'Este grupo não suporta matriz de preços' });
        }
        const parsed = parsePricingMatrixJson(pricing_matrix_raw);
        if (typeof parsed === 'object' && parsed && 'error' in parsed) {
          return res.status(400).json({ error: parsed.error });
        }
        if (parsed === null) {
          patch.pricing_matrix = null;
        } else {
          const match = pricingMatrixKindMatchesGroup(nextGroup, parsed);
          if (match !== true) {
            return res.status(400).json({ error: match.error });
          }
          patch.pricing_matrix = parsed;
          const ref = computeReferenceAmountsFromMatrix(parsed);
          patch.cost_amount = ref.cost_amount;
          patch.sale_amount = ref.sale_amount;
        }
      }
    }

    if (
      service_group !== undefined &&
      service_group !== existing.service_group &&
      pricing_matrix_raw === undefined
    ) {
      patch.pricing_matrix = null;
    }

    const nextName = name !== undefined ? name : existing.name;
    const locked = code_locked !== undefined ? code_locked : Boolean(existing.code_locked);
    const nameChanged = name !== undefined && name !== existing.name;

    if (nameChanged && !locked) {
      const newCode = await ensureUniqueHubServiceTypeCode(supabaseAdmin, clinic_id, slugifyServiceNameToCode(nextName), id);
      patch.code = newCode;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const { data, error } = await supabaseAdmin
      .from('hub_service_types')
      .update(patch)
      .eq('id', id)
      .eq('clinic_id', clinic_id)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Conflito de código único nesta clínica' });
      }
      console.error('[hub_service_types] update', error);
      return res.status(500).json({ error: 'Erro ao atualizar tipo' });
    }

    return res.json({ service_type: data });
  } catch (e) {
    console.error('[hub_service_types] update', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/** Idempotente: garante ≥3 tipos padrão por clínica (não duplica códigos existentes). */
export const bootstrapHubServiceTypes = async (req: Request, res: Response) => {
  try {
    const parsed = uuidStr.safeParse(req.query.clinic_id);
    if (!parsed.success) {
      return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
    }
    const clinic_id = parsed.data;

    const { data: existing, error: listErr } = await supabaseAdmin
      .from('hub_service_types')
      .select('code')
      .eq('clinic_id', clinic_id)
      .is('deleted_at', null);

    if (listErr) {
      console.error('[hub_service_types] bootstrap list', listErr);
      return res.status(500).json({ error: 'Erro ao verificar tipos existentes' });
    }

    const codes = new Set((existing ?? []).map((r) => r.code));
    const toInsert = DEFAULT_TYPES.filter((d) => !codes.has(d.code)).map((d) => ({
      clinic_id,
      code: d.code,
      name: d.name,
      default_duration_minutes: d.default_duration_minutes,
      service_group: d.service_group,
      cost_amount: 0,
      sale_amount: 0,
      allow_scheduling: d.allow_scheduling,
      agenda_color: d.agenda_color,
      description: null,
      internal_notes: null,
      code_locked: true,
      active: true,
      deleted_at: null,
    }));

    if (toInsert.length > 0) {
      const { error: insErr } = await supabaseAdmin.from('hub_service_types').insert(toInsert);
      if (insErr) {
        console.error('[hub_service_types] bootstrap insert', insErr);
        return res.status(500).json({ error: 'Erro ao inserir tipos padrão' });
      }
    }

    const includeArchived = req.query.include_archived === 'true' || req.query.include_archived === '1';
    let q = supabaseAdmin
      .from('hub_service_types')
      .select(SELECT_FIELDS)
      .eq('clinic_id', clinic_id)
      .order('name', { ascending: true });
    if (!includeArchived) {
      q = q.is('deleted_at', null);
    }

    const { data: all, error: finalErr } = await q;

    if (finalErr) {
      return res.status(500).json({ error: 'Erro ao listar tipos após bootstrap' });
    }

    return res.json({
      inserted: toInsert.length,
      service_types: all ?? [],
    });
  } catch (e) {
    console.error('[hub_service_types] bootstrap', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
