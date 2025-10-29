import { apiRequest } from './api';

export interface Specialty {
  id: string;
  name: string;
  category: string;
  description?: string;
  created_at?: string;
}

export const specialtiesApi = {
  // Get all specialties
  getAll: async (): Promise<{ specialties: Specialty[] }> => {
    return apiRequest('/specialties');
  },

  // Get specialties by category
  getByCategory: async (category: string): Promise<{ specialties: Specialty[] }> => {
    return apiRequest(`/specialties?category=${category}`);
  },
};

