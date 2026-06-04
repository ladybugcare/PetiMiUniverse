import { apiRequest } from '@petimi/web-core';
import type { HubClinicProfile } from '../types/hubClinicProfile';

const hubBase = '/api/hub';

export const hubProfileApi = {
  async uploadMyPhoto(file: File): Promise<{ url: string; user: Record<string, unknown> }> {
    const fd = new FormData();
    fd.append('photo', file);
    return apiRequest(`${hubBase}/profile/me/photo`, {
      method: 'POST',
      body: fd,
    }) as Promise<{ url: string; user: Record<string, unknown> }>;
  },

  async uploadClinicPhoto(
    clinicId: string,
    file: File,
  ): Promise<{ url: string; clinic: HubClinicProfile }> {
    const fd = new FormData();
    fd.append('photo', file);
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${hubBase}/clinic/profile/photo?${q.toString()}`, {
      method: 'POST',
      body: fd,
    }) as Promise<{ url: string; clinic: HubClinicProfile }>;
  },
};
