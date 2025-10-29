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
  status: 'open' | 'in_progress' | 'closed' | 'cancelled';
  payment?: number;
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