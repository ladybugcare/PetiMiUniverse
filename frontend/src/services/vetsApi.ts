import { apiRequest } from './api';

export interface Vet {
  id: string;
  name: string;
  email: string;
  crmv: string; // obrigatório pra simplificar compatibilidade
  phone?: string;
  specialties?: string[];
  certificates?: string[];
  experience?: string;
  photo_url?: string;
  status?: 'active' | 'inactive' | 'pending' | string;
  created_at?: string;
  updated_at?: string;
}

export const vetsApi = {
  getAll: async (): Promise<{ vets: Vet[] }> => apiRequest('/vets'),

  getById: async (id: string): Promise<{ vet: Vet }> =>
    apiRequest(`/vets/${id}`),

  create: async (data: any): Promise<{ vet: Vet }> =>
    apiRequest('/vets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: async (id: string, data: any): Promise<{ vet: Vet }> =>
    apiRequest(`/vets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: async (id: string): Promise<{ success: boolean }> =>
    apiRequest(`/vets/${id}`, { method: 'DELETE' }),

  uploadPhoto: async (id: string, photo_url: string): Promise<{ vet: Vet }> =>
    apiRequest(`/vets/${id}/photo`, {
      method: 'PATCH',
      body: JSON.stringify({ photo_url }),
    }),
};
