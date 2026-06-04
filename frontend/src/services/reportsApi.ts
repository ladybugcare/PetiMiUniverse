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
    totalApplicationsReceived: number;
    conversionRate: number; // percentage
    averageResponseTime: number; // hours
    cancellationRate: number; // percentage
    mostDemandedSpecialties: Array<{
      specialty: string;
      count: number;
    }>;
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

export interface Trend {
  value: number; // percentual de mudança
  isPositive: boolean; // true se aumento é positivo para essa métrica
}

export interface ReportsOverviewWithComparison {
  current: ReportsOverview;
  previous: ReportsOverview | null;
  trends: {
    [key: string]: Trend | null;
  };
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

  // Get clinic reports overview with comparison to previous period
  getOverviewWithComparison: async (
    clinicId: string,
    period: PeriodType = '30d',
    unitIds?: string[],
    startDate?: string,
    endDate?: string
  ): Promise<ReportsOverviewWithComparison> => {
    // Calculate previous period dates
    const calculatePreviousPeriod = (
      period: PeriodType,
      startDate?: string,
      endDate?: string
    ): { prevStartDate: string; prevEndDate: string } | null => {
      if (period === 'custom' && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const duration = end.getTime() - start.getTime();
        const prevEnd = new Date(start);
        prevEnd.setTime(prevEnd.getTime() - 1); // 1ms before current start
        const prevStart = new Date(prevEnd);
        prevStart.setTime(prevStart.getTime() - duration);
        return {
          prevStartDate: prevStart.toISOString().split('T')[0],
          prevEndDate: prevEnd.toISOString().split('T')[0],
        };
      } else {
        // For fixed periods, we need to fetch current period first to get the actual end date
        // This will be handled by making the current call first, then calculating previous
        // For now, calculate based on today
        const now = new Date();
        let prevEnd: Date;
        let prevStart: Date;
        let daysBack: number;

        switch (period) {
          case '7d':
            daysBack = 7;
            break;
          case '30d':
            daysBack = 30;
            break;
          case '90d':
            daysBack = 90;
            break;
          default:
            return null;
        }

        // Calculate previous period: end is 1 day before current period would start
        // For fixed periods, we assume current period ends today
        prevEnd = new Date(now);
        prevEnd.setDate(prevEnd.getDate() - 1);
        prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - daysBack + 1); // +1 to include the end day

        return {
          prevStartDate: prevStart.toISOString().split('T')[0],
          prevEndDate: prevEnd.toISOString().split('T')[0],
        };
      }
    };

    const previousPeriod = calculatePreviousPeriod(period, startDate, endDate);

    // Fetch current and previous period data in parallel
    const [currentData, previousData] = await Promise.all([
      reportsApi.getOverview(clinicId, period, unitIds, startDate, endDate),
      previousPeriod
        ? reportsApi.getOverview(
            clinicId,
            'custom',
            unitIds,
            previousPeriod.prevStartDate,
            previousPeriod.prevEndDate
          ).catch(() => null) // If previous period fails, return null
        : Promise.resolve(null),
    ]);

    // Calculate trends
    const trends: { [key: string]: Trend | null } = {};

    if (previousData) {
      const calculateTrend = (
        current: number,
        previous: number,
        isPositiveIncrease: boolean
      ): Trend | null => {
        if (previous === 0) {
          // If previous is 0, can't calculate percentage change
          return current > 0 ? { value: 100, isPositive: isPositiveIncrease } : null;
        }

        const change = ((current - previous) / previous) * 100;
        const isPositive = isPositiveIncrease ? change > 0 : change < 0;

        return {
          value: change,
          isPositive,
        };
      };

      const currentSummary = currentData.summary;
      const previousSummary = previousData.summary;

      trends.totalDemandsCreated = calculateTrend(
        currentSummary.totalDemandsCreated,
        previousSummary.totalDemandsCreated,
        true
      );
      trends.totalApplicationsReceived = calculateTrend(
        currentSummary.totalApplicationsReceived,
        previousSummary.totalApplicationsReceived,
        true
      );
      trends.totalPositionsFilled = calculateTrend(
        currentSummary.totalPositionsFilled,
        previousSummary.totalPositionsFilled,
        true
      );
      trends.professionalsHired = calculateTrend(
        currentSummary.professionalsHired,
        previousSummary.professionalsHired,
        true
      );
      trends.conversionRate = calculateTrend(
        currentSummary.conversionRate,
        previousSummary.conversionRate,
        true
      );
      trends.averageResponseTime = calculateTrend(
        currentSummary.averageResponseTime,
        previousSummary.averageResponseTime,
        false // Lower is better
      );
      trends.averageFillTime = calculateTrend(
        currentSummary.averageFillTime,
        previousSummary.averageFillTime,
        false // Lower is better
      );
      trends.cancellationRate = calculateTrend(
        currentSummary.cancellationRate,
        previousSummary.cancellationRate,
        false // Lower is better
      );
    }

    return {
      current: currentData,
      previous: previousData,
      trends,
    };
  },
};

