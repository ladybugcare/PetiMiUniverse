import { useState, useEffect } from 'react';
import { statisticsApi, RecentActivity, SystemInsight, TopPerformer, GrowthTrend } from '../services/statisticsApi';
import { PeriodType } from '../components/admin/PeriodFilter';

interface PeriodStats {
  newClinics: number;
  newVets: number;
  newFreelancers: number;
  clinicsGrowth: number;
  vetsGrowth: number;
  freelancersGrowth: number;
  approvalRate: number;
  completedDemands: number;
  activeVets: number;
}

interface DashboardData {
  periodStats: PeriodStats | null;
  recentActivities: RecentActivity[];
  insights: SystemInsight[];
  topClinics: TopPerformer[];
  topVets: TopPerformer[];
  growthTrends: GrowthTrend[];
  loading: boolean;
  error: string | null;
}

export const useDashboardData = (selectedPeriod: PeriodType): DashboardData => {
  const [periodStats, setPeriodStats] = useState<PeriodStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [insights, setInsights] = useState<SystemInsight[]>([]);
  const [topClinics, setTopClinics] = useState<TopPerformer[]>([]);
  const [topVets, setTopVets] = useState<TopPerformer[]>([]);
  const [growthTrends, setGrowthTrends] = useState<GrowthTrend[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load period stats
        try {
          const { stats: periodStatsData } = await statisticsApi.getSystemStatsWithPeriod(selectedPeriod);
          setPeriodStats(periodStatsData);
        } catch (err: any) {
          console.error('Error loading period stats:', err);
          setError('Erro ao carregar estatísticas do período');
        }

        // Load recent activity
        try {
          const { activities } = await statisticsApi.getRecentActivity(10);
          setRecentActivities(activities || []);
        } catch (err: any) {
          console.error('Error loading recent activity:', err);
          setRecentActivities([]);
        }

        // Load insights
        try {
          const { insights: insightsData } = await statisticsApi.getSystemInsights();
          setInsights(insightsData || []);
        } catch (err: any) {
          console.error('Error loading insights:', err);
          setInsights([]);
        }

        // Load top performers
        try {
          const [clinicsResult, vetsResult] = await Promise.all([
            statisticsApi.getTopPerformers('clinics', 5),
            statisticsApi.getTopPerformers('vets', 5),
          ]);
          setTopClinics(clinicsResult?.performers || []);
          setTopVets(vetsResult?.performers || []);
        } catch (err: any) {
          console.error('Error loading top performers:', err);
          setTopClinics([]);
          setTopVets([]);
        }

        // Load growth trends
        try {
          const { trends } = await statisticsApi.getSystemGrowthTrends('30d');
          setGrowthTrends(trends || []);
        } catch (err: any) {
          console.error('Error loading growth trends:', err);
          setGrowthTrends([]);
        }
      } catch (err: any) {
        console.error('Error loading dashboard data:', err);
        setError('Erro ao carregar dados do dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedPeriod]);

  return {
    periodStats,
    recentActivities,
    insights,
    topClinics,
    topVets,
    growthTrends,
    loading,
    error,
  };
};

