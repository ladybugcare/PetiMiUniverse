import { apiRequest } from '@petimi/web-core';

const basePath = '/api/hub/service-groups/checklists';

export type ChecklistTemplateItem = {
  key: string;
  label: string;
  default_checked?: boolean;
};

export type ServiceGroupChecklistRow = {
  slug: string;
  name: string;
  color: string;
  items: ChecklistTemplateItem[];
  is_custom: boolean;
  has_system_default: boolean;
};

export const hubServiceGroupChecklistApi = {
  async list(clinicId: string): Promise<{ groups: ServiceGroupChecklistRow[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${basePath}?${q.toString()}`) as Promise<{ groups: ServiceGroupChecklistRow[] }>;
  },

  async get(clinicId: string, slug: string): Promise<{ group: ServiceGroupChecklistRow }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${basePath}/${encodeURIComponent(slug)}?${q.toString()}`) as Promise<{
      group: ServiceGroupChecklistRow;
    }>;
  },

  async put(
    clinicId: string,
    slug: string,
    items: Array<{ key?: string; label: string; default_checked?: boolean }>,
  ): Promise<{ group: ServiceGroupChecklistRow }> {
    return apiRequest(`${basePath}/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      body: JSON.stringify({ clinic_id: clinicId, items }),
    }) as Promise<{ group: ServiceGroupChecklistRow }>;
  },

  async deleteOverride(clinicId: string, slug: string): Promise<{ group: ServiceGroupChecklistRow }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${basePath}/${encodeURIComponent(slug)}?${q.toString()}`, {
      method: 'DELETE',
    }) as Promise<{ group: ServiceGroupChecklistRow }>;
  },
};
