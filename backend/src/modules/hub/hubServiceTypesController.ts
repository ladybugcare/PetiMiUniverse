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
  pricingMatrixAllowedForAddon,
  pricingMatrixAllowedForGroup,
  type HubServicePricingMatrix,
} from './hubServiceTypesPricingMatrix';
import { ensureDefaultGroupJobFunctions } from './hubServiceGroupsController';
import {
  resyncAddonAvailabilityOnGroupChange,
  seedAddonAvailabilityForNewService,
} from './hubServiceAddonsController';
import { syncSpecialPricesOnCatalogChange } from './hubSpecialPrices';
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
    internal_notes: z.string().max(4000).optional().nullable(),
    /** Matriz opcional (porte, período, consulta, km); alinhada a `service_group`. */
    pricing_matrix: z.unknown().optional().nullable(),
    is_addon: z.boolean().optional(),
    /** Aplicação na consulta (grupo clínica); aparece no dropdown da Medicação. */
    is_encounter_application: z.boolean().optional(),
    /** Leva e Traz: valor cadastrado é ida+volta ou por perna. */
    pickup_price_scope: z.enum(['round_trip', 'per_leg']).optional(),
    /** fixed = valor travado; variable = permite informar na cobrança (com faixa opcional). */
    price_mode: z.enum(['fixed', 'variable']).optional(),
    price_min: moneyAmountSchema.optional().nullable(),
    price_max: moneyAmountSchema.optional().nullable(),
    /** Legado / migração: se enviado, deve coincidir com o slug gerado ou ser único. Preferir omitir. */
    code: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_]+$/)
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.price_min != null && data.price_max != null && data.price_max < data.price_min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'price_max deve ser ≥ price_min', path: ['price_max'] });
    }
  });

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
    internal_notes: z.string().max(4000).optional().nullable(),
    pricing_matrix: z.unknown().optional().nullable(),
    is_addon: z.boolean().optional(),
    is_encounter_application: z.boolean().optional(),
    pickup_price_scope: z.enum(['round_trip', 'per_leg']).optional(),
    price_mode: z.enum(['fixed', 'variable']).optional(),
    price_min: moneyAmountSchema.optional().nullable(),
    price_max: moneyAmountSchema.optional().nullable(),
    code_locked: z.boolean().optional(),
    active: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.price_min != null && data.price_max != null && data.price_max < data.price_min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'price_max deve ser ≥ price_min', path: ['price_max'] });
    }
  });

const SELECT_FIELDS =
  'id, clinic_id, code, name, service_group, cost_amount, sale_amount, pricing_matrix, pickup_price_scope, price_mode, price_min, price_max, default_duration_minutes, active, allow_scheduling, is_addon, is_encounter_application, agenda_color, description, internal_notes, code_locked, created_at, updated_at, deleted_at';

/** Sem `pickup_price_scope` — fallback se a migração 087 ainda não foi aplicada. */
const SELECT_FIELDS_LEGACY =
  'id, clinic_id, code, name, service_group, cost_amount, sale_amount, pricing_matrix, default_duration_minutes, active, allow_scheduling, is_addon, agenda_color, description, internal_notes, code_locked, created_at, updated_at, deleted_at';

/** Sem `is_encounter_application` — fallback se a migração 106 ainda não foi aplicada. */
const SELECT_FIELDS_NO_APPLICATION =
  'id, clinic_id, code, name, service_group, cost_amount, sale_amount, pricing_matrix, pickup_price_scope, default_duration_minutes, active, allow_scheduling, is_addon, agenda_color, description, internal_notes, code_locked, created_at, updated_at, deleted_at';

/** Sem price_mode — fallback se a migração 108 ainda não foi aplicada. */
const SELECT_FIELDS_NO_PRICE_MODE =
  'id, clinic_id, code, name, service_group, cost_amount, sale_amount, pricing_matrix, pickup_price_scope, default_duration_minutes, active, allow_scheduling, is_addon, is_encounter_application, agenda_color, description, internal_notes, code_locked, created_at, updated_at, deleted_at';

function isMissingPickupPriceScopeColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  const msg = String(error?.message ?? '');
  return msg.includes('pickup_price_scope') && (msg.includes('does not exist') || error?.code === '42703');
}

function isMissingEncounterApplicationColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  const msg = String(error?.message ?? '');
  return msg.includes('is_encounter_application') && (msg.includes('does not exist') || error?.code === '42703');
}

function isMissingPriceModeColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  const msg = String(error?.message ?? '');
  return (
    (msg.includes('price_mode') || msg.includes('price_min') || msg.includes('price_max')) &&
    (msg.includes('does not exist') || error?.code === '42703')
  );
}

type ServiceTypeRow = Record<string, unknown> & {
  service_group?: string | null;
  pickup_price_scope?: string | null;
  is_encounter_application?: boolean | null;
};

function withDefaultEncounterApplication<T extends ServiceTypeRow>(rows: T[]): Array<T & { is_encounter_application: boolean }> {
  return rows.map((r) => ({
    ...r,
    is_encounter_application: Boolean(r.is_encounter_application),
  }));
}

function withDefaultPickupPriceScope<T extends ServiceTypeRow>(rows: T[]): Array<T & { pickup_price_scope: string }> {
  return rows.map((r) => ({
    ...r,
    pickup_price_scope:
      r.pickup_price_scope === 'per_leg' || r.pickup_price_scope === 'round_trip'
        ? String(r.pickup_price_scope)
        : 'round_trip',
  }));
}

function withDefaultPriceMode<
  T extends ServiceTypeRow & { price_mode?: string | null; price_min?: number | null; price_max?: number | null },
>(rows: T[]): Array<T & { price_mode: string; price_min: number | null; price_max: number | null }> {
  return rows.map((r) => ({
    ...r,
    price_mode: r.price_mode === 'variable' ? 'variable' : 'fixed',
    price_min: r.price_min == null ? null : Number(r.price_min),
    price_max: r.price_max == null ? null : Number(r.price_max),
  }));
}


async function fetchGroupColorMap(clinicId: string): Promise<Map<string, string>> {
  await ensureDefaultGroupJobFunctions(clinicId);
  const map = new Map<string, string>();
  const { data, error } = await supabaseAdmin
    .from('hub_service_groups')
    .select('slug, color')
    .eq('clinic_id', clinicId);
  if (error) {
    console.warn('[hub_service_types] fetchGroupColorMap', error.message);
    return map;
  }
  for (const row of data ?? []) {
    const r = row as { slug: string; color: string };
    if (r.slug && r.color && /^#[0-9A-Fa-f]{6}$/.test(r.color)) {
      map.set(r.slug, r.color);
    }
  }
  return map;
}

function enrichRowsWithGroupColor<T extends ServiceTypeRow>(
  rows: T[],
  colorBySlug: Map<string, string>
): Array<T & { group_color: string | null }> {
  return rows.map((r) => ({
    ...r,
    group_color: colorBySlug.get((r.service_group || 'outros').toString().trim()) ?? null,
  }));
}

/** Se existir linha em `hub_service_groups` com o slug e `archived_at` preenchido, devolve mensagem de erro. */
async function assertHubServiceGroupNotArchived(clinicId: string, slug: string): Promise<string | null> {
  const s = (slug || 'outros').trim();
  const { data, error } = await supabaseAdmin
    .from('hub_service_groups')
    .select('archived_at')
    .eq('clinic_id', clinicId)
    .eq('slug', s)
    .maybeSingle();
  if (error || !data) return null;
  if ((data as { archived_at?: string | null }).archived_at) {
    return 'Este grupo de serviço está arquivado. Restaure-o em Configurações → Grupos de serviços ou escolha outro grupo.';
  }
  return null;
}

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
    const addonsOnly = req.query.addons_only === 'true' || req.query.addons_only === '1';

    let q = supabaseAdmin
      .from('hub_service_types')
      .select(SELECT_FIELDS)
      .eq('clinic_id', clinic_id)
      .eq('is_addon', addonsOnly)
      .order('name', { ascending: true });

    if (!includeArchived) {
      q = q.is('deleted_at', null);
    }

    let data: unknown[] | null = null;
    let error: { message?: string; code?: string } | null = null;

    {
      const first = await q;
      data = (first.data as unknown[] | null) ?? null;
      error = first.error;
    }

    if (error && isMissingPickupPriceScopeColumn(error)) {
      console.warn(
        '[hub_service_types] list: coluna pickup_price_scope ausente — aplique a migração 087. Usando SELECT legado.',
      );
      let qLegacy = supabaseAdmin
        .from('hub_service_types')
        .select(SELECT_FIELDS_LEGACY)
        .eq('clinic_id', clinic_id)
        .eq('is_addon', addonsOnly)
        .order('name', { ascending: true });
      if (!includeArchived) {
        qLegacy = qLegacy.is('deleted_at', null);
      }
      const legacy = await qLegacy;
      data = (legacy.data as unknown[] | null) ?? null;
      error = legacy.error;
    }

    if (error && isMissingEncounterApplicationColumn(error)) {
      console.warn(
        '[hub_service_types] list: coluna is_encounter_application ausente — aplique a migração 106. Usando SELECT sem o campo.',
      );
      let qNoApp = supabaseAdmin
        .from('hub_service_types')
        .select(SELECT_FIELDS_NO_APPLICATION)
        .eq('clinic_id', clinic_id)
        .eq('is_addon', addonsOnly)
        .order('name', { ascending: true });
      if (!includeArchived) {
        qNoApp = qNoApp.is('deleted_at', null);
      }
      const noApp = await qNoApp;
      data = (noApp.data as unknown[] | null) ?? null;
      error = noApp.error;
    }

    if (error && isMissingPriceModeColumn(error)) {
      console.warn(
        '[hub_service_types] list: colunas price_mode ausentes — aplique a migração 108. Usando SELECT sem o campo.',
      );
      let qNoPrice = supabaseAdmin
        .from('hub_service_types')
        .select(SELECT_FIELDS_NO_PRICE_MODE)
        .eq('clinic_id', clinic_id)
        .eq('is_addon', addonsOnly)
        .order('name', { ascending: true });
      if (!includeArchived) {
        qNoPrice = qNoPrice.is('deleted_at', null);
      }
      const noPrice = await qNoPrice;
      data = (noPrice.data as unknown[] | null) ?? null;
      error = noPrice.error;
    }

    if (error) {
      console.error('[hub_service_types] list', error);
      return res.status(500).json({ error: 'Erro ao listar tipos de serviço' });
    }

    const colorMap = await fetchGroupColorMap(clinic_id);
    const service_types = enrichRowsWithGroupColor(
      withDefaultPriceMode(
        withDefaultEncounterApplication(withDefaultPickupPriceScope((data ?? []) as ServiceTypeRow[])),
      ),
      colorMap,
    );

    return res.json({ service_types });
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
      internal_notes,
      code: codeOverride,
      pricing_matrix: pricing_matrix_raw,
      is_addon: is_addon_raw,
      is_encounter_application: is_encounter_application_raw,
      pickup_price_scope: pickup_price_scope_raw,
      price_mode: price_mode_raw,
      price_min: price_min_raw,
      price_max: price_max_raw,
    } = body.data;

    const is_addon = is_addon_raw === true;
    const group = service_group;
    const is_encounter_application =
      !is_addon && group === 'clinica' && is_encounter_application_raw === true;
    const pickup_price_scope =
      group === 'leva_traz' && pickup_price_scope_raw === 'per_leg' ? 'per_leg' : 'round_trip';
    const price_mode = price_mode_raw === 'variable' ? 'variable' : 'fixed';
    const price_min =
      price_mode === 'variable' && price_min_raw != null ? roundMoney2(price_min_raw) : null;
    const price_max =
      price_mode === 'variable' && price_max_raw != null ? roundMoney2(price_max_raw) : null;

    if (is_addon && (default_duration_minutes == null || default_duration_minutes < 1)) {
      return res.status(400).json({ error: 'Adicionais exigem duração padrão em minutos (≥ 1)' });
    }

    if (is_encounter_application_raw === true && (is_addon || group !== 'clinica')) {
      return res.status(400).json({
        error: 'Aplicação na consulta só pode ser marcada em serviços do grupo Clínica (não em adicionais).',
      });
    }

    const archivedGroupErr = await assertHubServiceGroupNotArchived(clinic_id, group);
    if (archivedGroupErr) {
      return res.status(400).json({ error: archivedGroupErr });
    }

    let pricing_matrix: HubServicePricingMatrix | null = null;
    if (pricing_matrix_raw !== undefined && pricing_matrix_raw !== null) {
      const parsed = parsePricingMatrixJson(pricing_matrix_raw);
      if (typeof parsed === 'object' && parsed && 'error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }
      if (parsed === null) {
        pricing_matrix = null;
      } else {
        if (is_addon) {
          const addonMatch = pricingMatrixAllowedForAddon(parsed);
          if (addonMatch !== true) {
            return res.status(400).json({ error: addonMatch.error });
          }
        } else {
          const match = pricingMatrixAllowedForGroup(group, parsed);
          if (match !== true) {
            return res.status(400).json({ error: match.error });
          }
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
      pickup_price_scope,
      price_mode,
      price_min,
      price_max,
      description: description ?? null,
      allow_scheduling: is_addon ? false : is_encounter_application ? false : (allow_scheduling ?? true),
      is_addon,
      is_encounter_application,
      agenda_color: null,
      internal_notes: internal_notes ?? null,
      code_locked: false,
      active: true,
      deleted_at: null,
    };

    let data: Record<string, unknown> | null = null;
    let error: { message?: string; code?: string } | null = null;

    {
      const first = await supabaseAdmin
        .from('hub_service_types')
        .insert([row])
        .select(SELECT_FIELDS)
        .single();
      data = (first.data as Record<string, unknown> | null) ?? null;
      error = first.error;
    }

    if (error && isMissingPriceModeColumn(error)) {
      console.warn(
        '[hub_service_types] create: colunas price_mode ausentes — aplique a migração 108. Inserindo sem o campo.',
      );
      const { price_mode: _pm, price_min: _pmin, price_max: _pmax, ...rowNoPrice } = row;
      const noPrice = await supabaseAdmin
        .from('hub_service_types')
        .insert([rowNoPrice])
        .select(SELECT_FIELDS_NO_PRICE_MODE)
        .single();
      data = (noPrice.data as Record<string, unknown> | null) ?? null;
      error = noPrice.error;
    }

    if (error && isMissingEncounterApplicationColumn(error)) {
      console.warn(
        '[hub_service_types] create: coluna is_encounter_application ausente — aplique a migração 106. Inserindo sem o campo.',
      );
      const {
        is_encounter_application: _omitApp,
        price_mode: _pm2,
        price_min: _pmin2,
        price_max: _pmax2,
        ...rowNoApp
      } = row;
      const noApp = await supabaseAdmin
        .from('hub_service_types')
        .insert([rowNoApp])
        .select(SELECT_FIELDS_NO_APPLICATION)
        .single();
      data = (noApp.data as Record<string, unknown> | null) ?? null;
      error = noApp.error;
    }

    if (error && isMissingPickupPriceScopeColumn(error)) {
      console.warn(
        '[hub_service_types] create: coluna pickup_price_scope ausente — aplique a migração 087. Inserindo sem o campo.',
      );
      const { pickup_price_scope: _omit, is_encounter_application: _omitApp2, ...rowLegacy } = row;
      const legacy = await supabaseAdmin
        .from('hub_service_types')
        .insert([rowLegacy])
        .select(SELECT_FIELDS_LEGACY)
        .single();
      data = (legacy.data as Record<string, unknown> | null) ?? null;
      error = legacy.error;
    }

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe um tipo com este código nesta clínica' });
      }
      console.error('[hub_service_types] create', error);
      return res.status(500).json({ error: 'Erro ao criar tipo de serviço' });
    }

    const colorMap = await fetchGroupColorMap(clinic_id);
    const service_type = enrichRowsWithGroupColor(
      withDefaultPriceMode(
        withDefaultEncounterApplication(withDefaultPickupPriceScope([data as ServiceTypeRow])),
      ),
      colorMap,
    )[0];

    if (!is_addon && data?.id) {
      await seedAddonAvailabilityForNewService(clinic_id, data.id as string, group);
    }

    return res.status(201).json({ service_type });
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
      internal_notes,
      code_locked,
      active,
      archived,
      pricing_matrix: pricing_matrix_raw,
      is_addon: is_addon_patch,
      is_encounter_application: is_encounter_application_patch,
      pickup_price_scope: pickup_price_scope_raw,
      price_mode: price_mode_raw,
      price_min: price_min_raw,
      price_max: price_max_raw,
    } = body.data;

    if (
      name === undefined &&
      service_group === undefined &&
      cost_amount === undefined &&
      sale_amount === undefined &&
      default_duration_minutes === undefined &&
      description === undefined &&
      allow_scheduling === undefined &&
      internal_notes === undefined &&
      code_locked === undefined &&
      active === undefined &&
      archived === undefined &&
      pricing_matrix_raw === undefined &&
      is_addon_patch === undefined &&
      is_encounter_application_patch === undefined &&
      pickup_price_scope_raw === undefined &&
      price_mode_raw === undefined &&
      price_min_raw === undefined &&
      price_max_raw === undefined
    ) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('hub_service_types')
      .select('id, clinic_id, code, name, code_locked, deleted_at, service_group, is_addon, is_encounter_application, sale_amount')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Tipo não encontrado' });
    }
    if (existing.clinic_id !== clinic_id) {
      return res.status(403).json({ error: 'Tipo não pertence a esta clínica' });
    }

    if (service_group !== undefined) {
      const archivedGroupErr = await assertHubServiceGroupNotArchived(clinic_id, service_group);
      if (archivedGroupErr) {
        return res.status(400).json({ error: archivedGroupErr });
      }
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
    const existingIsAddon = Boolean(existing.is_addon);
    if (is_addon_patch !== undefined) patch.is_addon = is_addon_patch;
    const nextIsAddon = is_addon_patch !== undefined ? is_addon_patch : existingIsAddon;
    const nextGroup = (service_group !== undefined ? service_group : existing.service_group) as string;
    const existingIsApp = Boolean(
      (existing as { is_encounter_application?: boolean }).is_encounter_application,
    );
    let nextIsApp =
      is_encounter_application_patch !== undefined ? is_encounter_application_patch : existingIsApp;
    if (nextIsAddon || nextGroup !== 'clinica') {
      nextIsApp = false;
    }
    if (
      is_encounter_application_patch === true &&
      (nextIsAddon || nextGroup !== 'clinica')
    ) {
      return res.status(400).json({
        error: 'Aplicação na consulta só pode ser marcada em serviços do grupo Clínica (não em adicionais).',
      });
    }
    if (is_encounter_application_patch !== undefined || nextIsApp !== existingIsApp) {
      patch.is_encounter_application = nextIsApp;
    }
    if (allow_scheduling !== undefined) {
      patch.allow_scheduling = nextIsAddon || nextIsApp ? false : allow_scheduling;
    } else if (nextIsAddon || (nextIsApp && is_encounter_application_patch === true)) {
      patch.allow_scheduling = false;
    }
    if (internal_notes !== undefined) patch.internal_notes = internal_notes;
    if (code_locked !== undefined) patch.code_locked = code_locked;
    if (active !== undefined) patch.active = active;

    if (price_mode_raw !== undefined) {
      patch.price_mode = price_mode_raw === 'variable' ? 'variable' : 'fixed';
      if (price_mode_raw !== 'variable') {
        patch.price_min = null;
        patch.price_max = null;
      }
    }
    if (price_min_raw !== undefined) {
      patch.price_min = price_min_raw == null ? null : roundMoney2(price_min_raw);
    }
    if (price_max_raw !== undefined) {
      patch.price_max = price_max_raw == null ? null : roundMoney2(price_max_raw);
    }
    if (patch.price_mode === 'fixed') {
      patch.price_min = null;
      patch.price_max = null;
    }

    if (pricing_matrix_raw !== undefined) {
      if (pricing_matrix_raw === null) {
        patch.pricing_matrix = null;
      } else {
        const parsed = parsePricingMatrixJson(pricing_matrix_raw);
        if (typeof parsed === 'object' && parsed && 'error' in parsed) {
          return res.status(400).json({ error: parsed.error });
        }
        if (parsed === null) {
          patch.pricing_matrix = null;
        } else {
          if (nextIsAddon) {
            const addonMatch = pricingMatrixAllowedForAddon(parsed);
            if (addonMatch !== true) {
              return res.status(400).json({ error: addonMatch.error });
            }
          } else {
            const match = pricingMatrixAllowedForGroup(nextGroup, parsed);
            if (match !== true) {
              return res.status(400).json({ error: match.error });
            }
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

    if (pickup_price_scope_raw !== undefined || service_group !== undefined) {
      const scopeGroup = String(nextGroup ?? 'outros').trim();
      if (scopeGroup === 'leva_traz') {
        if (pickup_price_scope_raw !== undefined) {
          patch.pickup_price_scope = pickup_price_scope_raw === 'per_leg' ? 'per_leg' : 'round_trip';
        }
      } else if (service_group !== undefined || pickup_price_scope_raw !== undefined) {
        patch.pickup_price_scope = 'round_trip';
      }
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

    let data: Record<string, unknown> | null = null;
    let error: { message?: string; code?: string } | null = null;

    {
      const first = await supabaseAdmin
        .from('hub_service_types')
        .update(patch)
        .eq('id', id)
        .eq('clinic_id', clinic_id)
        .select(SELECT_FIELDS)
        .single();
      data = (first.data as Record<string, unknown> | null) ?? null;
      error = first.error;
    }

    if (error && isMissingPickupPriceScopeColumn(error)) {
      console.warn(
        '[hub_service_types] update: coluna pickup_price_scope ausente — aplique a migração 087. Atualizando sem o campo.',
      );
      const patchLegacy = { ...patch };
      delete patchLegacy.pickup_price_scope;
      delete patchLegacy.is_encounter_application;
      const legacy = await supabaseAdmin
        .from('hub_service_types')
        .update(patchLegacy)
        .eq('id', id)
        .eq('clinic_id', clinic_id)
        .select(SELECT_FIELDS_LEGACY)
        .single();
      data = (legacy.data as Record<string, unknown> | null) ?? null;
      error = legacy.error;
    }

    if (error && isMissingEncounterApplicationColumn(error)) {
      console.warn(
        '[hub_service_types] update: coluna is_encounter_application ausente — aplique a migração 106. Atualizando sem o campo.',
      );
      const patchNoApp = { ...patch };
      delete patchNoApp.is_encounter_application;
      const noApp = await supabaseAdmin
        .from('hub_service_types')
        .update(patchNoApp)
        .eq('id', id)
        .eq('clinic_id', clinic_id)
        .select(SELECT_FIELDS_NO_APPLICATION)
        .single();
      data = (noApp.data as Record<string, unknown> | null) ?? null;
      error = noApp.error;
    }

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Conflito de código único nesta clínica' });
      }
      console.error('[hub_service_types] update', error);
      return res.status(500).json({ error: 'Erro ao atualizar tipo' });
    }

    if (
      !nextIsAddon &&
      service_group !== undefined &&
      service_group !== existing.service_group &&
      data?.id
    ) {
      await resyncAddonAvailabilityOnGroupChange(clinic_id, id, service_group);
    }

    const prevCatalogSale = roundMoney2(Number((existing as { sale_amount?: number }).sale_amount) || 0);
    const nextCatalogSale = roundMoney2(Number((data as { sale_amount?: number } | null)?.sale_amount) || 0);
    let special_prices_sync: { reviewed: number; auto_adjusted: number } | undefined;
    if (prevCatalogSale !== nextCatalogSale) {
      const sync = await syncSpecialPricesOnCatalogChange({
        clinicId: clinic_id,
        hubServiceTypeId: id,
        previousCatalogSale: prevCatalogSale,
        nextCatalogSale,
      });
      special_prices_sync = { reviewed: sync.reviewed, auto_adjusted: sync.autoAdjusted };
    }

    const colorMap = await fetchGroupColorMap(clinic_id);
    const service_type = enrichRowsWithGroupColor(
      withDefaultEncounterApplication(withDefaultPickupPriceScope([data as ServiceTypeRow])),
      colorMap,
    )[0];

    return res.json({ service_type, special_prices_sync });
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

    await ensureDefaultGroupJobFunctions(clinic_id);

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

    let all: unknown[] | null = null;
    let finalErr: { message?: string; code?: string } | null = null;
    {
      const first = await q;
      all = (first.data as unknown[] | null) ?? null;
      finalErr = first.error;
    }
    if (finalErr && isMissingPickupPriceScopeColumn(finalErr)) {
      let qLegacy = supabaseAdmin
        .from('hub_service_types')
        .select(SELECT_FIELDS_LEGACY)
        .eq('clinic_id', clinic_id)
        .order('name', { ascending: true });
      if (!includeArchived) {
        qLegacy = qLegacy.is('deleted_at', null);
      }
      const legacy = await qLegacy;
      all = (legacy.data as unknown[] | null) ?? null;
      finalErr = legacy.error;
    }
    if (finalErr && isMissingEncounterApplicationColumn(finalErr)) {
      let qNoApp = supabaseAdmin
        .from('hub_service_types')
        .select(SELECT_FIELDS_NO_APPLICATION)
        .eq('clinic_id', clinic_id)
        .order('name', { ascending: true });
      if (!includeArchived) {
        qNoApp = qNoApp.is('deleted_at', null);
      }
      const noApp = await qNoApp;
      all = (noApp.data as unknown[] | null) ?? null;
      finalErr = noApp.error;
    }

    if (finalErr) {
      return res.status(500).json({ error: 'Erro ao listar tipos após bootstrap' });
    }

    const colorMap = await fetchGroupColorMap(clinic_id);
    const service_types = enrichRowsWithGroupColor(
      withDefaultEncounterApplication(withDefaultPickupPriceScope((all ?? []) as ServiceTypeRow[])),
      colorMap,
    );

    return res.json({
      inserted: toInsert.length,
      service_types,
    });
  } catch (e) {
    console.error('[hub_service_types] bootstrap', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
