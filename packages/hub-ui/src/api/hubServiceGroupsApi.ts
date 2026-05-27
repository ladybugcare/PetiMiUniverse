import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/service-groups';

export interface HubServiceGroupRow {
  id: string;
  clinic_id: string;
  name: string;
  slug: string;
  color: string;
  display_order: number;
  /** Preenchido quando o grupo está arquivado (oculto em novos serviços). */
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  /** Só em GET list */
  service_count?: number;
}

function listUrl(clinicId: string, bustCache?: boolean): string {
  const q = new URLSearchParams({ clinic_id: clinicId });
  if (bustCache) q.set('_', String(Date.now()));
  return `${basePath}?${q.toString()}`;
}

function deleteUrl(id: string, clinicId: string): string {
  const q = new URLSearchParams({ clinic_id: clinicId });
  return `${basePath}/${id}?${q.toString()}`;
}

export const hubServiceGroupsApi = {
  /** `bustCache` evita resposta em cache do `apiRequest` (útil após editar grupos em Configurações). */
  async list(clinicId: string, bustCache = false): Promise<{ service_groups: HubServiceGroupRow[] }> {
    return apiRequest(listUrl(clinicId, bustCache)) as Promise<{ service_groups: HubServiceGroupRow[] }>;
  },

  async create(payload: {
    clinic_id: string;
    name: string;
    slug?: string;
    color: string;
    display_order?: number;
  }): Promise<{ service_group: HubServiceGroupRow }> {
    return apiRequest(basePath, {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ service_group: HubServiceGroupRow }>;
  },

  async patch(
    id: string,
    payload: {
      clinic_id: string;
      name?: string;
      color?: string;
      display_order?: number;
      /** `true` arquiva; `false` restaura. */
      archived?: boolean;
    }
  ): Promise<{ service_group: HubServiceGroupRow }> {
    return apiRequest(`${basePath}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ service_group: HubServiceGroupRow }>;
  },

  async remove(id: string, clinicId: string): Promise<void> {
    await apiRequest(deleteUrl(id, clinicId), { method: 'DELETE' });
  },
};
