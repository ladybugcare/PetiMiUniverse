"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOCATION_POLICIES = void 0;
exports.resolveResourceSnapshot = resolveResourceSnapshot;
exports.releaseAppointmentResource = releaseAppointmentResource;
exports.getResourceAvailability = getResourceAvailability;
exports.prepareResourceForGroomingStart = prepareResourceForGroomingStart;
const supabase_1 = require("../../config/supabase");
exports.ALLOCATION_POLICIES = ['optional', 'prompt_on_start', 'required_on_start'];
const LEVE_TRAZ_SLUG = 'leva_traz';
async function resolveResourceSnapshot(opts) {
    if (opts.hubResourceId) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('hub_resources')
            .select('id, name, unit_id, clinic_id, active')
            .eq('id', opts.hubResourceId)
            .is('deleted_at', null)
            .maybeSingle();
        if (error)
            return { ok: false, error: error.message };
        if (!data || data.clinic_id !== opts.clinicId)
            return { ok: false, error: 'Recurso inválido.' };
        if (!data.active)
            return { ok: false, error: 'Recurso inativo.' };
        if (opts.unitId && data.unit_id !== opts.unitId) {
            return { ok: false, error: 'Recurso pertence a outra unidade.' };
        }
        return { ok: true, hub_resource_id: data.id, resource_label: String(data.name) };
    }
    const label = opts.resourceLabel?.trim() || null;
    return { ok: true, hub_resource_id: null, resource_label: label };
}
async function releaseAppointmentResource(clinicId, appointmentId) {
    if (!appointmentId)
        return;
    const now = new Date().toISOString();
    await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .update({ resource_released_at: now })
        .eq('id', appointmentId)
        .eq('clinic_id', clinicId)
        .is('resource_released_at', null);
}
function strictestPolicy(policies) {
    if (policies.includes('required_on_start'))
        return 'required_on_start';
    if (policies.includes('prompt_on_start'))
        return 'prompt_on_start';
    return 'optional';
}
function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
    return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(aEnd).getTime() > new Date(bStart).getTime();
}
function isLiveBusy(row, nowIso) {
    if (row.resource_released_at)
        return false;
    if (row.status === 'cancelled' || row.status === 'done' || row.status === 'paid')
        return false;
    if (row.status === 'in_progress')
        return true;
    const now = new Date(nowIso).getTime();
    const start = new Date(row.starts_at).getTime();
    const end = new Date(row.ends_at).getTime();
    return now >= start && now < end;
}
async function loadServiceGroup(clinicId, serviceTypeId) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id, service_group')
        .eq('id', serviceTypeId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error)
        return { serviceGroup: null, error: error.message };
    if (!data)
        return { serviceGroup: null, error: 'Tipo de serviço inválido.' };
    return { serviceGroup: String(data.service_group ?? '') };
}
async function compatibleKinds(clinicId, serviceGroup, serviceTypeId) {
    const { data: kinds, error } = await supabase_1.supabaseAdmin
        .from('hub_resource_kinds')
        .select('id, name, service_group_slug, allocation_policy, active, sort_order')
        .eq('clinic_id', clinicId)
        .eq('service_group_slug', serviceGroup)
        .eq('active', true)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
    if (error || !kinds)
        return [];
    const { data: restrictions } = await supabase_1.supabaseAdmin
        .from('hub_service_type_resource_kinds')
        .select('resource_kind_id')
        .eq('clinic_id', clinicId)
        .eq('hub_service_type_id', serviceTypeId);
    const allowed = new Set((restrictions ?? []).map((r) => r.resource_kind_id));
    const rows = kinds;
    if (allowed.size === 0)
        return rows;
    return rows.filter((k) => allowed.has(k.id));
}
async function getResourceAvailability(opts) {
    const group = await loadServiceGroup(opts.clinicId, opts.serviceTypeId);
    if (group.error)
        return { error: group.error };
    const serviceGroup = group.serviceGroup ?? '';
    const empty = {
        uses_catalog: false,
        field_label: 'Recurso / Sala',
        policy: 'optional',
        kinds: [],
        resources: [],
        active_count: 0,
        overlapping_count: 0,
        capacity_warning: null,
    };
    if (!serviceGroup || serviceGroup === LEVE_TRAZ_SLUG)
        return empty;
    const { data: setting } = await supabase_1.supabaseAdmin
        .from('hub_resource_group_settings')
        .select('enabled')
        .eq('clinic_id', opts.clinicId)
        .eq('service_group_slug', serviceGroup)
        .maybeSingle();
    if (!setting?.enabled)
        return empty;
    const kinds = await compatibleKinds(opts.clinicId, serviceGroup, opts.serviceTypeId);
    if (kinds.length === 0)
        return empty;
    const kindIds = kinds.map((k) => k.id);
    const { data: resourceRows, error: resErr } = await supabase_1.supabaseAdmin
        .from('hub_resources')
        .select('id, name, resource_kind_id, unit_id, active, sort_order')
        .eq('clinic_id', opts.clinicId)
        .eq('unit_id', opts.unitId)
        .in('resource_kind_id', kindIds)
        .eq('active', true)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
    if (resErr)
        return { error: resErr.message };
    const resources = (resourceRows ?? []);
    if (resources.length === 0)
        return empty;
    const kindById = new Map(kinds.map((k) => [k.id, k]));
    const resourceIds = resources.map((r) => r.id);
    let occQ = supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, hub_resource_id, status, starts_at, ends_at, resource_released_at')
        .eq('clinic_id', opts.clinicId)
        .eq('unit_id', opts.unitId)
        .in('hub_resource_id', resourceIds)
        .is('deleted_at', null)
        .neq('status', 'cancelled');
    if (opts.excludeAppointmentId)
        occQ = occQ.neq('id', opts.excludeAppointmentId);
    const { data: occRows, error: occErr } = await occQ;
    if (occErr)
        return { error: occErr.message };
    const nowIso = new Date().toISOString();
    const busyIds = new Set();
    for (const row of occRows ?? []) {
        const resourceId = row.hub_resource_id;
        if (!resourceId)
            continue;
        const released = row.resource_released_at ?? null;
        if (released)
            continue;
        if (opts.mode === 'now') {
            if (isLiveBusy({
                status: String(row.status),
                starts_at: String(row.starts_at),
                ends_at: String(row.ends_at),
                resource_released_at: released,
            }, nowIso)) {
                busyIds.add(resourceId);
            }
        }
        else if (intervalsOverlap(opts.startsAt, opts.endsAt, String(row.starts_at), String(row.ends_at))) {
            busyIds.add(resourceId);
        }
    }
    const uniqueKindNames = [...new Set(kinds.map((k) => k.name))];
    const fieldLabel = uniqueKindNames.length === 1 ? uniqueKindNames[0] : 'Recurso';
    const { data: groupTypes } = await supabase_1.supabaseAdmin
        .from('hub_service_types')
        .select('id')
        .eq('clinic_id', opts.clinicId)
        .eq('service_group', serviceGroup)
        .eq('is_addon', false)
        .is('deleted_at', null);
    const typeIds = (groupTypes ?? []).map((t) => t.id);
    let overlappingCount = 0;
    if (typeIds.length > 0 && opts.mode === 'window') {
        let countQ = supabase_1.supabaseAdmin
            .from('hub_appointments')
            .select('id', { count: 'exact', head: true })
            .eq('clinic_id', opts.clinicId)
            .eq('unit_id', opts.unitId)
            .in('hub_service_type_id', typeIds)
            .is('deleted_at', null)
            .neq('status', 'cancelled')
            .lt('starts_at', opts.endsAt)
            .gt('ends_at', opts.startsAt);
        if (opts.excludeAppointmentId)
            countQ = countQ.neq('id', opts.excludeAppointmentId);
        const { count } = await countQ;
        overlappingCount = count ?? 0;
    }
    const activeCount = resources.length;
    let capacityWarning = null;
    if (opts.mode === 'window' && overlappingCount > activeCount) {
        const noun = fieldLabel.toLowerCase();
        capacityWarning = `Neste horário há ${overlappingCount} atendimentos e ${activeCount} ${noun}${activeCount === 1 ? '' : 's'} ativo${activeCount === 1 ? '' : 's'}. Algum pode ficar sem vaga.`;
    }
    return {
        uses_catalog: true,
        field_label: fieldLabel,
        policy: strictestPolicy(kinds.map((k) => k.allocation_policy)),
        kinds: kinds.map((k) => ({
            id: k.id,
            name: k.name,
            allocation_policy: k.allocation_policy,
        })),
        resources: resources.map((r) => ({
            id: r.id,
            name: r.name,
            kind_id: r.resource_kind_id,
            kind_name: kindById.get(r.resource_kind_id)?.name ?? 'Recurso',
            busy: busyIds.has(r.id),
        })),
        active_count: activeCount,
        overlapping_count: overlappingCount,
        capacity_warning: capacityWarning,
    };
}
async function prepareResourceForGroomingStart(opts) {
    if (!opts.appointmentId)
        return { ok: true };
    const { data: appt, error } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .select('id, unit_id, hub_service_type_id, hub_resource_id, resource_label, starts_at, ends_at, status')
        .eq('id', opts.appointmentId)
        .eq('clinic_id', opts.clinicId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error)
        return { ok: false, status: 500, body: { error: error.message } };
    if (!appt)
        return { ok: true };
    if (!appt.unit_id || !appt.hub_service_type_id)
        return { ok: true };
    const now = new Date().toISOString();
    const windowEnd = new Date(Date.now() + 60_000).toISOString();
    const availability = await getResourceAvailability({
        clinicId: opts.clinicId,
        unitId: appt.unit_id,
        serviceTypeId: appt.hub_service_type_id,
        startsAt: now,
        endsAt: windowEnd,
        excludeAppointmentId: appt.id,
        mode: 'now',
    });
    if ('error' in availability)
        return { ok: false, status: 500, body: { error: availability.error } };
    if (!availability.uses_catalog)
        return { ok: true };
    const requestedId = opts.hubResourceId === undefined ? appt.hub_resource_id : opts.hubResourceId;
    const current = availability.resources.find((r) => r.id === requestedId) ?? null;
    if (requestedId && !current) {
        return { ok: false, status: 400, body: { error: 'Recurso inválido para este serviço.' } };
    }
    if (current?.busy) {
        return {
            ok: false,
            status: 409,
            body: {
                error: `${availability.field_label} «${current.name}» ainda está em uso. Escolha outra livre.`,
                code: 'resource_busy',
                field_label: availability.field_label,
                resources: availability.resources,
            },
        };
    }
    if (!requestedId) {
        if (availability.policy === 'required_on_start') {
            return {
                ok: false,
                status: 409,
                body: {
                    error: `Escolha ${availability.field_label.toLowerCase()} para iniciar o atendimento.`,
                    code: 'resource_required',
                    field_label: availability.field_label,
                    resources: availability.resources,
                },
            };
        }
        if (availability.policy === 'prompt_on_start' && opts.skipResource !== true) {
            return {
                ok: false,
                status: 409,
                body: {
                    error: `Escolha ${availability.field_label.toLowerCase()} ou siga sem alocar.`,
                    code: 'resource_prompt',
                    field_label: availability.field_label,
                    resources: availability.resources,
                },
            };
        }
        if (appt.hub_resource_id) {
            const { error: clearErr } = await supabase_1.supabaseAdmin
                .from('hub_appointments')
                .update({
                hub_resource_id: null,
                resource_label: null,
                resource_released_at: null,
            })
                .eq('id', appt.id)
                .eq('clinic_id', opts.clinicId);
            if (clearErr)
                return { ok: false, status: 500, body: { error: clearErr.message } };
        }
        return { ok: true };
    }
    const { error: upErr } = await supabase_1.supabaseAdmin
        .from('hub_appointments')
        .update({
        hub_resource_id: current.id,
        resource_label: current.name,
        resource_released_at: null,
    })
        .eq('id', appt.id)
        .eq('clinic_id', opts.clinicId);
    if (upErr)
        return { ok: false, status: 500, body: { error: upErr.message } };
    return { ok: true };
}
