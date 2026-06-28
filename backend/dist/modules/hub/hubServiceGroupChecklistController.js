"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteHubServiceGroupChecklist = exports.putHubServiceGroupChecklist = exports.getHubServiceGroupChecklist = exports.listHubServiceGroupChecklists = void 0;
exports.loadServiceGroupChecklistTemplateItems = loadServiceGroupChecklistTemplateItems;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const serviceTypeCode_1 = require("./serviceTypeCode");
const hubServiceGroupsController_1 = require("./hubServiceGroupsController");
const serviceGroupChecklistDefaults_1 = require("./serviceGroupChecklistDefaults");
const uuidStr = zod_1.z.string().uuid();
const slugParamSchema = zod_1.z.string().trim().regex(/^[a-z0-9_]{1,64}$/);
const checklistItemInputSchema = zod_1.z
    .object({
    key: zod_1.z.string().trim().regex(/^[a-z0-9_]{1,64}$/).optional(),
    label: zod_1.z.string().trim().min(1).max(200),
    default_checked: zod_1.z.boolean().optional(),
})
    .strict();
const putBodySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    items: zod_1.z.array(checklistItemInputSchema).max(30),
})
    .strict();
function normalizeChecklistItemsInput(items) {
    const usedKeys = new Set();
    const result = [];
    for (const item of items) {
        let key = item.key?.trim() ?? '';
        if (!key) {
            const base = (0, serviceTypeCode_1.slugifyServiceNameToCode)(item.label);
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
async function loadTemplateRows(clinicId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_group_checklist_templates')
        .select('service_group_slug, items')
        .eq('clinic_id', clinicId)
        .is('unit_id', null);
    if (error) {
        console.error('[hub_service_group_checklist] load rows', error);
        return [];
    }
    return (data ?? []);
}
async function findServiceGroupSlug(clinicId, slug) {
    const { data, error } = await supabase_1.supabaseAdmin
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
function buildGroupChecklistPayload(slug, name, color, templateBySlug) {
    const customItems = templateBySlug.has(slug) ? templateBySlug.get(slug) : null;
    const isCustom = templateBySlug.has(slug);
    const items = (0, serviceGroupChecklistDefaults_1.resolveChecklistTemplateItems)(slug, isCustom ? customItems : null);
    return {
        slug,
        name,
        color,
        items,
        is_custom: isCustom,
        has_system_default: (0, serviceGroupChecklistDefaults_1.hasSystemChecklistDefault)(slug),
    };
}
/** Carrega itens efetivos do checklist de um grupo (nível clínica; MVP). */
async function loadServiceGroupChecklistTemplateItems(clinicId, serviceGroupSlug) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_group_checklist_templates')
        .select('items')
        .eq('clinic_id', clinicId)
        .eq('service_group_slug', serviceGroupSlug)
        .is('unit_id', null)
        .maybeSingle();
    if (error) {
        console.error('[hub_service_group_checklist] load template', error);
        return (0, serviceGroupChecklistDefaults_1.resolveChecklistTemplateItems)(serviceGroupSlug, null);
    }
    if (!data) {
        return (0, serviceGroupChecklistDefaults_1.resolveChecklistTemplateItems)(serviceGroupSlug, null);
    }
    return (0, serviceGroupChecklistDefaults_1.resolveChecklistTemplateItems)(serviceGroupSlug, (0, serviceGroupChecklistDefaults_1.parseChecklistTemplateItems)(data.items));
}
const listHubServiceGroupChecklists = async (req, res) => {
    try {
        const parsed = uuidStr.safeParse(req.query.clinic_id);
        if (!parsed.success) {
            return res.status(400).json({ error: 'clinic_id é obrigatório e deve ser UUID' });
        }
        const clinicId = parsed.data;
        await (0, hubServiceGroupsController_1.ensureDefaultHubServiceGroups)(clinicId);
        const [{ rows: groups, error: groupsErr }, templateRows] = await Promise.all([
            supabase_1.supabaseAdmin
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
        const templateBySlug = new Map();
        for (const row of templateRows) {
            templateBySlug.set(row.service_group_slug, (0, serviceGroupChecklistDefaults_1.parseChecklistTemplateItems)(row.items));
        }
        const activeGroups = groups
            .filter((g) => !g.archived_at)
            .map((g) => buildGroupChecklistPayload(g.slug, g.name, g.color, templateBySlug));
        return res.json({ groups: activeGroups });
    }
    catch (e) {
        console.error('[hub_service_group_checklist] list', e);
        return res.status(500).json({ error: 'Erro ao listar checklists' });
    }
};
exports.listHubServiceGroupChecklists = listHubServiceGroupChecklists;
const getHubServiceGroupChecklist = async (req, res) => {
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
        await (0, hubServiceGroupsController_1.ensureDefaultHubServiceGroups)(clinicId);
        const exists = await findServiceGroupSlug(clinicId, slug);
        if (!exists) {
            return res.status(404).json({ error: 'Grupo de serviço não encontrado' });
        }
        const { data: group, error: groupErr } = await supabase_1.supabaseAdmin
            .from('hub_service_groups')
            .select('slug, name, color')
            .eq('clinic_id', clinicId)
            .eq('slug', slug)
            .maybeSingle();
        if (groupErr || !group) {
            return res.status(404).json({ error: 'Grupo de serviço não encontrado' });
        }
        const { data: templateRow } = await supabase_1.supabaseAdmin
            .from('hub_service_group_checklist_templates')
            .select('items')
            .eq('clinic_id', clinicId)
            .eq('service_group_slug', slug)
            .is('unit_id', null)
            .maybeSingle();
        const isCustom = Boolean(templateRow);
        const customItems = isCustom ? (0, serviceGroupChecklistDefaults_1.parseChecklistTemplateItems)(templateRow.items) : null;
        const g = group;
        return res.json({
            group: {
                slug: g.slug,
                name: g.name,
                color: g.color,
                items: (0, serviceGroupChecklistDefaults_1.resolveChecklistTemplateItems)(slug, isCustom ? customItems : null),
                is_custom: isCustom,
                has_system_default: (0, serviceGroupChecklistDefaults_1.hasSystemChecklistDefault)(slug),
            },
        });
    }
    catch (e) {
        console.error('[hub_service_group_checklist] get', e);
        return res.status(500).json({ error: 'Erro ao carregar checklist' });
    }
};
exports.getHubServiceGroupChecklist = getHubServiceGroupChecklist;
const putHubServiceGroupChecklist = async (req, res) => {
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
        await (0, hubServiceGroupsController_1.ensureDefaultHubServiceGroups)(clinic_id);
        const exists = await findServiceGroupSlug(clinic_id, slug);
        if (!exists) {
            return res.status(404).json({ error: 'Grupo de serviço não encontrado' });
        }
        let normalized;
        try {
            normalized = normalizeChecklistItemsInput(items);
        }
        catch (e) {
            return res.status(400).json({ error: e.message });
        }
        const { data: group } = await supabase_1.supabaseAdmin
            .from('hub_service_groups')
            .select('slug, name, color')
            .eq('clinic_id', clinic_id)
            .eq('slug', slug)
            .maybeSingle();
        const { error } = await supabase_1.supabaseAdmin.from('hub_service_group_checklist_templates').upsert({
            clinic_id,
            unit_id: null,
            service_group_slug: slug,
            items: normalized,
        }, { onConflict: 'clinic_id,unit_id,service_group_slug' });
        if (error) {
            console.error('[hub_service_group_checklist] put', error);
            return res.status(500).json({ error: error.message });
        }
        const g = group;
        return res.json({
            group: {
                slug: g.slug,
                name: g.name,
                color: g.color,
                items: normalized,
                is_custom: true,
                has_system_default: (0, serviceGroupChecklistDefaults_1.hasSystemChecklistDefault)(slug),
            },
        });
    }
    catch (e) {
        console.error('[hub_service_group_checklist] put', e);
        return res.status(500).json({ error: 'Erro ao salvar checklist' });
    }
};
exports.putHubServiceGroupChecklist = putHubServiceGroupChecklist;
const deleteHubServiceGroupChecklist = async (req, res) => {
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
        await (0, hubServiceGroupsController_1.ensureDefaultHubServiceGroups)(clinicId);
        const exists = await findServiceGroupSlug(clinicId, slug);
        if (!exists) {
            return res.status(404).json({ error: 'Grupo de serviço não encontrado' });
        }
        const { data: group } = await supabase_1.supabaseAdmin
            .from('hub_service_groups')
            .select('slug, name, color')
            .eq('clinic_id', clinicId)
            .eq('slug', slug)
            .maybeSingle();
        const { error } = await supabase_1.supabaseAdmin
            .from('hub_service_group_checklist_templates')
            .delete()
            .eq('clinic_id', clinicId)
            .eq('service_group_slug', slug)
            .is('unit_id', null);
        if (error) {
            console.error('[hub_service_group_checklist] delete', error);
            return res.status(500).json({ error: error.message });
        }
        const g = group;
        return res.json({
            group: {
                slug: g.slug,
                name: g.name,
                color: g.color,
                items: (0, serviceGroupChecklistDefaults_1.resolveChecklistTemplateItems)(slug, null),
                is_custom: false,
                has_system_default: (0, serviceGroupChecklistDefaults_1.hasSystemChecklistDefault)(slug),
            },
        });
    }
    catch (e) {
        console.error('[hub_service_group_checklist] delete', e);
        return res.status(500).json({ error: 'Erro ao restaurar checklist padrão' });
    }
};
exports.deleteHubServiceGroupChecklist = deleteHubServiceGroupChecklist;
