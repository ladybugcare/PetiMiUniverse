import { apiRequest } from './api';

export interface Specialty {
  id: string;
  name: string;
  category: string;
  description?: string;
  created_at?: string;
}

export interface CreateSpecialtyData {
  name: string;
  category: 'vet' | 'freelancer' | 'clinic' | 'other';
  description?: string;
}

export interface UpdateSpecialtyData {
  name?: string;
  category?: 'vet' | 'freelancer' | 'clinic' | 'other';
  description?: string;
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

  // Create specialty (admin only)
  create: async (data: CreateSpecialtyData): Promise<{ specialty: Specialty }> => {
    return apiRequest('/specialties', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update specialty (admin only)
  update: async (id: string, data: UpdateSpecialtyData): Promise<{ specialty: Specialty }> => {
    return apiRequest(`/specialties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete specialty (admin only)
  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiRequest(`/specialties/${id}`, {
      method: 'DELETE',
    });
  },
};

