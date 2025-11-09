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
  totalFreelancers?: number;
  totalDemands: number;
  activeDemands: number;
  totalUsers: number;
  totalApplications: number;
  totalUnits: number;
}

export interface SystemStatsWithPeriod {
  totalClinics: number;
  totalVets: number;
  totalFreelancers: number;
  newClinics: number;
  newVets: number;
  newFreelancers: number;
  clinicsGrowth: number;
  vetsGrowth: number;
  freelancersGrowth: number;
  approvalRate: number;
  completedDemands: number;
  activeVets: number;
  period: {
    start: string;
    end: string;
  };
}

export interface GrowthTrend {
  date: string;
  clinics: number;
  vets: number;
  freelancers: number;
  demands: number;
}

export interface RecentActivity {
  id: string;
  type: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  timestamp: string;
}

export interface TopPerformer {
  id: string;
  name: string;
  crmv?: string;
  metric: number;
  status: string;
  created_at: string;
}

export interface SystemInsight {
  type: 'positive' | 'warning' | 'info';
  title: string;
  message: string;
  icon: string;
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

  // Get system statistics with period filter (admin only)
  getSystemStatsWithPeriod: async (
    period: 'today' | '7d' | '30d' | 'custom' = '30d',
    startDate?: string,
    endDate?: string
  ): Promise<{ stats: SystemStatsWithPeriod }> => {
    let url = `/statistics/system/period?period=${period}`;
    if (period === 'custom' && startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    return apiRequest(url);
  },

  // Get system growth trends for charts (admin only)
  getSystemGrowthTrends: async (period: '7d' | '30d' = '30d'): Promise<{ trends: GrowthTrend[] }> => {
    return apiRequest(`/statistics/system/growth-trends?period=${period}`);
  },

  // Get recent activity unified (admin only)
  getRecentActivity: async (limit: number = 20): Promise<{ activities: RecentActivity[] }> => {
    return apiRequest(`/statistics/system/recent-activity?limit=${limit}`);
  },

  // Get top performers (admin only)
  getTopPerformers: async (
    type: 'clinics' | 'vets' = 'clinics',
    limit: number = 5
  ): Promise<{ performers: TopPerformer[]; type: string }> => {
    return apiRequest(`/statistics/system/top-performers?type=${type}&limit=${limit}`);
  },

  // Get system insights (admin only)
  getSystemInsights: async (): Promise<{ insights: SystemInsight[] }> => {
    return apiRequest('/statistics/system/insights');
  },
};

