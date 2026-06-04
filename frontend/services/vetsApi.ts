import { apiRequest } from './api';

// Tipos
export interface Vet {
  id: string;
  name: string;
  email: string;
  crmv?: string;
  phone?: string;
  city?: string;
  state?: string;
  specialties?: string[];
  certificates?: string[];
  experience?: string;
  status?: string;
  clinic_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateVetData {
  name: string;
  email: string;
  crmv?: string;
  phone?: string;
  city?: string;
  state?: string;
  specialties?: string[];
  certificates?: string[];
  experience?: string;
  password?: string;
  clinic_id?: string;
  status?: 'active' | 'inactive';
}

// Services
export const vetsApi = {
  // Criar veterinário (usado pelo módulo público)
  create: async (data: CreateVetData): Promise<{ vet: Vet }> => {
    return apiRequest('/vets/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Listar todos (admin)
  getAll: async (): Promise<{ vets: Vet[] }> => {
    return apiRequest('/vets');
  },

  // Buscar veterinário por ID
  getById: async (id: string): Promise<{ vet: Vet }> => {
    return apiRequest(`/vets/${id}`);
  },

  // Buscar veterinários por clínica
  getByClinic: async (clinicId: string): Promise<{ vets: Vet[] }> => {
    return apiRequest(`/vets/clinic/${clinicId}`);
  },

  // Atualizar veterinário
  update: async (id: string, data: Partial<Vet>): Promise<{ vet: Vet }> => {
    return apiRequest(`/vets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Excluir veterinário
  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiRequest(`/vets/${id}`, {
      method: 'DELETE',
    });
  },
};
