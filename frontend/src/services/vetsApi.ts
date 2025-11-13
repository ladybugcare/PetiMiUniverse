import { apiRequest } from './api';

export interface Vet {
  id: string;
  name: string;
  email: string;
  crmv: string; // obrigatório pra simplificar compatibilidade
  document_type?: 'CPF' | 'CNPJ';
  document_number?: string;
  address?: string;
  phone?: string;
  bio?: string;
  specialties?: string[];
  certificates?: string[];
  experience?: string;
  photo_url?: string;
  status?: 'active' | 'inactive' | 'pending' | string;
  created_at?: string;
  updated_at?: string;
}

export interface CompletedDemand {
  id: string;
  clinicName: string;
  title: string;
  specialty?: string;
  completedAt: string;
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

  getCompletedDemands: async (id: string, clinicId?: string): Promise<{ completedDemands: CompletedDemand[] }> => {
    let url = `/vets/${id}/completed-demands`;
    if (clinicId) {
      url += `?clinic_id=${clinicId}`;
    }
    return apiRequest(url);
  },

  approve: async (id: string): Promise<{ success: boolean; message: string }> =>
    apiRequest(`/vets/${id}/approve`, {
      method: 'POST',
    }),

  reject: async (id: string, reason: string): Promise<{ success: boolean; message: string }> =>
    apiRequest(`/vets/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejection_reason: reason }),
    }),
};
