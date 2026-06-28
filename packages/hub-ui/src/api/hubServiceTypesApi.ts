import { apiRequest } from '@petimi/web-core';
import type { HubServicePricingMatrix } from '../utils/hubServiceTypesPricingMatrix';

const basePath = '/api/hub/service-types';

export interface HubServiceType {
  id: string;
  clinic_id: string;
  code: string;
  name: string;
  service_group: string;
  /** Presente após migration `alter_hub_service_types_pricing.sql`. */
  cost_amount?: number;
  sale_amount?: number;
  /** Matriz opcional (`alter_hub_service_types_pricing_matrix.sql`). */
  pricing_matrix?: HubServicePricingMatrix | null;
  default_duration_minutes: number | null;
  active: boolean;
  allow_scheduling?: boolean;
  agenda_color: string | null;
  /** Cor definida em Configurações → Grupos (`hub_service_groups`), quando existir linha com o mesmo slug. */
  group_color?: string | null;
  description: string | null;
  internal_notes: string | null;
  code_locked?: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  is_addon?: boolean;
}

export type HubServiceGroup = HubServiceType['service_group'];

function listUrl(
  clinicId: string,
  bustCache: boolean,
  includeArchived: boolean,
  addonsOnly?: boolean
): string {
  const q = new URLSearchParams({ clinic_id: clinicId });
  if (bustCache) q.set('_', String(Date.now()));
  if (includeArchived) q.set('include_archived', 'true');
  if (addonsOnly) q.set('addons_only', 'true');
  return `${basePath}?${q.toString()}`;
}

export const hubServiceTypesApi = {
  async list(
    clinicId: string,
    bustCache = false,
    includeArchived = false,
    addonsOnly = false
  ): Promise<{ service_types: HubServiceType[] }> {
    return apiRequest(listUrl(clinicId, bustCache, includeArchived, addonsOnly)) as Promise<{
      service_types: HubServiceType[];
    }>;
  },

  async create(payload: {
    clinic_id: string;
    name: string;
    service_group: string;
    cost_amount: number;
    sale_amount: number;
    default_duration_minutes?: number | null;
    description?: string | null;
    allow_scheduling?: boolean;
    internal_notes?: string | null;
    code?: string;
    pricing_matrix?: HubServicePricingMatrix | null;
    is_addon?: boolean;
  }): Promise<{ service_type: HubServiceType }> {
    return apiRequest(basePath, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ service_type: HubServiceType }>;
  },

  async update(
    id: string,
    payload: {
      clinic_id: string;
      name?: string;
      service_group?: string;
      cost_amount?: number;
      sale_amount?: number;
      default_duration_minutes?: number | null;
      description?: string | null;
      allow_scheduling?: boolean;
      internal_notes?: string | null;
      code_locked?: boolean;
      active?: boolean;
      archived?: boolean;
      pricing_matrix?: HubServicePricingMatrix | null;
      is_addon?: boolean;
    }
  ): Promise<{ service_type: HubServiceType }> {
    return apiRequest(`${basePath}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ service_type: HubServiceType }>;
  },
};
