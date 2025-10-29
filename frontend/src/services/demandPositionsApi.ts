import { apiRequest } from './api';

// Tipos
export interface DemandPosition {
  id: string;
  master_demand_id: string;
  specialty: string; // Legacy field for backward compatibility
  specialties?: string[]; // New field for multiple specialties
  total_slots: number;
  filled_slots: number;
  individual_payment: number;
  status: 'open' | 'filled' | 'cancelled';
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface PositionApplication {
  id: string;
  position_id: string;
  vet_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled_by_vet' | 'inactive_accepted_other_position' | 'inactive_time_conflict';
  message?: string;
  accepted_at?: string;
  inactive_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface PositionWithAvailability extends DemandPosition {
  title: string;
  demand_description?: string;
  clinic_id: string;
  unit_id?: string;
  demand_date: string;
  start_time: string;
  end_time: string;
  category: string;
  available_slots: number;
  progress: string;
  application_status?: string | null;
}

export interface CreatePositionData {
  specialty?: string; // Legacy field for backward compatibility
  specialties: string[]; // New field for multiple specialties
  slots: number;
  payment: number;
  description?: string;
}

export interface CreateCompositeDemandData {
  title: string;
  description: string;
  clinic_id: string;
  unit_id?: string;
  demand_date: string;
  start_time: string;
  end_time: string;
  category: 'vet' | 'freelancer' | 'clinic' | 'other';
  positions: CreatePositionData[];
}

// API Service
export const demandPositionsApi = {
  // Criar demanda composta com posições
  createCompositeDemand: async (
    data: CreateCompositeDemandData
  ): Promise<{ demand: any; positions: DemandPosition[] }> => {
    return apiRequest('/demand-positions/composite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Listar posições disponíveis
  getAvailablePositions: async (filters?: {
    vet_id?: string;
    specialty?: string;
  }): Promise<{ positions: PositionWithAvailability[] }> => {
    const params = new URLSearchParams();
    if (filters?.vet_id) params.append('vet_id', filters.vet_id);
    if (filters?.specialty) params.append('specialty', filters.specialty);

    const queryString = params.toString();
    return apiRequest(`/demand-positions/available${queryString ? `?${queryString}` : ''}`);
  },

  // Candidatar-se a uma posição
  applyToPosition: async (data: {
    position_id: string;
    vet_id: string;
    message?: string;
  }): Promise<{ application: PositionApplication }> => {
    return apiRequest('/demand-positions/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Aceitar candidato
  acceptApplication: async (applicationId: string): Promise<{ application: PositionApplication }> => {
    return apiRequest(`/demand-positions/applications/${applicationId}/accept`, {
      method: 'PATCH',
    });
  },

  // Rejeitar candidato
  rejectApplication: async (
    applicationId: string,
    reason?: string
  ): Promise<{ application: PositionApplication }> => {
    return apiRequest(`/demand-positions/applications/${applicationId}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
  },

  // Obter candidaturas de uma posição
  getPositionApplications: async (
    positionId: string
  ): Promise<{ applications: (PositionApplication & { vets?: any })[] }> => {
    return apiRequest(`/demand-positions/positions/${positionId}/applications`);
  },

  // Obter demanda com suas posições
  getDemandWithPositions: async (
    demandId: string
  ): Promise<{ demand: any; positions: DemandPosition[] }> => {
    return apiRequest(`/demand-positions/demands/${demandId}/positions`);
  },

  // Obter candidaturas do veterinário
  getVetApplications: async (
    vetId: string,
    status?: string
  ): Promise<{ applications: any[] }> => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);

    const queryString = params.toString();
    return apiRequest(
      `/demand-positions/vets/${vetId}/applications${queryString ? `?${queryString}` : ''}`
    );
  },

  // Cancelar candidatura
  cancelApplication: async (applicationId: string): Promise<{ application: PositionApplication }> => {
    return apiRequest(`/demand-positions/applications/${applicationId}/cancel`, {
      method: 'PATCH',
    });
  },
};

