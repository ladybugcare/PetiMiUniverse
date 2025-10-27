import { apiRequest } from './api';

// Tipos
export interface Vet {
  id: string;
  name: string;
  crmv: string;
  specialties: string[];
  certificates: string[];
  experience: string;
  email: string;
  clinic_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateVetData {
  name: string;
  crmv: string;
  specialties: string[];
  certificates?: string[];
  experience: string;
  email: string;
  password: string;
  clinic_id?: string;
}

// Services
export const vetsApi = {
  // Criar veterinário
  create: async (data: CreateVetData): Promise<{ vet: Vet }> => {
    return apiRequest('/vets/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Listar veterinários
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
};