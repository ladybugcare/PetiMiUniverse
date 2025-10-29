import { apiRequest } from './api';

// Tipos
export interface Application {
  id: string;
  demand_id: string;
  vet_id: string;
  status: 'applied' | 'accepted' | 'rejected';
  message?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateApplicationData {
  demand_id: string;
  vet_id: string;
  message?: string;
}

// Services
export const applicationsApi = {
  // Candidatar-se a uma demanda
  apply: async (data: CreateApplicationData): Promise<{ application: Application }> => {
    return apiRequest('/applications/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Buscar candidaturas por demanda
  getByDemand: async (demandId: string): Promise<{ applications: Application[] }> => {
    return apiRequest(`/applications/demand/${demandId}`);
  },

  // Buscar candidaturas por veterinário
  getByVet: async (vetId: string): Promise<{ applications: Application[] }> => {
    return apiRequest(`/applications/vet/${vetId}`);
  },

  // Atualizar status da candidatura
  updateStatus: async (id: string, status: string): Promise<{ application: Application }> => {
    return apiRequest(`/applications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Get applications by clinic
  getByClinic: async (clinicId: string): Promise<{ applications: Application[] }> => {
    return apiRequest(`/applications/clinic?clinic_id=${clinicId}`);
  },

  // Get applications by unit
  getByUnit: async (unitId: string): Promise<{ applications: Application[] }> => {
    return apiRequest(`/applications/unit/${unitId}`);
  },

  // Get pending applications count
  getPendingCount: async (clinicId: string, unitId?: string): Promise<{ count: number }> => {
    let url = `/applications/pending-count?clinic_id=${clinicId}`;
    if (unitId) {
      url += `&unit_id=${unitId}`;
    }
    return apiRequest(url);
  },
};