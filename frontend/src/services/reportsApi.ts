import { apiRequest } from './api';

export type PeriodType = '7d' | '30d' | '90d' | 'custom';

export interface ReportsOverview {
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalDemandsCreated: number;
    demandsByStatus: {
      open: number;
      in_progress: number;
      closed: number;
      cancelled: number;
    };
    totalPositionsCreated: number;
    totalPositionsFilled: number;
    professionalsHired: number;
    averageFillTime: number; // days
  };
}

export interface DemandReport {
  id: string;
  title: string;
  status: string;
  created_at: string;
  demand_date: string;
  unit_id: string | null;
  unit_name: string | null;
  positions: Array<{
    id: string;
    specialty: string;
    total_slots: number;
    filled_slots: number;
    status: string;
  }>;
  fillTime?: number; // days
}

export interface ReportsDemands {
  period: {
    start: string;
    end: string;
  };
  demands: DemandReport[];
  byStatus: {
    open: number;
    in_progress: number;
    closed: number;
    cancelled: number;
  };
  bySpecialty: {
    [specialty: string]: {
      created: number;
      filled: number;
      successRate: number;
    };
  };
}

export interface HiredProfessional {
  vet_id: string;
  vet_name: string;
  vet_crmv: string | null;
  specialty: string;
  position_id: string;
  accepted_at: string;
  demand_id: string | null;
  demand_title: string;
  unit_id: string | null;
  unit_name: string | null;
}

export interface ReportsProfessionals {
  period: {
    start: string;
    end: string;
  };
  hired: HiredProfessional[];
  bySpecialty: {
    [specialty: string]: number;
  };
  averageHireTime: number; // days
}

export const reportsApi = {
  // Get clinic reports overview
  getOverview: async (
    clinicId: string,
    period: PeriodType = '30d',
    unitIds?: string[],
    startDate?: string,
    endDate?: string
  ): Promise<ReportsOverview> => {
    let url = `/statistics/clinic/${clinicId}/reports/overview?period=${period}`;
    
    if (period === 'custom' && startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    
    if (unitIds && unitIds.length > 0) {
      url += `&unit_ids=${unitIds.join(',')}`;
    }
    
    return apiRequest(url);
  },

  // Get clinic reports - demands details
  getDemands: async (
    clinicId: string,
    period: PeriodType = '30d',
    unitIds?: string[],
    startDate?: string,
    endDate?: string
  ): Promise<ReportsDemands> => {
    let url = `/statistics/clinic/${clinicId}/reports/demands?period=${period}`;
    
    if (period === 'custom' && startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    
    if (unitIds && unitIds.length > 0) {
      url += `&unit_ids=${unitIds.join(',')}`;
    }
    
    return apiRequest(url);
  },

  // Get clinic reports - professionals hired
  getProfessionals: async (
    clinicId: string,
    period: PeriodType = '30d',
    unitIds?: string[],
    startDate?: string,
    endDate?: string
  ): Promise<ReportsProfessionals> => {
    let url = `/statistics/clinic/${clinicId}/reports/professionals?period=${period}`;
    
    if (period === 'custom' && startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    
    if (unitIds && unitIds.length > 0) {
      url += `&unit_ids=${unitIds.join(',')}`;
    }
    
    return apiRequest(url);
  },
};

