"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHubServiceTypeAvailableAddons = exports.putHubAddonDeployments = exports.getHubAddonDeployments = exports.putHubServiceTypeAddonAvailability = exports.getHubServiceTypeAddonAvailability = exports.putHubServiceGroupAddons = exports.getHubServiceGroupAddons = void 0;
exports.linkAddonToGroup = linkAddonToGroup;
exports.unlinkAddonFromGroup = unlinkAddonFromGroup;
exports.seedAddonAvailabilityForNewService = seedAddonAvailabilityForNewService;
exports.resyncAddonAvailabilityOnGroupChange = resyncAddonAvailabilityOnGroupChange;
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const uuidStr = zod_1.z.string().uuid();
const putGroupAddonsSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    addon_service_type_ids: zod_1.z.array(uuidStr).max(200),
})
    .strict();
const putAddonAvailabilitySchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    items: zod_1.z
        .array(zod_1.z.object({
        addon_service_type_id: uuidStr,
        is_available: zod_1.z.boolean(),
    }))
        .max(200),
})
    .strict();
const putAddonDeploymentsSchema = zod_1.z
    .object({
    clinic_id: uuidStr,
    items: zod_1.z
        .array(zod_1.z.object({
        service_group_slug: zod_1.z.string().min(1).max(64),
        enabled: zod_1.z.boolean(),
    }))
        .max(100),
})
    .strict();
const ADDON_SELECT = 'id, clinic_id, code, name, service_group, cost_amount, sale_amount, pricing_matrix, default_duration_minutes, active, allow_scheduling, description, is_addon';
async function assertAddonType(clinicId, addonId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, clinic_id, is_addon, deleted_at')
        .eq('id', addonId)
        .maybeSingle();
    return Boolean(data && data.clinic_id === clinicId && data.is_addon === true && !data.deleted_at);
}
async function assertParentService(clinicId, parentId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, clinic_id, service_group, is_addon, deleted_at')
        .eq('id', parentId)
        .maybeSingle();
    if (!data || data.clinic_id !== clinicId || data.deleted_at || data.is_addon)
        return null;
    return { service_group: String(data.service_group) };
}
async function listParentServicesInGroup(clinicId, serviceGroupSlug) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, name')
        .eq('clinic_id', clinicId)
        .eq('service_group', serviceGroupSlug)
        .eq('is_addon', false)
        .is('deleted_at', null)
        .order('name', { ascending: true });
    return (data ?? []).map((r) => ({ id: r.id, name: String(r.name) }));
}
async function isAddonLinkedToGroup(clinicId, serviceGroupSlug, addonId) {
    const { data } = await supabase_1.supabaseAdmin
        .from('hub_service_group_addons')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('service_group_slug', serviceGroupSlug)
        .eq('addon_service_type_id', addonId)
        .maybeSingle();
    return Boolean(data);
}
/** Marca o adicional disponível em todos os serviços principais do grupo. */
async function activateAddonForAllParentServicesInGroup(clinicId, serviceGroupSlug, addonId) {
    const parents = await listParentServicesInGroup(clinicId, serviceGroupSlug);
    for (const parent of parents) {
        await supabase_1.supabaseAdmin.from('hub_service_type_addon_availability').upsert({
            parent_service_type_id: parent.id,
            addon_service_type_id: addonId,
            is_available: true,
        }, { onConflict: 'parent_service_type_id,addon_service_type_id' });
    }
}
/** Remove linhas de disponibilidade do adicional para serviços do grupo (não altera hub_service_group_addons). */
async function clearAddonAvailabilityInGroup(clinicId, serviceGroupSlug, addonId) {
    const parents = await listParentServicesInGroup(clinicId, serviceGroupSlug);
    for (const parent of parents) {
        await supabase_1.supabaseAdmin
            .from('hub_service_type_addon_availability')
            .delete()
            .eq('parent_service_type_id', parent.id)
            .eq('addon_service_type_id', addonId);
    }
}
async function ensureAddonInGroup(clinicId, serviceGroupSlug, addonId) {
    if (await isAddonLinkedToGroup(clinicId, serviceGroupSlug, addonId))
        return;
    const { data: links } = await supabase_1.supabaseAdmin
        .from('hub_service_group_addons')
        .select('sort_order')
        .eq('clinic_id', clinicId)
        .eq('service_group_slug', serviceGroupSlug)
        .order('sort_order', { ascending: false })
        .limit(1);
    const nextOrder = links?.length && links[0].sort_order != null ? Number(links[0].sort_order) + 1 : 0;
    const { error } = await supabase_1.supabaseAdmin.from('hub_service_group_addons').insert({
        clinic_id: clinicId,
        service_group_slug: serviceGroupSlug,
        addon_service_type_id: addonId,
        sort_order: nextOrder,
    });
    if (error) {
        console.error('[hub_service_group_addons] ensureAddonInGroup', error);
        throw error;
    }
}
/** Associa adicional ao grupo e activa em todos os serviços principais existentes. */
async function linkAddonToGroup(clinicId, serviceGroupSlug, addonId) {
    await ensureAddonInGroup(clinicId, serviceGroupSlug, addonId);
    await activateAddonForAllParentServicesInGroup(clinicId, serviceGroupSlug, addonId);
}
/** Remove adicional do grupo e apaga disponibilidade nos serviços do grupo. */
async function unlinkAddonFromGroup(clinicId, serviceGroupSlug, addonId) {
    await clearAddonAvailabilityInGroup(clinicId, serviceGroupSlug, addonId);
    await supabase_1.supabaseAdmin
        .from('hub_service_group_addons')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('service_group_slug', serviceGroupSlug)
        .eq('addon_service_type_id', addonId);
}
/** Novo serviço no grupo: todos os adicionais do grupo disponíveis (opt-out). */
async function seedAddonAvailabilityForNewService(clinicId, parentServiceTypeId, serviceGroupSlug) {
    const { data: links } = await supabase_1.supabaseAdmin
        .from('hub_service_group_addons')
        .select('addon_service_type_id')
        .eq('clinic_id', clinicId)
        .eq('service_group_slug', serviceGroupSlug);
    if (!links?.length)
        return;
    const rows = links.map((l) => ({
        parent_service_type_id: parentServiceTypeId,
        addon_service_type_id: l.addon_service_type_id,
        is_available: true,
    }));
    await supabase_1.supabaseAdmin.from('hub_service_type_addon_availability').upsert(rows, {
        onConflict: 'parent_service_type_id,addon_service_type_id',
    });
}
/** GET /api/hub/service-groups/:id/addons?clinic_id= */
const getHubServiceGroupAddons = async (req, res) => {
    try {
        const groupId = uuidStr.safeParse(req.params.id);
        const clinicId = uuidStr.safeParse(req.query.clinic_id);
        if (!groupId.success || !clinicId.success) {
            return res.status(400).json({ error: 'id ou clinic_id inválido' });
        }
        const { data: group, error: gErr } = await supabase_1.supabaseAdmin
            .from('hub_service_groups')
            .select('id, clinic_id, slug')
            .eq('id', groupId.data)
            .maybeSingle();
        if (gErr || !group || group.clinic_id !== clinicId.data) {
            return res.status(404).json({ error: 'Grupo não encontrado' });
        }
        const { data: links, error } = await supabase_1.supabaseAdmin
            .from('hub_service_group_addons')
            .select('addon_service_type_id, sort_order')
            .eq('clinic_id', clinicId.data)
            .eq('service_group_slug', group.slug)
            .order('sort_order', { ascending: true });
        if (error) {
            console.error('[hub_service_group_addons] list', error);
            return res.status(500).json({ error: 'Erro ao listar adicionais do grupo' });
        }
        const ids = (links ?? []).map((l) => l.addon_service_type_id);
        if (ids.length === 0) {
            return res.json({ addon_service_type_ids: [], addons: [] });
        }
        const { data: addons } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select(ADDON_SELECT)
            .in('id', ids)
            .is('deleted_at', null);
        const order = new Map(ids.map((id, i) => [id, i]));
        const sorted = (addons ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        return res.json({
            addon_service_type_ids: ids,
            addons: sorted,
        });
    }
    catch (e) {
        console.error('[hub_service_group_addons] get', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getHubServiceGroupAddons = getHubServiceGroupAddons;
/** PUT /api/hub/service-groups/:id/addons */
const putHubServiceGroupAddons = async (req, res) => {
    try {
        const groupId = uuidStr.safeParse(req.params.id);
        if (!groupId.success)
            return res.status(400).json({ error: 'id inválido' });
        const body = putGroupAddonsSchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, addon_service_type_ids } = body.data;
        const { data: group, error: gErr } = await supabase_1.supabaseAdmin
            .from('hub_service_groups')
            .select('id, clinic_id, slug')
            .eq('id', groupId.data)
            .maybeSingle();
        if (gErr || !group || group.clinic_id !== clinic_id) {
            return res.status(404).json({ error: 'Grupo não encontrado' });
        }
        const slug = group.slug;
        const uniqueIds = [...new Set(addon_service_type_ids)];
        for (const aid of uniqueIds) {
            if (!(await assertAddonType(clinic_id, aid))) {
                return res.status(400).json({ error: `Adicional inválido: ${aid}` });
            }
        }
        const { data: prevLinks } = await supabase_1.supabaseAdmin
            .from('hub_service_group_addons')
            .select('addon_service_type_id')
            .eq('clinic_id', clinic_id)
            .eq('service_group_slug', slug);
        const prevSet = new Set((prevLinks ?? []).map((r) => r.addon_service_type_id));
        const nextSet = new Set(uniqueIds);
        const newlyAdded = uniqueIds.filter((id) => !prevSet.has(id));
        const removed = [...prevSet].filter((id) => !nextSet.has(id));
        for (const addonId of removed) {
            await clearAddonAvailabilityInGroup(clinic_id, slug, addonId);
        }
        await supabase_1.supabaseAdmin
            .from('hub_service_group_addons')
            .delete()
            .eq('clinic_id', clinic_id)
            .eq('service_group_slug', slug);
        if (uniqueIds.length > 0) {
            const rows = uniqueIds.map((addon_service_type_id, i) => ({
                clinic_id,
                service_group_slug: slug,
                addon_service_type_id,
                sort_order: i,
            }));
            const { error: insErr } = await supabase_1.supabaseAdmin.from('hub_service_group_addons').insert(rows);
            if (insErr) {
                console.error('[hub_service_group_addons] put insert', insErr);
                return res.status(500).json({ error: 'Erro ao guardar adicionais do grupo' });
            }
        }
        for (const addonId of newlyAdded) {
            await activateAddonForAllParentServicesInGroup(clinic_id, slug, addonId);
        }
        const { data: links } = await supabase_1.supabaseAdmin
            .from('hub_service_group_addons')
            .select('addon_service_type_id, sort_order')
            .eq('clinic_id', clinic_id)
            .eq('service_group_slug', slug)
            .order('sort_order', { ascending: true });
        const ids = (links ?? []).map((l) => l.addon_service_type_id);
        let sorted = [];
        if (ids.length > 0) {
            const { data: addons } = await supabase_1.supabaseAdmin
                .from('hub_service_types')
                .select(ADDON_SELECT)
                .in('id', ids)
                .is('deleted_at', null);
            const order = new Map(ids.map((id, i) => [id, i]));
            sorted = (addons ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        }
        return res.json({ addon_service_type_ids: ids, addons: sorted });
    }
    catch (e) {
        console.error('[hub_service_group_addons] put', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.putHubServiceGroupAddons = putHubServiceGroupAddons;
/** GET /api/hub/service-types/:id/addon-availability?clinic_id= */
const getHubServiceTypeAddonAvailability = async (req, res) => {
    try {
        const parentId = uuidStr.safeParse(req.params.id);
        const clinicId = uuidStr.safeParse(req.query.clinic_id);
        if (!parentId.success || !clinicId.success) {
            return res.status(400).json({ error: 'id ou clinic_id inválido' });
        }
        const parent = await assertParentService(clinicId.data, parentId.data);
        if (!parent)
            return res.status(404).json({ error: 'Serviço não encontrado' });
        const { data: groupAddons } = await supabase_1.supabaseAdmin
            .from('hub_service_group_addons')
            .select('addon_service_type_id, sort_order')
            .eq('clinic_id', clinicId.data)
            .eq('service_group_slug', parent.service_group)
            .order('sort_order', { ascending: true });
        const addonIds = (groupAddons ?? []).map((g) => g.addon_service_type_id);
        if (addonIds.length === 0) {
            return res.json({ items: [], addons: [] });
        }
        const { data: avail } = await supabase_1.supabaseAdmin
            .from('hub_service_type_addon_availability')
            .select('addon_service_type_id, is_available')
            .eq('parent_service_type_id', parentId.data)
            .in('addon_service_type_id', addonIds);
        const availMap = new Map((avail ?? []).map((a) => [a.addon_service_type_id, Boolean(a.is_available)]));
        const { data: addons } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select(ADDON_SELECT)
            .in('id', addonIds)
            .is('deleted_at', null);
        const order = new Map(addonIds.map((id, i) => [id, i]));
        const sortedAddons = (addons ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        const items = addonIds.map((addon_service_type_id) => ({
            addon_service_type_id,
            is_available: availMap.get(addon_service_type_id) ?? true,
        }));
        return res.json({ items, addons: sortedAddons });
    }
    catch (e) {
        console.error('[hub_service_type_addon_availability] get', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getHubServiceTypeAddonAvailability = getHubServiceTypeAddonAvailability;
/** PUT /api/hub/service-types/:id/addon-availability */
const putHubServiceTypeAddonAvailability = async (req, res) => {
    try {
        const parentId = uuidStr.safeParse(req.params.id);
        if (!parentId.success)
            return res.status(400).json({ error: 'id inválido' });
        const body = putAddonAvailabilitySchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, items } = body.data;
        const parent = await assertParentService(clinic_id, parentId.data);
        if (!parent)
            return res.status(404).json({ error: 'Serviço não encontrado' });
        const { data: groupAddons } = await supabase_1.supabaseAdmin
            .from('hub_service_group_addons')
            .select('addon_service_type_id')
            .eq('clinic_id', clinic_id)
            .eq('service_group_slug', parent.service_group);
        const allowed = new Set((groupAddons ?? []).map((g) => g.addon_service_type_id));
        for (const item of items) {
            if (!allowed.has(item.addon_service_type_id)) {
                return res.status(400).json({ error: 'Adicional não pertence ao grupo deste serviço' });
            }
        }
        for (const item of items) {
            await supabase_1.supabaseAdmin.from('hub_service_type_addon_availability').upsert({
                parent_service_type_id: parentId.data,
                addon_service_type_id: item.addon_service_type_id,
                is_available: item.is_available,
            }, { onConflict: 'parent_service_type_id,addon_service_type_id' });
        }
        return (0, exports.getHubServiceTypeAddonAvailability)({ ...req, params: { id: parentId.data }, query: { clinic_id } }, res);
    }
    catch (e) {
        console.error('[hub_service_type_addon_availability] put', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.putHubServiceTypeAddonAvailability = putHubServiceTypeAddonAvailability;
/** Ao mudar o grupo do serviço principal: remove vínculos inválidos; novos adicionais do grupo ficam indisponíveis até activar. */
async function resyncAddonAvailabilityOnGroupChange(clinicId, parentServiceTypeId, newGroupSlug) {
    const { data: groupAddons } = await supabase_1.supabaseAdmin
        .from('hub_service_group_addons')
        .select('addon_service_type_id')
        .eq('clinic_id', clinicId)
        .eq('service_group_slug', newGroupSlug);
    const allowed = new Set((groupAddons ?? []).map((g) => g.addon_service_type_id));
    const { data: existingAvail } = await supabase_1.supabaseAdmin
        .from('hub_service_type_addon_availability')
        .select('addon_service_type_id')
        .eq('parent_service_type_id', parentServiceTypeId);
    for (const row of existingAvail ?? []) {
        const aid = row.addon_service_type_id;
        if (!allowed.has(aid)) {
            await supabase_1.supabaseAdmin
                .from('hub_service_type_addon_availability')
                .delete()
                .eq('parent_service_type_id', parentServiceTypeId)
                .eq('addon_service_type_id', aid);
        }
    }
    for (const addonId of allowed) {
        const { data: row } = await supabase_1.supabaseAdmin
            .from('hub_service_type_addon_availability')
            .select('is_available')
            .eq('parent_service_type_id', parentServiceTypeId)
            .eq('addon_service_type_id', addonId)
            .maybeSingle();
        if (!row) {
            await supabase_1.supabaseAdmin.from('hub_service_type_addon_availability').insert({
                parent_service_type_id: parentServiceTypeId,
                addon_service_type_id: addonId,
                is_available: false,
            });
        }
    }
}
/** GET /api/hub/service-types/:id/addon-deployments?clinic_id= — activação por grupo (adicional) */
const getHubAddonDeployments = async (req, res) => {
    try {
        const addonId = uuidStr.safeParse(req.params.id);
        const clinicId = uuidStr.safeParse(req.query.clinic_id);
        if (!addonId.success || !clinicId.success) {
            return res.status(400).json({ error: 'id ou clinic_id inválido' });
        }
        if (!(await assertAddonType(clinicId.data, addonId.data))) {
            return res.status(404).json({ error: 'Adicional não encontrado' });
        }
        const { data: groups, error: gErr } = await supabase_1.supabaseAdmin
            .from('hub_service_groups')
            .select('id, slug, name, archived_at')
            .eq('clinic_id', clinicId.data)
            .order('display_order', { ascending: true })
            .order('name', { ascending: true });
        if (gErr) {
            console.error('[hub_addon_deployments] list groups', gErr);
            return res.status(500).json({ error: 'Erro ao listar grupos' });
        }
        const { data: groupLinks } = await supabase_1.supabaseAdmin
            .from('hub_service_group_addons')
            .select('service_group_slug')
            .eq('clinic_id', clinicId.data)
            .eq('addon_service_type_id', addonId.data);
        const inGroupSlugs = new Set((groupLinks ?? []).map((l) => l.service_group_slug));
        const deploymentGroups = await Promise.all((groups ?? []).map(async (g) => {
            const slug = g.slug;
            const in_group = inGroupSlugs.has(slug);
            const parents = await listParentServicesInGroup(clinicId.data, slug);
            const service_count = parents.length;
            let available_count = 0;
            const services = [];
            if (in_group && parents.length > 0) {
                const parentIds = parents.map((p) => p.id);
                const { data: avail } = await supabase_1.supabaseAdmin
                    .from('hub_service_type_addon_availability')
                    .select('parent_service_type_id, is_available')
                    .eq('addon_service_type_id', addonId.data)
                    .in('parent_service_type_id', parentIds);
                const availMap = new Map((avail ?? []).map((a) => [
                    a.parent_service_type_id,
                    Boolean(a.is_available),
                ]));
                for (const p of parents) {
                    const is_available = availMap.get(p.id) ?? true;
                    services.push({ id: p.id, name: p.name, is_available });
                    if (is_available)
                        available_count += 1;
                }
            }
            return {
                group_id: g.id,
                slug,
                name: String(g.name),
                archived: Boolean(g.archived_at),
                in_group,
                service_count,
                available_count,
                services,
            };
        }));
        return res.json({ groups: deploymentGroups });
    }
    catch (e) {
        console.error('[hub_addon_deployments] get', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getHubAddonDeployments = getHubAddonDeployments;
/** PUT /api/hub/service-types/:id/addon-deployments */
const putHubAddonDeployments = async (req, res) => {
    try {
        const addonId = uuidStr.safeParse(req.params.id);
        if (!addonId.success)
            return res.status(400).json({ error: 'id inválido' });
        const body = putAddonDeploymentsSchema.safeParse(req.body);
        if (!body.success) {
            return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });
        }
        const { clinic_id, items } = body.data;
        if (!(await assertAddonType(clinic_id, addonId.data))) {
            return res.status(404).json({ error: 'Adicional não encontrado' });
        }
        for (const item of items) {
            const { data: group } = await supabase_1.supabaseAdmin
                .from('hub_service_groups')
                .select('id, slug')
                .eq('clinic_id', clinic_id)
                .eq('slug', item.service_group_slug)
                .maybeSingle();
            if (!group) {
                return res.status(400).json({ error: `Grupo inválido: ${item.service_group_slug}` });
            }
            if (item.enabled) {
                await linkAddonToGroup(clinic_id, item.service_group_slug, addonId.data);
            }
            else {
                await unlinkAddonFromGroup(clinic_id, item.service_group_slug, addonId.data);
            }
        }
        return (0, exports.getHubAddonDeployments)({ ...req, params: { id: addonId.data }, query: { clinic_id } }, res);
    }
    catch (e) {
        console.error('[hub_addon_deployments] put', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.putHubAddonDeployments = putHubAddonDeployments;
/** GET /api/hub/service-types/:id/available-addons?clinic_id= — para agenda */
const getHubServiceTypeAvailableAddons = async (req, res) => {
    try {
        const parentId = uuidStr.safeParse(req.params.id);
        const clinicId = uuidStr.safeParse(req.query.clinic_id);
        if (!parentId.success || !clinicId.success) {
            return res.status(400).json({ error: 'id ou clinic_id inválido' });
        }
        const parent = await assertParentService(clinicId.data, parentId.data);
        if (!parent)
            return res.status(404).json({ error: 'Serviço não encontrado' });
        const { data: groupAddons } = await supabase_1.supabaseAdmin
            .from('hub_service_group_addons')
            .select('addon_service_type_id, sort_order')
            .eq('clinic_id', clinicId.data)
            .eq('service_group_slug', parent.service_group)
            .order('sort_order', { ascending: true });
        const addonIds = (groupAddons ?? []).map((g) => g.addon_service_type_id);
        if (addonIds.length === 0) {
            return res.json({ addons: [] });
        }
        const { data: avail } = await supabase_1.supabaseAdmin
            .from('hub_service_type_addon_availability')
            .select('addon_service_type_id, is_available')
            .eq('parent_service_type_id', parentId.data)
            .in('addon_service_type_id', addonIds);
        const availMap = new Map((avail ?? []).map((a) => [a.addon_service_type_id, Boolean(a.is_available)]));
        const availableIds = addonIds.filter((id) => availMap.get(id) !== false);
        if (availableIds.length === 0) {
            return res.json({ addons: [] });
        }
        const { data: addons } = await supabase_1.supabaseAdmin
            .from('hub_service_types')
            .select(ADDON_SELECT)
            .in('id', availableIds)
            .is('deleted_at', null);
        const order = new Map(availableIds.map((id, i) => [id, i]));
        const sorted = (addons ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        return res.json({ addons: sorted });
    }
    catch (e) {
        console.error('[hub_service_type_addon_availability] available', e);
        return res.status(500).json({ error: 'Erro interno' });
    }
};
exports.getHubServiceTypeAvailableAddons = getHubServiceTypeAvailableAddons;
