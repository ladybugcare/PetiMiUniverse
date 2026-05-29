import { apiRequest } from '@petimi/web-core';
import type { HubClinicProfile, HubUnitProfile } from '../types/hubClinicProfile';

export type PatchHubClinicProfileBody = {
  name?: string;
  phone?: string | null;
  address?: string;
  city?: string;
  state?: string;
  description?: string | null;
};

export type PatchHubUnitProfileBody = {
  name?: string;
  nickname?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string | null;
  technical_manager?: string;
  is_main?: boolean;
};

export const hubClinicProfileApi = {
  getById(clinicId: string): Promise<{ clinic: HubClinicProfile }> {
    return apiRequest(`/clinics/${encodeURIComponent(clinicId)}`) as Promise<{ clinic: HubClinicProfile }>;
  },

  patchClinic(clinicId: string, body: PatchHubClinicProfileBody): Promise<{ clinic: HubClinicProfile }> {
    return apiRequest(`/api/hub/clinic/profile?clinic_id=${encodeURIComponent(clinicId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }) as Promise<{ clinic: HubClinicProfile }>;
  },

  patchUnit(
    unitId: string,
    clinicId: string,
    body: PatchHubUnitProfileBody,
  ): Promise<{ unit: HubUnitProfile }> {
    return apiRequest(
      `/api/hub/units/${encodeURIComponent(unitId)}?clinic_id=${encodeURIComponent(clinicId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    ) as Promise<{ unit: HubUnitProfile }>;
  },
};
