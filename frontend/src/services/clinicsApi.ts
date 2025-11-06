import { apiRequest } from './api';

// Tipos
export interface Clinic {
  id: string;
  name: string;
  cnpj: string;
  address: string;
  email: string;
  photo_url?: string;
  description?: string;
  status?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
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
  create: async (data: CreateClinicData): Promise<{ 
    clinic: Clinic; 
    user?: any; 
    session?: any;
  }> => {
    return apiRequest('/clinics', {
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

  // Atualizar clínica
  update: async (id: string, data: Partial<Clinic>): Promise<{ clinic: Clinic }> => {
    return apiRequest(`/clinics/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Atualizar foto de perfil
  uploadPhoto: async (id: string, photo_url: string): Promise<{ clinic: Clinic }> => {
    return apiRequest(`/clinics/${id}/photo`, {
      method: 'PATCH',
      body: JSON.stringify({ photo_url }),
    });
  },

  // Inativar clínica
  deactivate: async (id: string): Promise<{ message: string; clinic: Clinic }> => {
    return apiRequest(`/clinics/${id}`, {
      method: 'DELETE',
    });
  },

  // Registrar clínica com primeira unidade (unified endpoint)
  registerWithUnit: async (payload: {
    clinic: { name: string; cnpj?: string; description?: string } | null;
    unit: {
      clinic_id: string;
      name: string;
      nickname: string;
      cnpj?: string;
      address: string;
      city: string;
      state: string;
      phone?: string;
      technical_manager?: string;
    };
  }): Promise<{ clinic: Clinic | null; unit: any; message: string }> => {
    return apiRequest('/clinics/register-with-unit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
