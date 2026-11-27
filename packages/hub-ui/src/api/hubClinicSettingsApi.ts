import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/clinic-settings';

export type HubCupomWidthMm = 58 | 80;

/** Cobrança de L&T em lote multi-pet: uma vez por dia da visita ou uma vez por pet. */
export type HubMultipetPickupBilling = 'per_visit' | 'per_pet';

export type HubClinicSettings = {
  pet_puppy_max_months: number;
  /** Templates de mensagem WhatsApp customizados pela clínica. Chave ausente = usa o texto padrão. */
  message_templates: Record<string, string>;
  /** Largura do cupom térmico de venda (58 ou 80 mm). Default 80 se ausente. */
  cupom_width_mm?: HubCupomWidthMm;
  /** Default `per_visit`. Dias de calendário diferentes no lote sempre cobram por pet. */
  multipet_pickup_billing?: HubMultipetPickupBilling;
};

export type PatchHubClinicSettingsPayload = {
  pet_puppy_max_months?: number;
  message_templates?: Record<string, string>;
  cupom_width_mm?: HubCupomWidthMm;
  multipet_pickup_billing?: HubMultipetPickupBilling;
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
