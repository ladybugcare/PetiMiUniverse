import { apiRequest } from './api';

// Tipos
export interface Clinic {
  id: string;
  name: string;
  cnpj: string;
  address: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface CreateClinicData {
  name: string;
  cnpj: string;
  address: string;
  email: string;
  password: string;
}

// Services
export const clinicsApi = {
  // Criar clínica
  create: async (data: CreateClinicData): Promise<{ clinic: Clinic }> => {
    return apiRequest('/clinics/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Listar clínicas
  getAll: async (): Promise<{ clinics: Clinic[] }> => {
    return apiRequest('/clinics');
  },

  // Buscar clínica por ID
  getById: async (id: string): Promise<{ clinic: Clinic }> => {
    return apiRequest(`/clinics/${id}`);
  },
};