import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/service-groups';

export interface HubServiceGroupRow {
  id: string;
  clinic_id: string;
  name: string;
  slug: string;
  color: string;
  display_order: number;
  description?: string | null;
  /** Preenchido quando o grupo está arquivado (oculto em novos serviços). */
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  /** Só em GET list */
  service_count?: number;
  /** Funções principais (`job_title`) que podem realizar serviços deste grupo. */
  job_functions?: string[];
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

  async getJobMappings(clinicId: string): Promise<{ mappings: Record<string, string[]> }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${basePath}/job-mappings?${q.toString()}`) as Promise<{
      mappings: Record<string, string[]>;
    }>;
  },

  async create(payload: {
    clinic_id: string;
    name: string;
    slug?: string;
    color: string;
    display_order?: number;
    description?: string | null;
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
      description?: string | null;
      /** `true` arquiva; `false` restaura. */
      archived?: boolean;
    },
  ): Promise<{ service_group: HubServiceGroupRow }> {
    return apiRequest(`${basePath}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ service_group: HubServiceGroupRow }>;
  },

  async patchJobFunctions(
    id: string,
    payload: { clinic_id: string; job_titles: string[] },
  ): Promise<{ service_group: HubServiceGroupRow }> {
    return apiRequest(`${basePath}/${id}/job-functions`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }) as Promise<{ service_group: HubServiceGroupRow }>;
  },

  async remove(id: string, clinicId: string): Promise<void> {
    await apiRequest(deleteUrl(id, clinicId), { method: 'DELETE' });
  },
};
