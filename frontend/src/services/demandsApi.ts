import { apiRequest } from './api';

// Tipos
export interface Demand {
  id: string;
  title: string;
  description: string;
  clinic_id: string;
  status: 'open' | 'in_progress' | 'closed' | 'cancelled';
  payment?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateDemandData {
  title: string;
  description: string;
  clinic_id: string;
  status?: string;
  payment?: number;
}

// Services
export const demandsApi = {
  // Criar demanda
  create: async (data: CreateDemandData): Promise<{ demand: Demand }> => {
    return apiRequest('/demands/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Listar demandas abertas
  getOpen: async (): Promise<{ demands: Demand[] }> => {
    return apiRequest('/demands/open');
  },

  // Buscar demanda por ID
  getById: async (id: string): Promise<{ demand: Demand }> => {
    return apiRequest(`/demands/${id}`);
  },

  // Buscar demandas por clínica
  getByClinic: async (clinicId: string): Promise<{ demands: Demand[] }> => {
    return apiRequest(`/demands/clinic/${clinicId}`);
  },

  // Atualizar status da demanda
  updateStatus: async (id: string, status: string): Promise<{ demand: Demand }> => {
    return apiRequest(`/demands/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
};