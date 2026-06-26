import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/clinic-settings';

export type HubClinicSettings = {
  pet_puppy_max_months: number;
  /** Templates de mensagem WhatsApp customizados pela clínica. Chave ausente = usa o texto padrão. */
  message_templates: Record<string, string>;
};

export type PatchHubClinicSettingsPayload = {
  pet_puppy_max_months?: number;
  message_templates?: Record<string, string>;
};

export const hubClinicSettingsApi = {
  async get(clinicId: string): Promise<{ settings: HubClinicSettings }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${basePath}?${q.toString()}`) as Promise<{ settings: HubClinicSettings }>;
  },

  async patch(clinicId: string, payload: PatchHubClinicSettingsPayload): Promise<{ settings: HubClinicSettings }> {
    return apiRequest(basePath, {
      method: 'PATCH',
      body: JSON.stringify({ clinic_id: clinicId, ...payload }),
    }) as Promise<{ settings: HubClinicSettings }>;
  },
};
