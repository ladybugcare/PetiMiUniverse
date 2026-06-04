import { apiRequest } from '@petimi/web-core';
import type { HubUnit } from '../types/hubUnit';
import type { HubUnitProfile } from '../types/hubClinicProfile';

export const hubUnitsApi = {
  getByClinic(clinicId: string, activeOnly = true): Promise<{ units: HubUnit[] }> {
    const qs = activeOnly ? '?activeOnly=true' : '';
    return apiRequest(`/units/clinic/${encodeURIComponent(clinicId)}${qs}`) as Promise<{
      units: HubUnit[];
    }>;
  },

  getById(unitId: string): Promise<{ unit: HubUnitProfile }> {
    return apiRequest(`/units/${encodeURIComponent(unitId)}`) as Promise<{ unit: HubUnitProfile }>;
  },
};
