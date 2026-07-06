import { apiRequest } from '@petimi/web-core';

export type HubSpecialty = {
  id: string;
  name: string;
  category?: string;
  role?: string;
  description?: string;
};

export const hubSpecialtiesApi = {
  list: async (category?: string): Promise<{ specialties: HubSpecialty[] }> => {
    const q = category ? `?category=${encodeURIComponent(category)}` : '';
    return apiRequest(`/specialties${q}`) as Promise<{ specialties: HubSpecialty[] }>;
  },
};
