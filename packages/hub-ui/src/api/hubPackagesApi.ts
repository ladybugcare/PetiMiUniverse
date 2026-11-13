import { apiRequest } from '@petimi/web-core';
import type { HubQuotePricingVariant } from './hubQuotesApi';

const base = '/api/hub/finance/packages';

export type HubPackageItemInput = {
  hub_service_type_id: string;
  quantity: number;
  sort_order?: number;
  pricing_variant?: HubQuotePricingVariant | null;
};

export type HubPackageItem = HubPackageItemInput & {
  id?: string;
  service_name?: string | null;
  is_addon?: boolean;
};

export type HubPackage = {
  id: string;
  clinic_id: string;
  name: string;
  package_kind: 'single' | 'combo';
  pricing_mode: 'manual' | 'catalog_sum';
  price: number;
  catalog_subtotal: number | null;
  discount_amount: number;
  discount_percent: number | null;
  validity_days: number | null;
  sessions_total: number;
  active: boolean;
  description: string | null;
  notes: string | null;
  items: HubPackageItem[];
};

export type HubPackageBalance = {
  id: string;
  clinic_id: string;
  guardian_id: string;
  pet_id: string | null;
  package_id: string;
  hub_service_type_id: string;
  sessions_remaining: number;
  sessions_total: number | null;
  sessions_remaining_at_cancel?: number | null;
  expires_at: string | null;
  purchased_at: string | null;
  purchase_group_id: string | null;
  status?: string;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  hub_packages?: { id: string; name: string } | { id: string; name: string }[] | null;
};

export const hubPackagesApi = {
  async list(clinicId: string, includeInactive = false): Promise<{ packages: HubPackage[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (includeInactive) q.set('include_inactive', 'true');
    return apiRequest(`${base}?${q}`) as Promise<{ packages: HubPackage[] }>;
  },

  async get(clinicId: string, packageId: string): Promise<{ package: HubPackage }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${base}/${encodeURIComponent(packageId)}?${q}`) as Promise<{ package: HubPackage }>;
  },

  async suggestPrice(body: {
    clinic_id: string;
    items: HubPackageItemInput[];
    discount_amount?: number;
    discount_percent?: number | null;
  }): Promise<{
    catalog_subtotal: number;
    suggested_price: number;
    lines: Array<{
      hub_service_type_id: string;
      quantity: number;
      unit_reference_sale: number;
      line_total: number;
      service_name: string;
      is_addon: boolean;
      pricing_variant: HubQuotePricingVariant | null;
    }>;
  }> {
    return apiRequest(`${base}/suggest-price`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async create(payload: {
    clinic_id: string;
    name: string;
    items: HubPackageItemInput[];
    pricing_mode?: 'manual' | 'catalog_sum';
    price?: number;
    discount_amount?: number;
    discount_percent?: number | null;
    validity_days?: number | null;
    description?: string | null;
    notes?: string | null;
  }): Promise<{ package: HubPackage }> {
    return apiRequest(base, { method: 'POST', body: JSON.stringify(payload) }) as Promise<{ package: HubPackage }>;
  },

  async update(
    packageId: string,
    payload: {
      clinic_id: string;
      name?: string;
      items?: HubPackageItemInput[];
      pricing_mode?: 'manual' | 'catalog_sum';
      price?: number;
      discount_amount?: number;
      discount_percent?: number | null;
      validity_days?: number | null;
      description?: string | null;
      notes?: string | null;
      active?: boolean;
    }
  ): Promise<{ package: HubPackage }> {
    return apiRequest(`${base}/${encodeURIComponent(packageId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ package: HubPackage }>;
  },

  async listPetBalances(
    clinicId: string,
    petId: string,
    opts?: { includeCancelled?: boolean },
  ): Promise<{ balances: HubPackageBalance[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.includeCancelled) q.set('include_cancelled', '1');
    return apiRequest(`/api/hub/pets/${encodeURIComponent(petId)}/package-balances?${q}`) as Promise<{
      balances: HubPackageBalance[];
    }>;
  },

  async listGuardianBalances(clinicId: string, guardianId: string): Promise<{ balances: HubPackageBalance[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`/api/hub/guardians/${encodeURIComponent(guardianId)}/package-balances?${q}`) as Promise<{
      balances: HubPackageBalance[];
    }>;
  },

  async cancelBalance(
    balanceId: string,
    body: { clinic_id: string; reason: string },
  ): Promise<{ balance: Record<string, unknown> }> {
    return apiRequest(`/api/hub/finance/package-balances/${encodeURIComponent(balanceId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{ balance: Record<string, unknown> }>;
  },

  async refundPreview(
    balanceId: string,
    clinicId: string,
  ): Promise<{
    preview: {
      balance_id: string;
      status: string;
      sessions_total: number;
      sessions_consumed: number;
      sessions_remaining: number;
      sessions_remaining_at_cancel: number | null;
      paid_total: number;
      suggested_refund: number;
      purchased_receivable_id: string | null;
    };
  }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(
      `/api/hub/finance/package-balances/${encodeURIComponent(balanceId)}/refund-preview?${q}`,
    ) as Promise<{
      preview: {
        balance_id: string;
        status: string;
        sessions_total: number;
        sessions_consumed: number;
        sessions_remaining: number;
        sessions_remaining_at_cancel: number | null;
        paid_total: number;
        suggested_refund: number;
        purchased_receivable_id: string | null;
      };
    }>;
  },

  async authorizeRefund(
    balanceId: string,
    body: {
      clinic_id: string;
      refund_amount: number;
      reason: string;
      refund_method?: string | null;
      refund_effective_date?: string | null;
    },
  ): Promise<{
    preview: Record<string, unknown>;
    adjustment: Record<string, unknown>;
    receivable_status: string | null;
  }> {
    return apiRequest(`/api/hub/finance/package-balances/${encodeURIComponent(balanceId)}/refund`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{
      preview: Record<string, unknown>;
      adjustment: Record<string, unknown>;
      receivable_status: string | null;
    }>;
  },
};
