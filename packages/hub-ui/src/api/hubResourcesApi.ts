import { apiRequest } from '@petimi/web-core';

const base = '/api/hub';

export type AllocationPolicy = 'optional' | 'prompt_on_start' | 'required_on_start';

export type HubResourceKind = {
  id: string;
  clinic_id: string;
  service_group_slug: string;
  name: string;
  allocation_policy: AllocationPolicy;
  sort_order: number;
  active: boolean;
};

export type HubResourceGroupSetting = {
  service_group_slug: string;
  enabled: boolean;
};

export type HubResource = {
  id: string;
  clinic_id: string;
  unit_id: string;
  resource_kind_id: string;
  name: string;
  active: boolean;
  sort_order: number;
  notes?: string | null;
  kind_name: string;
  service_group_slug: string | null;
  allocation_policy: AllocationPolicy;
};

export type ResourceAvailability = {
  uses_catalog: boolean;
  field_label: string;
  policy: AllocationPolicy;
  kinds: Array<{ id: string; name: string; allocation_policy: AllocationPolicy }>;
  resources: Array<{
    id: string;
    name: string;
    kind_id: string;
    kind_name: string;
    busy: boolean;
  }>;
  active_count: number;
  overlapping_count: number;
  capacity_warning: string | null;
};

export const hubResourcesApi = {
  listKinds(clinicId: string, serviceGroup?: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (serviceGroup) q.set('service_group', serviceGroup);
    return apiRequest(`${base}/resource-kinds?${q}`) as Promise<{
      kinds: HubResourceKind[];
      settings: HubResourceGroupSetting[];
    }>;
  },

  createKind(payload: {
    clinic_id: string;
    service_group_slug: string;
    name: string;
    allocation_policy?: AllocationPolicy;
    sort_order?: number;
  }) {
    return apiRequest(`${base}/resource-kinds`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ kind: HubResourceKind }>;
  },

  patchKind(
    id: string,
    payload: {
      clinic_id: string;
      name?: string;
      allocation_policy?: AllocationPolicy;
      sort_order?: number;
      active?: boolean;
    },
  ) {
    return apiRequest(`${base}/resource-kinds/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ kind: HubResourceKind }>;
  },

  deleteKind(id: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${base}/resource-kinds/${encodeURIComponent(id)}?${q}`, { method: 'DELETE' });
  },

  putGroupSetting(payload: { clinic_id: string; service_group_slug: string; enabled: boolean }) {
    return apiRequest(`${base}/resource-group-settings`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }) as Promise<{ setting: HubResourceGroupSetting }>;
  },

  list(opts: { clinicId: string; unitId?: string; serviceGroup?: string; includeInactive?: boolean }) {
    const q = new URLSearchParams({ clinic_id: opts.clinicId });
    if (opts.unitId) q.set('unit_id', opts.unitId);
    if (opts.serviceGroup) q.set('service_group', opts.serviceGroup);
    if (opts.includeInactive) q.set('include_inactive', 'true');
    return apiRequest(`${base}/resources?${q}`) as Promise<{ resources: HubResource[] }>;
  },

  create(payload: {
    clinic_id: string;
    unit_id: string;
    resource_kind_id: string;
    name: string;
    sort_order?: number;
    notes?: string | null;
  }) {
    return apiRequest(`${base}/resources`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ resource: HubResource }>;
  },

  patch(
    id: string,
    payload: { clinic_id: string; name?: string; sort_order?: number; notes?: string | null; active?: boolean },
  ) {
    return apiRequest(`${base}/resources/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ resource: HubResource }>;
  },

  delete(id: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${base}/resources/${encodeURIComponent(id)}?${q}`, { method: 'DELETE' });
  },

  availability(opts: {
    clinicId: string;
    unitId: string;
    serviceTypeId: string;
    startsAt: string;
    endsAt: string;
    excludeAppointmentId?: string | null;
    mode?: 'window' | 'now';
  }) {
    const q = new URLSearchParams({
      clinic_id: opts.clinicId,
      unit_id: opts.unitId,
      hub_service_type_id: opts.serviceTypeId,
      starts_at: opts.startsAt,
      ends_at: opts.endsAt,
      mode: opts.mode ?? 'window',
    });
    if (opts.excludeAppointmentId) q.set('exclude_appointment_id', opts.excludeAppointmentId);
    return apiRequest(`${base}/resources/availability?${q}`) as Promise<ResourceAvailability>;
  },

  getServiceTypeKinds(serviceTypeId: string, clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${base}/service-types/${encodeURIComponent(serviceTypeId)}/resource-kinds?${q}`) as Promise<{
      inherit: boolean;
      resource_kind_ids: string[];
    }>;
  },

  putServiceTypeKinds(serviceTypeId: string, payload: { clinic_id: string; resource_kind_ids: string[] }) {
    return apiRequest(`${base}/service-types/${encodeURIComponent(serviceTypeId)}/resource-kinds`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }) as Promise<{ inherit: boolean; resource_kind_ids: string[] }>;
  },
};
