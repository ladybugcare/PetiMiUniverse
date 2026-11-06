import { supabaseAdmin } from '../../config/supabase';

export const ALLOCATION_POLICIES = ['optional', 'prompt_on_start', 'required_on_start'] as const;
export type AllocationPolicy = (typeof ALLOCATION_POLICIES)[number];

const LEVE_TRAZ_SLUG = 'leva_traz';

export type ResourceSnapshot =
  | { ok: true; hub_resource_id: string | null; resource_label: string | null }
  | { ok: false; error: string };

export async function resolveResourceSnapshot(opts: {
  clinicId: string;
  unitId: string | null;
  hubResourceId: string | null | undefined;
  resourceLabel: string | null | undefined;
}): Promise<ResourceSnapshot> {
  if (opts.hubResourceId) {
    const { data, error } = await supabaseAdmin
      .from('hub_resources')
      .select('id, name, unit_id, clinic_id, active')
      .eq('id', opts.hubResourceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data || data.clinic_id !== opts.clinicId) return { ok: false, error: 'Recurso inválido.' };
    if (!data.active) return { ok: false, error: 'Recurso inativo.' };
    if (opts.unitId && data.unit_id !== opts.unitId) {
      return { ok: false, error: 'Recurso pertence a outra unidade.' };
    }
    return { ok: true, hub_resource_id: data.id as string, resource_label: String(data.name) };
  }
  const label = opts.resourceLabel?.trim() || null;
  return { ok: true, hub_resource_id: null, resource_label: label };
}

export async function releaseAppointmentResource(
  clinicId: string,
  appointmentId: string | null | undefined,
): Promise<void> {
  if (!appointmentId) return;
  const now = new Date().toISOString();
  await supabaseAdmin
    .from('hub_appointments')
    .update({ resource_released_at: now })
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .is('resource_released_at', null);
}

type KindRow = {
  id: string;
  name: string;
  service_group_slug: string;
  allocation_policy: AllocationPolicy;
  active: boolean;
  sort_order: number;
};

type ResourceRow = {
  id: string;
  name: string;
  resource_kind_id: string;
  unit_id: string;
  active: boolean;
  sort_order: number;
};

export type AvailabilityResource = {
  id: string;
  name: string;
  kind_id: string;
  kind_name: string;
  busy: boolean;
};

export type ResourceAvailability = {
  uses_catalog: boolean;
  field_label: string;
  policy: AllocationPolicy;
  kinds: Array<{ id: string; name: string; allocation_policy: AllocationPolicy }>;
  resources: AvailabilityResource[];
  active_count: number;
  overlapping_count: number;
  capacity_warning: string | null;
};

function strictestPolicy(policies: AllocationPolicy[]): AllocationPolicy {
  if (policies.includes('required_on_start')) return 'required_on_start';
  if (policies.includes('prompt_on_start')) return 'prompt_on_start';
  return 'optional';
}

function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(aEnd).getTime() > new Date(bStart).getTime();
}

function isLiveBusy(row: {
  status: string;
  starts_at: string;
  ends_at: string;
  resource_released_at: string | null;
}, nowIso: string): boolean {
  if (row.resource_released_at) return false;
  if (row.status === 'cancelled' || row.status === 'done' || row.status === 'paid') return false;
  if (row.status === 'in_progress') return true;
  const now = new Date(nowIso).getTime();
  const start = new Date(row.starts_at).getTime();
  const end = new Date(row.ends_at).getTime();
  return now >= start && now < end;
}

async function loadServiceGroup(clinicId: string, serviceTypeId: string): Promise<{
  serviceGroup: string | null;
  error?: string;
}> {
  const { data, error } = await supabaseAdmin
    .from('hub_service_types')
    .select('id, service_group')
    .eq('id', serviceTypeId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return { serviceGroup: null, error: error.message };
  if (!data) return { serviceGroup: null, error: 'Tipo de serviço inválido.' };
  return { serviceGroup: String(data.service_group ?? '') };
}

async function compatibleKinds(
  clinicId: string,
  serviceGroup: string,
  serviceTypeId: string,
): Promise<KindRow[]> {
  const { data: kinds, error } = await supabaseAdmin
    .from('hub_resource_kinds')
    .select('id, name, service_group_slug, allocation_policy, active, sort_order')
    .eq('clinic_id', clinicId)
    .eq('service_group_slug', serviceGroup)
    .eq('active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error || !kinds) return [];

  const { data: restrictions } = await supabaseAdmin
    .from('hub_service_type_resource_kinds')
    .select('resource_kind_id')
    .eq('clinic_id', clinicId)
    .eq('hub_service_type_id', serviceTypeId);
  const allowed = new Set((restrictions ?? []).map((r: { resource_kind_id: string }) => r.resource_kind_id));
  const rows = kinds as KindRow[];
  if (allowed.size === 0) return rows;
  return rows.filter((k) => allowed.has(k.id));
}

export async function getResourceAvailability(opts: {
  clinicId: string;
  unitId: string;
  serviceTypeId: string;
  startsAt: string;
  endsAt: string;
  excludeAppointmentId?: string | null;
  mode: 'window' | 'now';
}): Promise<ResourceAvailability | { error: string }> {
  const group = await loadServiceGroup(opts.clinicId, opts.serviceTypeId);
  if (group.error) return { error: group.error };
  const serviceGroup = group.serviceGroup ?? '';
  const empty: ResourceAvailability = {
    uses_catalog: false,
    field_label: 'Recurso / Sala',
    policy: 'optional',
    kinds: [],
    resources: [],
    active_count: 0,
    overlapping_count: 0,
    capacity_warning: null,
  };
  if (!serviceGroup || serviceGroup === LEVE_TRAZ_SLUG) return empty;

  const { data: setting } = await supabaseAdmin
    .from('hub_resource_group_settings')
    .select('enabled')
    .eq('clinic_id', opts.clinicId)
    .eq('service_group_slug', serviceGroup)
    .maybeSingle();
  if (!setting?.enabled) return empty;

  const kinds = await compatibleKinds(opts.clinicId, serviceGroup, opts.serviceTypeId);
  if (kinds.length === 0) return empty;

  const kindIds = kinds.map((k) => k.id);
  const { data: resourceRows, error: resErr } = await supabaseAdmin
    .from('hub_resources')
    .select('id, name, resource_kind_id, unit_id, active, sort_order')
    .eq('clinic_id', opts.clinicId)
    .eq('unit_id', opts.unitId)
    .in('resource_kind_id', kindIds)
    .eq('active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (resErr) return { error: resErr.message };
  const resources = (resourceRows ?? []) as ResourceRow[];
  if (resources.length === 0) return empty;

  const kindById = new Map(kinds.map((k) => [k.id, k]));
  const resourceIds = resources.map((r) => r.id);
  let occQ = supabaseAdmin
    .from('hub_appointments')
    .select('id, hub_resource_id, status, starts_at, ends_at, resource_released_at')
    .eq('clinic_id', opts.clinicId)
    .eq('unit_id', opts.unitId)
    .in('hub_resource_id', resourceIds)
    .is('deleted_at', null)
    .neq('status', 'cancelled');
  if (opts.excludeAppointmentId) occQ = occQ.neq('id', opts.excludeAppointmentId);
  const { data: occRows, error: occErr } = await occQ;
  if (occErr) return { error: occErr.message };

  const nowIso = new Date().toISOString();
  const busyIds = new Set<string>();
  for (const row of occRows ?? []) {
    const resourceId = row.hub_resource_id as string | null;
    if (!resourceId) continue;
    const released = (row.resource_released_at as string | null) ?? null;
    if (released) continue;
    if (opts.mode === 'now') {
      if (
        isLiveBusy(
          {
            status: String(row.status),
            starts_at: String(row.starts_at),
            ends_at: String(row.ends_at),
            resource_released_at: released,
          },
          nowIso,
        )
      ) {
        busyIds.add(resourceId);
      }
    } else if (intervalsOverlap(opts.startsAt, opts.endsAt, String(row.starts_at), String(row.ends_at))) {
      busyIds.add(resourceId);
    }
  }

  const uniqueKindNames = [...new Set(kinds.map((k) => k.name))];
  const fieldLabel = uniqueKindNames.length === 1 ? uniqueKindNames[0]! : 'Recurso';

  const { data: groupTypes } = await supabaseAdmin
    .from('hub_service_types')
    .select('id')
    .eq('clinic_id', opts.clinicId)
    .eq('service_group', serviceGroup)
    .eq('is_addon', false)
    .is('deleted_at', null);
  const typeIds = (groupTypes ?? []).map((t: { id: string }) => t.id);
  let overlappingCount = 0;
  if (typeIds.length > 0 && opts.mode === 'window') {
    let countQ = supabaseAdmin
      .from('hub_appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', opts.clinicId)
      .eq('unit_id', opts.unitId)
      .in('hub_service_type_id', typeIds)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .lt('starts_at', opts.endsAt)
      .gt('ends_at', opts.startsAt);
    if (opts.excludeAppointmentId) countQ = countQ.neq('id', opts.excludeAppointmentId);
    const { count } = await countQ;
    overlappingCount = count ?? 0;
  }

  const activeCount = resources.length;
  let capacityWarning: string | null = null;
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

export type GroomingResourceDecision =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function prepareResourceForGroomingStart(opts: {
  clinicId: string;
  appointmentId: string | null | undefined;
  hubResourceId?: string | null;
  skipResource?: boolean;
}): Promise<GroomingResourceDecision> {
  if (!opts.appointmentId) return { ok: true };

  const { data: appt, error } = await supabaseAdmin
    .from('hub_appointments')
    .select('id, unit_id, hub_service_type_id, hub_resource_id, resource_label, starts_at, ends_at, status')
    .eq('id', opts.appointmentId)
    .eq('clinic_id', opts.clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return { ok: false, status: 500, body: { error: error.message } };
  if (!appt) return { ok: true };
  if (!appt.unit_id || !appt.hub_service_type_id) return { ok: true };

  const now = new Date().toISOString();
  const windowEnd = new Date(Date.now() + 60_000).toISOString();
  const availability = await getResourceAvailability({
    clinicId: opts.clinicId,
    unitId: appt.unit_id as string,
    serviceTypeId: appt.hub_service_type_id as string,
    startsAt: now,
    endsAt: windowEnd,
    excludeAppointmentId: appt.id as string,
    mode: 'now',
  });
  if ('error' in availability) return { ok: false, status: 500, body: { error: availability.error } };
  if (!availability.uses_catalog) return { ok: true };

  const requestedId = opts.hubResourceId === undefined ? (appt.hub_resource_id as string | null) : opts.hubResourceId;
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
      const { error: clearErr } = await supabaseAdmin
        .from('hub_appointments')
        .update({
          hub_resource_id: null,
          resource_label: null,
          resource_released_at: null,
        })
        .eq('id', appt.id as string)
        .eq('clinic_id', opts.clinicId);
      if (clearErr) return { ok: false, status: 500, body: { error: clearErr.message } };
    }
    return { ok: true };
  }

  const { error: upErr } = await supabaseAdmin
    .from('hub_appointments')
    .update({
      hub_resource_id: current!.id,
      resource_label: current!.name,
      resource_released_at: null,
    })
    .eq('id', appt.id as string)
    .eq('clinic_id', opts.clinicId);
  if (upErr) return { ok: false, status: 500, body: { error: upErr.message } };
  return { ok: true };
}
