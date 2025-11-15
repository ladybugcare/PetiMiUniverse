import { apiRequest } from './api';

export type PeriodType = '7d' | '30d' | '90d' | 'custom';

export interface AdminOverview {
  period: {
    start: string;
    end: string;
  };
  activity: {
    activeClinics: number;
    inactiveClinics: number;
    newClinics: number;
    newUnits: number;
    newVets: number;
    totalNewRegistrations: number;
    openDemands: number;
    closedDemands: number;
    demandsByStatus?: {
      open: number;
      in_progress: number;
      closed: number;
      cancelled: number;
    };
  };
  performance: {
    averageApprovalRate: number;
    growthRate: number;
    topSpecialties: Array<{ specialty: string; count: number }>;
    averageDemandsPerSpecialty: number;
  };
}

export interface AdminSpecialties {
  period: { start: string; end: string };
  topSpecialties: Array<{ specialty: string; count: number; percentage: number }>;
  distribution: { [specialty: string]: number };
}

export interface AdminUsage {
  period: { start: string; end: string };
  activeUsers: number;
  rejectionRate: number;
  cancellationRate: number;
  uniqueLogins: number;
}

export const adminReportsApi = {
  // Get admin overview
  getOverview: async (
    period: PeriodType = '30d',
    startDate?: string,
    endDate?: string
  ): Promise<AdminOverview> => {
    let url = `/admin/reports/overview?period=${period}`;
    
    if (period === 'custom' && startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    
    return apiRequest(url);
  },

  // Get admin specialties
  getSpecialties: async (
    period: PeriodType = '30d',
    startDate?: string,
    endDate?: string
  ): Promise<AdminSpecialties> => {
    let url = `/admin/reports/specialties?period=${period}`;
    
    if (period === 'custom' && startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    
    return apiRequest(url);
  },

  // Get admin usage
  getUsage: async (
    period: PeriodType = '30d',
    startDate?: string,
    endDate?: string
  ): Promise<AdminUsage> => {
    let url = `/admin/reports/usage?period=${period}`;
    
    if (period === 'custom' && startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    
    return apiRequest(url);
  },
};

