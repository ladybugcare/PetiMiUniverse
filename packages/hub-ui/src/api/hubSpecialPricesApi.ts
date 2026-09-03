import { apiRequest } from '@petimi/web-core';

const base = '/api/hub/special-prices';

export type HubSpecialPriceScope = 'pet' | 'guardian' | 'family_plan';
export type HubSpecialPriceStatus = 'pending_approval' | 'active' | 'inactive';

export type HubSpecialPrice = {
  id: string;
  clinic_id: string;
  scope: HubSpecialPriceScope;
  guardian_id: string | null;
  pet_id: string | null;
  hub_service_type_id: string;
  sale_amount: number;
  cost_amount: number | null;
  notes: string | null;
  status: HubSpecialPriceStatus;
  catalog_sale_at_set: number | null;
  auto_track_catalog: boolean;
  needs_catalog_review: boolean;
  valid_from: string | null;
  valid_until: string | null;
  member_pet_ids?: string[];
  service_name?: string | null;
};

export type HubResolvedSpecialPrice = {
  special_price_id: string;
  scope: HubSpecialPriceScope;
  sale_amount: number;
  cost_amount: number | null;
  catalog_sale: number | null;
  pricing_source: 'special_pet' | 'special_guardian' | 'special_family';
  notes: string | null;
  family_total?: number;
  family_pet_count?: number;
};

export type CreateHubSpecialPricePayload = {
  clinic_id: string;
  scope: HubSpecialPriceScope;
  guardian_id?: string | null;
  pet_id?: string | null;
  hub_service_type_id: string;
  sale_amount: number;
  cost_amount?: number | null;
  notes?: string | null;
  auto_track_catalog?: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  member_pet_ids?: string[];
};

export const hubSpecialPricesApi = {
  async list(params: {
    clinic_id: string;
    pet_id?: string;
    guardian_id?: string;
    hub_service_type_id?: string;
    status?: HubSpecialPriceStatus | 'all';
    needs_catalog_review?: boolean;
  }): Promise<{ special_prices: HubSpecialPrice[] }> {
    const q = new URLSearchParams({ clinic_id: params.clinic_id });
    if (params.pet_id) q.set('pet_id', params.pet_id);
    if (params.guardian_id) q.set('guardian_id', params.guardian_id);
    if (params.hub_service_type_id) q.set('hub_service_type_id', params.hub_service_type_id);
    if (params.status) q.set('status', params.status);
    if (params.needs_catalog_review) q.set('needs_catalog_review', 'true');
    return apiRequest(`${base}?${q}`) as Promise<{ special_prices: HubSpecialPrice[] }>;
  },

  async resolve(params: {
    clinic_id: string;
    hub_service_type_id: string;
    pet_id?: string;
    guardian_id?: string;
    on_date?: string;
  }): Promise<{ catalog_sale: number | null; special_price: HubResolvedSpecialPrice | null }> {
    const q = new URLSearchParams({
      clinic_id: params.clinic_id,
      hub_service_type_id: params.hub_service_type_id,
    });
    if (params.pet_id) q.set('pet_id', params.pet_id);
    if (params.guardian_id) q.set('guardian_id', params.guardian_id);
    if (params.on_date) q.set('on_date', params.on_date);
    return apiRequest(`${base}/resolve?${q}`) as Promise<{
      catalog_sale: number | null;
      special_price: HubResolvedSpecialPrice | null;
    }>;
  },

  async create(payload: CreateHubSpecialPricePayload): Promise<{
    special_price: HubSpecialPrice;
    auto_approved: boolean;
  }> {
    return apiRequest(base, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ special_price: HubSpecialPrice; auto_approved: boolean }>;
  },

  async patch(
    id: string,
    payload: {
      clinic_id: string;
      sale_amount?: number;
      cost_amount?: number | null;
      notes?: string | null;
      auto_track_catalog?: boolean;
      member_pet_ids?: string[];
      status?: 'active' | 'inactive';
      clear_catalog_review?: boolean;
    }
  ): Promise<{ special_price: HubSpecialPrice }> {
    return apiRequest(`${base}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ special_price: HubSpecialPrice }>;
  },

  async approve(id: string, clinicId: string): Promise<{ special_price: HubSpecialPrice }> {
    return apiRequest(`${base}/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId }),
    }) as Promise<{ special_price: HubSpecialPrice }>;
  },
};
