import { apiRequest } from './api';

// Tipos
export interface Demand {
  id: string;
  title: string;
  description: string;
  clinic_id: string;
  category: 'vet' | 'freelancer' | 'clinic' | 'other';
  required_specialties: string[];
  demand_date: string;
  start_time: string;
  duration_hours: number;
  status: 'open' | 'with_applicants' | 'partially_filled' | 'filled' | 'in_progress' | 'awaiting_report' | 'completed' | 'canceled_by_clinic' | 'canceled_by_system' | 'expired' | 'cancelled' | 'closed';
  payment?: number;
  vacancies?: number;
  filled_positions?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateDemandData {
  title: string;
  description: string;
  clinic_id: string;
  category: 'vet' | 'freelancer' | 'clinic' | 'other';
  required_specialties: string[];
  demand_date: string;
  start_time: string;
  duration_hours: number;
  status?: string;
  payment?: number;
}

export interface CreateDemandV2Data {
  clinic_id: string;
  unit_id?: string;
  category: 'vet' | 'freelancer' | 'clinic' | 'other';
  title: string;
  description: string;
  demand_date: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
  payment: number; // Payment geral (fallback)
  positions: Array<{
    slots: number;
    specialties: string[];
    payment?: number; // Payment específico da posição (opcional)
  }>;
}

// Services
export const demandsApi = {
  /**
   * @deprecated Use createV2 instead
   */
  // Criar demanda
  create: async (data: CreateDemandData): Promise<{ demand: Demand }> => {
    return apiRequest('/demands/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Criar demanda V2
  createV2: async (data: CreateDemandV2Data): Promise<{ demand: Demand; positions: any[] }> => {
    return apiRequest('/demands', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Listar demandas abertas
  getOpen: async (userRole?: string, userId?: string): Promise<{ demands: Demand[] }> => {
    let url = '/demands/open';
    const params = new URLSearchParams();
    
    if (userRole) {
      params.append('user_role', userRole);
    }
    if (userId) {
      params.append('user_id', userId);
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    return apiRequest(url);
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

  // Get recent activity for a clinic
  getRecentActivity: async (
    clinicId: string,
    unitId?: string,
    limit?: number
  ): Promise<{ demands: Demand[] }> => {
    let url = `/demands/recent-activity?clinic_id=${clinicId}`;
    if (unitId) {
      url += `&unit_id=${unitId}`;
    }
    if (limit) {
      url += `&limit=${limit}`;
    }
    return apiRequest(url);
  },

  // Get demands by unit
  getDemandsByUnit: async (unitId: string): Promise<{ demands: Demand[] }> => {
    return apiRequest(`/demands/unit/${unitId}`);
  },

  // Get all demands (admin) with filters
  getAll: async (filters?: { status?: string; clinic_id?: string }): Promise<{ demands: Demand[] }> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.clinic_id) params.append('clinic_id', filters.clinic_id);
    
    const queryString = params.toString();
    return apiRequest(`/demands/all${queryString ? `?${queryString}` : ''}`);
  },

  // Atualizar demanda
  update: async (id: string, data: Partial<Demand>): Promise<{ demand: Demand }> => {
    return apiRequest(`/demands/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Deletar demanda
  delete: async (id: string): Promise<{ message: string; demand: Demand }> => {
    return apiRequest(`/demands/${id}`, {
      method: 'DELETE',
    });
  },

  // Get applications for a demand
  getApplications: async (id: string): Promise<{ applications: any[] }> => {
    return apiRequest(`/demands/${id}/applications`);
  },
};