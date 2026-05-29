"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapHubServiceTypes = exports.updateHubServiceType = exports.createHubServiceType = exports.listHubServiceTypes = void 0;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const serviceTypeCode_1 = require("./serviceTypeCode");
const hubServiceTypesPricingMatrix_1 = require("./hubServiceTypesPricingMatrix");
const hubServiceGroupsController_1 = require("./hubServiceGroupsController");
const hubServiceAddonsController_1 = require("./hubServiceAddonsController");
const uuidStr = zod_1.z.string().uuid();
/** Grupo operacional: valores pré-definidos (banho_tosa, …) ou slug personalizado normalizado. */
const serviceGroupSchema = zod_1.z
    .string()
    .trim()
    .min(1, { message: 'Grupo obrigatório' })
    .max(160, { message: 'Texto do grupo muito longo' })
    .transform((s) => (0, serviceTypeCode_1.slugifyServiceGroupLabel)(s))
    .pipe(zod_1.z
    .string()
    .min(1, { message: 'Grupo inválido após normalização' })
    .max(64, { message: 'Grupo muito longo' })
    .regex(/^[a-z0-9_]+$/, { message: 'Grupo: use letras minúsculas, números e _ (sem espaços)' }));
const moneyAmountSchema = zod_1.z.coerce.number().finite().min(0, { message: 'O valor não pode ser negativo' }).max(99_999_999.99, {
    message: 'Valor muito alto',
});
function roundMoney2(n) {
    return Math.round(n * 100) / 100;
}
const createServiceTypeBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    name: zod_1.z.string().trim().min(1).max(200),
    service_group: serviceGroupSchema,
    cost_amount: moneyAmountSchema,
    sale_amount: moneyAmountSchema,
    default_duration_minutes: zod_1.z.number().int().positive().optional().nullable(),
    description: zod_1.z.string().max(4000).optional().nullable(),
    allow_scheduling: zod_1.z.boolean().optional(),
    internal_notes: zod_1.z.string().max(4000).optional().nullable(),
    /** Matriz opcional (porte, período, consulta, km); alinhada a `service_group`. */
    pricing_matrix: zod_1.z.unknown().optional().nullable(),
    is_addon: zod_1.z.boolean().optional(),
    /** Legado / migração: se enviado, deve coincidir com o slug gerado ou ser único. Preferir omitir. */
    code: zod_1.z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9_]+$/)
        .optional(),
})
    .strict();
const updateServiceTypeBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    name: zod_1.z.string().trim().min(1).max(200).optional(),
    service_group: serviceGroupSchema.optional(),
    cost_amount: moneyAmountSchema.optional(),
    sale_amount: moneyAmountSchema.optional(),
    default_duration_minutes: zod_1.z.number().int().positive().optional().nullable(),
    description: zod_1.z.string().max(4000).optional().nullable(),
    allow_scheduling: zod_1.z.boolean().optional(),
    internal_notes: zod_1.z.string().max(4000).optional().nullable(),
    pricing_matrix: zod_1.z.unknown().optional().nullable(),
    is_addon: zod_1.z.boolean().optional(),
    code_locked: zod_1.z.boolean().optional(),
    active: zod_1.z.boolean().optional(),
    archived: zod_1.z.boolean().optional(),
})
    .strict();
const SELECT_FIELDS = 'id, clinic_id, code, name, service_group, cost_amount, sale_amount, pricing_matrix, default_duration_minutes, active, allow_scheduling, is_addon, agenda_color, description, internal_notes, code_locked, created_at, updated_at, deleted_at';
async function fetchGroupColorMap(clinicId) {
    await (0, hubServiceGroupsController_1.ensureDefaultGroupJobFunctions)(clinicId);
    const map = new Map();
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_groups')
        .select('slug, color')
        .eq('clinic_id', clinicId);
    if (error) {
        console.warn('[hub_service_types] fetchGroupColorMap', error.message);
        return map;
    }
    for (const row of data ?? []) {
        const r = row;
        if (r.slug && r.color && /^#[0-9A-Fa-f]{6}$/.test(r.color)) {
            map.set(r.slug, r.color);
        }
    }
    return map;
}
function enrichRowsWithGroupColor(rows, colorBySlug) {
    return rows.map((r) => ({
        ...r,
        group_color: colorBySlug.get((r.service_group || 'outros').toString().trim()) ?? null,
    }));
}
/** Se existir linha em `hub_service_groups` com o slug e `archived_at` preenchido, devolve mensagem de erro. */
async function assertHubServiceGroupNotArchived(clinicId, slug) {
    const s = (slug || 'outros').trim();
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_groups')
        .select('archived_at')
        .eq('clinic_id', clinicId)
        .eq('slug', s)
        .maybeSingle();
    if (error || !data)
        return null;
    if (data.archived_at) {
        return 'Este grupo de serviço está arquivado. Restaure-o em Configurações → Grupos de serviços ou escolha outro grupo.';
    }
    return null;
}
const DEFAULT_TYPES = [
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
const listHubServiceTypes = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = parsed.data;
        const includeArchived = req.query.include_archived === 'true' || req.query.include_archived === '1';
        const addonsOnly = req.query.addons_only === 'true' || req.query.addons_only === '1';
        let q = supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select(SELECT_FIELDS)
            .eq('clinic_id', clinic_id)
            .eq('is_addon', addonsOnly)
            .order('name', { ascending: true });
        if (!includeArchived) {
            q = q.is('deleted_at', null);
        }
        const { data, error } = await q;
        if (error) {
            console.error('[hub_service_types] list', error);
            return res.status(500).json({ error: 'Erro ao listar tipos de serviço' });
        }
        const colorMap = await fetchGroupColorMap(clinic_id);
        const service_types = enrichRowsWithGroupColor((data ?? []), colorMap);
        return res.json({ service_types });
    }
    catch (e) {
        console.error('[hub_service_types] list', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.listHubServiceTypes = listHubServiceTypes;
const createHubServiceType = async (req, res) => {
    try {
        const body = createServiceTypeBodySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, name, service_group, cost_amount, sale_amount, default_duration_minutes, description, allow_scheduling, internal_notes, code: codeOverride, pricing_matrix: pricing_matrix_raw, is_addon: is_addon_raw, } = body.data;
        const is_addon = is_addon_raw === true;
        const group = service_group;
        if (is_addon && (default_duration_minutes == null || default_duration_minutes < 1)) {
            return res.status(400).json({ error: 'Adicionais exigem duração padrão em minutos (≥ 1)' });
        }
        const archivedGroupErr = await assertHubServiceGroupNotArchived(clinic_id, group);
        if (archivedGroupErr) {
            return res.status(400).json({ error: archivedGroupErr });
        }
        let pricing_matrix = null;
        if (pricing_matrix_raw !== undefined && pricing_matrix_raw !== null) {
            const parsed = (0, hubServiceTypesPricingMatrix_1.parsePricingMatrixJson)(pricing_matrix_raw);
            if (typeof parsed === 'object' && parsed && 'error' in parsed) {
                return res.status(400).json({ error: parsed.error });
            }
            if (parsed === null) {
                pricing_matrix = null;
            }
            else {
                if (is_addon) {
                    const addonMatch = (0, hubServiceTypesPricingMatrix_1.pricingMatrixAllowedForAddon)(parsed);
                    if (addonMatch !== true) {
                        return res.status(400).json({ error: addonMatch.error });
                    }
                }
                else {
                    const match = (0, hubServiceTypesPricingMatrix_1.pricingMatrixAllowedForGroup)(group, parsed);
                    if (match !== true) {
                        return res.status(400).json({ error: match.error });
                    }
                }
                pricing_matrix = parsed;
            }
        }
        else if (pricing_matrix_raw === null) {
            pricing_matrix = null;
        }
        let costDb = roundMoney2(cost_amount);
        let saleDb = roundMoney2(sale_amount);
        if (pricing_matrix) {
            const ref = (0, hubServiceTypesPricingMatrix_1.computeReferenceAmountsFromMatrix)(pricing_matrix);
            costDb = ref.cost_amount;
            saleDb = ref.sale_amount;
        }
        let code;
        if (codeOverride) {
            code = await (0, serviceTypeCode_1.ensureUniqueHubServiceTypeCodeLiteral)(supabase_1.supabaseAdmin, clinic_id, codeOverride.trim().toLowerCase());
        }
        else {
            code = await (0, serviceTypeCode_1.ensureUniqueHubServiceTypeCode)(supabase_1.supabaseAdmin, clinic_id, name);
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
            allow_scheduling: is_addon ? false : (allow_scheduling ?? true),
            is_addon,
            agenda_color: null,
            internal_notes: internal_notes ?? null,
            code_locked: false,
            active: true,
            deleted_at: null,
        };
        const { data, error } = await supabase_1.supabaseAdmin
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
        const colorMap = await fetchGroupColorMap(clinic_id);
        const service_type = enrichRowsWithGroupColor([data], colorMap)[0];
        if (!is_addon && data?.id) {
            await (0, hubServiceAddonsController_1.seedAddonAvailabilityForNewService)(clinic_id, data.id, group);
        }
        return res.status(201).json({ service_type });
    }
    catch (e) {
        console.error('[hub_service_types] create', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.createHubServiceType = createHubServiceType;
const updateHubServiceType = async (req, res) => {
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
        const { clinic_id, name, service_group, cost_amount, sale_amount, default_duration_minutes, description, allow_scheduling, internal_notes, code_locked, active, archived, pricing_matrix: pricing_matrix_raw, is_addon: is_addon_patch, } = body.data;
        if (name === undefined &&
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
            is_addon_patch === undefined) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
        const { data: existing, error: fetchErr } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select('id, clinic_id, code, name, code_locked, deleted_at, service_group, is_addon')
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
        const patch = {};
        if (archived === true)
            patch.deleted_at = new Date().toISOString();
        else if (archived === false)
            patch.deleted_at = null;
        if (name !== undefined)
            patch.name = name;
        if (service_group !== undefined)
            patch.service_group = service_group;
        if (cost_amount !== undefined)
            patch.cost_amount = roundMoney2(cost_amount);
        if (sale_amount !== undefined)
            patch.sale_amount = roundMoney2(sale_amount);
        if (default_duration_minutes !== undefined)
            patch.default_duration_minutes = default_duration_minutes;
        if (description !== undefined)
            patch.description = description;
        const existingIsAddon = Boolean(existing.is_addon);
        if (is_addon_patch !== undefined)
            patch.is_addon = is_addon_patch;
        const nextIsAddon = is_addon_patch !== undefined ? is_addon_patch : existingIsAddon;
        if (allow_scheduling !== undefined) {
            patch.allow_scheduling = nextIsAddon ? false : allow_scheduling;
        }
        else if (nextIsAddon) {
            patch.allow_scheduling = false;
        }
        if (internal_notes !== undefined)
            patch.internal_notes = internal_notes;
        if (code_locked !== undefined)
            patch.code_locked = code_locked;
        if (active !== undefined)
            patch.active = active;
        const nextGroup = service_group !== undefined ? service_group : existing.service_group;
        if (pricing_matrix_raw !== undefined) {
            if (pricing_matrix_raw === null) {
                patch.pricing_matrix = null;
            }
            else {
                const parsed = (0, hubServiceTypesPricingMatrix_1.parsePricingMatrixJson)(pricing_matrix_raw);
                if (typeof parsed === 'object' && parsed && 'error' in parsed) {
                    return res.status(400).json({ error: parsed.error });
                }
                if (parsed === null) {
                    patch.pricing_matrix = null;
                }
                else {
                    if (nextIsAddon) {
                        const addonMatch = (0, hubServiceTypesPricingMatrix_1.pricingMatrixAllowedForAddon)(parsed);
                        if (addonMatch !== true) {
                            return res.status(400).json({ error: addonMatch.error });
                        }
                    }
                    else {
                        const match = (0, hubServiceTypesPricingMatrix_1.pricingMatrixAllowedForGroup)(nextGroup, parsed);
                        if (match !== true) {
                            return res.status(400).json({ error: match.error });
                        }
                    }
                    patch.pricing_matrix = parsed;
                    const ref = (0, hubServiceTypesPricingMatrix_1.computeReferenceAmountsFromMatrix)(parsed);
                    patch.cost_amount = ref.cost_amount;
                    patch.sale_amount = ref.sale_amount;
                }
            }
        }
        if (service_group !== undefined &&
            service_group !== existing.service_group &&
            pricing_matrix_raw === undefined) {
            patch.pricing_matrix = null;
        }
        const nextName = name !== undefined ? name : existing.name;
        const locked = code_locked !== undefined ? code_locked : Boolean(existing.code_locked);
        const nameChanged = name !== undefined && name !== existing.name;
        if (nameChanged && !locked) {
            const newCode = await (0, serviceTypeCode_1.ensureUniqueHubServiceTypeCode)(supabase_1.supabaseAdmin, clinic_id, (0, serviceTypeCode_1.slugifyServiceNameToCode)(nextName), id);
            patch.code = newCode;
        }
        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
        const { data, error } = await supabase_1.supabaseAdmin
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
        if (!nextIsAddon &&
            service_group !== undefined &&
            service_group !== existing.service_group &&
            data?.id) {
            await (0, hubServiceAddonsController_1.resyncAddonAvailabilityOnGroupChange)(clinic_id, id, service_group);
        }
        const colorMap = await fetchGroupColorMap(clinic_id);
        const service_type = enrichRowsWithGroupColor([data], colorMap)[0];
        return res.json({ service_type });
    }
    catch (e) {
        console.error('[hub_service_types] update', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.updateHubServiceType = updateHubServiceType;
/** Idempotente: garante ≥3 tipos padrão por clínica (não duplica códigos existentes). */
const bootstrapHubServiceTypes = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinic_id = parsed.data;
        await (0, hubServiceGroupsController_1.ensureDefaultGroupJobFunctions)(clinic_id);
        const { data: existing, error: listErr } = await supabase_1.supabaseAdmin
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
            const { error: insErr } = await supabase_1.supabaseAdmin.from('hub_service_types').insert(toInsert);
            if (insErr) {
                console.error('[hub_service_types] bootstrap insert', insErr);
                return res.status(500).json({ error: 'Erro ao inserir tipos padrão' });
            }
        }
        const includeArchived = req.query.include_archived === 'true' || req.query.include_archived === '1';
        let q = supabase_1.supabaseAdmin
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
        const colorMap = await fetchGroupColorMap(clinic_id);
        const service_types = enrichRowsWithGroupColor((all ?? []), colorMap);
        return res.json({
            inserted: toInsert.length,
            service_types,
        });
    }
    catch (e) {
        console.error('[hub_service_types] bootstrap', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.bootstrapHubServiceTypes = bootstrapHubServiceTypes;
