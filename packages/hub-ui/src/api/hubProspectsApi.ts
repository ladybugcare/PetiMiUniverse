import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/prospects';

export interface HubProspect {
  id: string;
  clinic_id: string;
  full_name: string;
  tax_id: string;
  phone: string;
  email: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export const hubProspectsApi = {
  async list(clinicId: string, q?: string): Promise<{ prospects: HubProspect[] }> {
    const sp = new URLSearchParams({ clinic_id: clinicId });
    if (q?.trim()) sp.set('q', q.trim());
    return apiRequest(`${basePath}?${sp}`) as Promise<{ prospects: HubProspect[] }>;
  },

  async get(id: string, clinicId: string): Promise<{ prospect: HubProspect }> {
    const sp = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${basePath}/${id}?${sp}`) as Promise<{ prospect: HubProspect }>;
  },

  async create(payload: {
    clinic_id: string;
    full_name: string;
    tax_id: string;
    phone: string;
    email?: string | null;
  }): Promise<{ prospect: HubProspect }> {
    return apiRequest(basePath, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ prospect: HubProspect }>;
  },

  async patch(
    id: string,
    payload: {
      clinic_id: string;
      full_name?: string;
      tax_id?: string;
      phone?: string;
      email?: string | null;
      archived?: boolean;
    }
  ): Promise<{ prospect: HubProspect }> {
    return apiRequest(`${basePath}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ prospect: HubProspect }>;
  },
};
