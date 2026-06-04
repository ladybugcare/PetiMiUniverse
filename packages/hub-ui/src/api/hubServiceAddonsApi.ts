import { apiRequest } from '@petimi/web-core';
import type { HubServiceType } from './hubServiceTypesApi';

export type AddonAvailabilityItem = {
  addon_service_type_id: string;
  is_available: boolean;
};

export type AddonDeploymentService = {
  id: string;
  name: string;
  is_available: boolean;
};

export type AddonDeploymentGroup = {
  group_id: string;
  slug: string;
  name: string;
  archived: boolean;
  in_group: boolean;
  service_count: number;
  available_count: number;
  services: AddonDeploymentService[];
};

export type AddonDeploymentItem = {
  service_group_slug: string;
  enabled: boolean;
};

export const hubServiceAddonsApi = {
  async listGroupAddons(
    groupId: string,
    clinicId: string
  ): Promise<{ addon_service_type_ids: string[]; addons: HubServiceType[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`/api/hub/service-groups/${groupId}/addons?${q}`) as Promise<{
      addon_service_type_ids: string[];
      addons: HubServiceType[];
    }>;
  },

  async putGroupAddons(
    groupId: string,
    payload: { clinic_id: string; addon_service_type_ids: string[] }
  ): Promise<{ addon_service_type_ids: string[]; addons: HubServiceType[] }> {
    return apiRequest(`/api/hub/service-groups/${groupId}/addons`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }) as Promise<{ addon_service_type_ids: string[]; addons: HubServiceType[] }>;
  },

  async getAddonAvailability(
    serviceTypeId: string,
    clinicId: string
  ): Promise<{ items: AddonAvailabilityItem[]; addons: HubServiceType[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`/api/hub/service-types/${serviceTypeId}/addon-availability?${q}`) as Promise<{
      items: AddonAvailabilityItem[];
      addons: HubServiceType[];
    }>;
  },

  async putAddonAvailability(
    serviceTypeId: string,
    payload: { clinic_id: string; items: AddonAvailabilityItem[] }
  ): Promise<{ items: AddonAvailabilityItem[]; addons: HubServiceType[] }> {
    return apiRequest(`/api/hub/service-types/${serviceTypeId}/addon-availability`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }) as Promise<{ items: AddonAvailabilityItem[]; addons: HubServiceType[] }>;
  },

  async getAvailableAddons(
    serviceTypeId: string,
    clinicId: string
  ): Promise<{ addons: HubServiceType[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`/api/hub/service-types/${serviceTypeId}/available-addons?${q}`) as Promise<{
      addons: HubServiceType[];
    }>;
  },

  async getAddonDeployments(
    addonId: string,
    clinicId: string
  ): Promise<{ groups: AddonDeploymentGroup[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`/api/hub/service-types/${addonId}/addon-deployments?${q}`) as Promise<{
      groups: AddonDeploymentGroup[];
    }>;
  },

  async putAddonDeployments(
    addonId: string,
    payload: { clinic_id: string; items: AddonDeploymentItem[] }
  ): Promise<{ groups: AddonDeploymentGroup[] }> {
    return apiRequest(`/api/hub/service-types/${addonId}/addon-deployments`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }) as Promise<{ groups: AddonDeploymentGroup[] }>;
  },
};
