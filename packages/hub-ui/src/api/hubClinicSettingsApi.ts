import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/clinic-settings';

export type HubClinicSettings = {
  pet_puppy_max_months: number;
};

export const hubClinicSettingsApi = {
  async get(clinicId: string): Promise<{ settings: HubClinicSettings }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${basePath}?${q.toString()}`) as Promise<{ settings: HubClinicSettings }>;
  },

  async patch(clinicId: string, pet_puppy_max_months: number): Promise<{ settings: HubClinicSettings }> {
    return apiRequest(basePath, {
      method: 'PATCH',
      body: JSON.stringify({ clinic_id: clinicId, pet_puppy_max_months }),
    }) as Promise<{ settings: HubClinicSettings }>;
  },
};
