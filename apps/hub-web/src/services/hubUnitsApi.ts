import { apiRequest } from '@petimi/web-core';
import type { HubUnit } from '../types/hubUnit';

export const hubUnitsApi = {
  getByClinic(clinicId: string, activeOnly = true): Promise<{ units: HubUnit[] }> {
    const qs = activeOnly ? '?activeOnly=true' : '';
    return apiRequest(`/units/clinic/${encodeURIComponent(clinicId)}${qs}`) as Promise<{
      units: HubUnit[];
    }>;
  },
};
