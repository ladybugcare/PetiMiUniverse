import { apiRequest } from './api';

// Tipos
export interface Clinic {
  id: string;
  name: string;
  cnpj?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  email: string;
  status?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateClinicData {
  name: string;
  email: string;
  cnpj?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  password?: string;
  status?: 'active' | 'inactive';
  role?: 'CADMIN' | 'CMANAGER';
}

// Services
export const clinicsApi = {
  // Criar clínica (usado pelo módulo público)
  create: async (data: CreateClinicData): Promise<{ clinic: Clinic }> => {
    return apiRequest('/clinics/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Listar todas as clínicas (admin)
  getAll: async (): Promise<{ clinics: Clinic[] }> => {
    return apiRequest('/clinics');
  },

  // Buscar clínica por ID
  getById: async (id: string): Promise<{ clinic: Clinic }> => {
    return apiRequest(`/clinics/${id}`);
  },

  // Atualizar clínica (admin)
  update: async (id: string, data: Partial<Clinic>): Promise<{ clinic: Clinic }> => {
    return apiRequest(`/clinics/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Inativar clínica (admin)
  deactivate: async (id: string): Promise<{ success: boolean }> => {
    return apiRequest(`/clinics/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'inactive' }),
    });
  },

  // Excluir clínica (opcional - apenas se for implementado)
  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiRequest(`/clinics/${id}`, {
      method: 'DELETE',
    });
  },
};
