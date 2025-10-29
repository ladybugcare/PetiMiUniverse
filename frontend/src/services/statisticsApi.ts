import { apiRequest } from './api';

// Types
export interface ClinicStats {
  totalDemands: number;
  openDemands: number;
  totalApplications: number;
  pendingApplications: number;
  totalUsers: number;
}

export interface VetStats {
  totalApplications: number;
  activeJobs: number;
  pendingApplications: number;
  availableOpportunities: number;
  completedJobs: number;
  averageRating: number;
}

export interface SystemStats {
  totalClinics: number;
  totalVets: number;
  totalDemands: number;
  activeDemands: number;
  totalUsers: number;
  totalApplications: number;
  totalUnits: number;
}

// Services
export const statisticsApi = {
  // Get clinic statistics
  getClinicStats: async (clinicId: string, unitId?: string): Promise<{ stats: ClinicStats }> => {
    let url = `/statistics/clinic/${clinicId}`;
    if (unitId) {
      url += `?unit_id=${unitId}`;
    }
    return apiRequest(url);
  },

  // Get vet statistics
  getVetStats: async (vetId: string): Promise<{ stats: VetStats }> => {
    return apiRequest(`/statistics/vet/${vetId}`);
  },

  // Get system-wide statistics (admin only)
  getSystemStats: async (): Promise<{ stats: SystemStats }> => {
    return apiRequest('/statistics/system');
  },
};

