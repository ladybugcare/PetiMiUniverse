import { apiRequest } from './api';

// Tipos
export interface Application {
  id: string;
  demand_id: string;
  vet_id?: string;
  freelancer_id?: string;
  status: 'invited' | 'applied' | 'approved' | 'rejected' | 'rejected_by_vet' | 'check_in' | 'check_out' | 'report_sent' | 'report_approved' | 'canceled_by_vet';
  message?: string;
  applied_at?: string;
  invited_at?: string;
  invited_by?: string;
  position_id?: string;
  created_at?: string;
  updated_at?: string;
  vets?: {
    id: string;
    name: string;
    email: string;
    crmv?: string;
    specialties?: string[];
  } | null;
  freelancers?: {
    id: string;
    name: string;
    email: string;
    document_number?: string;
  } | null;
}

// Nova interface para demand_applications (unificada)
export interface DemandApplication extends Application {
  approved_at?: string;
  rejected_at?: string;
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

  // Buscar candidaturas por veterinário ou freelancer
  getByVet: async (vetId: string): Promise<{ applications: Application[] }> => {
    return apiRequest(`/applications/user/${vetId}`);
  },
  
  // Alias para compatibilidade - usa a mesma rota genérica
  getByUser: async (userId: string): Promise<{ applications: Application[] }> => {
    return apiRequest(`/applications/user/${userId}`);
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

  // Check conflicts for an application
  checkConflicts: async (applicationId: string): Promise<{ conflicts: any[] }> => {
    return apiRequest(`/applications/${applicationId}/conflicts`);
  },

  // Validate conflict before applying
  validateConflict: async (demandId: string, vetId: string): Promise<{ hasConflict: boolean; conflicts: any[] }> => {
    return apiRequest('/applications/validate-conflict', {
      method: 'POST',
      body: JSON.stringify({ demand_id: demandId, vet_id: vetId }),
    });
  },
};