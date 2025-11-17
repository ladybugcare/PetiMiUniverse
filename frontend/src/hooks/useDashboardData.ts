import { useState, useEffect, useRef } from 'react';
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

  // Refs para prevenir requisições duplicadas
  const isLoadingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastPeriodRef = useRef<PeriodType | null>(null);
  const lastRequestTimeRef = useRef<number>(0);

  useEffect(() => {
    // Se já está carregando, não fazer nova requisição
    if (isLoadingRef.current) {
      console.warn('[useDashboardData] Já existe uma requisição em andamento, ignorando...');
      return;
    }

    // Se o período não mudou, não recarregar
    if (lastPeriodRef.current === selectedPeriod && lastRequestTimeRef.current > 0) {
      console.warn('[useDashboardData] Período não mudou, não recarregando...');
      return;
    }

    // Throttle: não fazer requisição se a última foi há menos de 1 segundo
    const now = Date.now();
    if (now - lastRequestTimeRef.current < 1000) {
      console.warn('[useDashboardData] Throttle: última requisição foi há menos de 1 segundo');
      return;
    }

    // Cancelar requisição anterior se existir
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Criar novo AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const loadData = async () => {
      // Verificar se foi cancelado antes de começar
      if (abortController.signal.aborted) {
        return;
      }

      isLoadingRef.current = true;
      lastPeriodRef.current = selectedPeriod;
      lastRequestTimeRef.current = now;
      setLoading(true);
      setError(null);

      try {
        // Load period stats
        if (!abortController.signal.aborted) {
          try {
            const { stats: periodStatsData } = await statisticsApi.getSystemStatsWithPeriod(selectedPeriod);
            if (!abortController.signal.aborted) {
              setPeriodStats(periodStatsData);
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              console.log('[useDashboardData] Requisição cancelada');
              return;
            }
            console.error('Error loading period stats:', err);
            if (!abortController.signal.aborted) {
              setError('Erro ao carregar estatísticas do período');
            }
          }
        }

        // Load recent activity
        if (!abortController.signal.aborted) {
          try {
            const { activities } = await statisticsApi.getRecentActivity(10);
            if (!abortController.signal.aborted) {
              setRecentActivities(activities || []);
            }
          } catch (err: any) {
            if (err.name === 'AbortError') return;
            console.error('Error loading recent activity:', err);
            if (!abortController.signal.aborted) {
              setRecentActivities([]);
            }
          }
        }

        // Load insights
        if (!abortController.signal.aborted) {
          try {
            const { insights: insightsData } = await statisticsApi.getSystemInsights();
            if (!abortController.signal.aborted) {
              setInsights(insightsData || []);
            }
          } catch (err: any) {
            if (err.name === 'AbortError') return;
            console.error('Error loading insights:', err);
            if (!abortController.signal.aborted) {
              setInsights([]);
            }
          }
        }

        // Load top performers
        if (!abortController.signal.aborted) {
          try {
            const [clinicsResult, vetsResult] = await Promise.all([
              statisticsApi.getTopPerformers('clinics', 5),
              statisticsApi.getTopPerformers('vets', 5),
            ]);
            if (!abortController.signal.aborted) {
              setTopClinics(clinicsResult?.performers || []);
              setTopVets(vetsResult?.performers || []);
            }
          } catch (err: any) {
            if (err.name === 'AbortError') return;
            console.error('Error loading top performers:', err);
            if (!abortController.signal.aborted) {
              setTopClinics([]);
              setTopVets([]);
            }
          }
        }

        // Load growth trends
        if (!abortController.signal.aborted) {
          try {
            const { trends } = await statisticsApi.getSystemGrowthTrends('30d');
            if (!abortController.signal.aborted) {
              setGrowthTrends(trends || []);
            }
          } catch (err: any) {
            if (err.name === 'AbortError') return;
            console.error('Error loading growth trends:', err);
            if (!abortController.signal.aborted) {
              setGrowthTrends([]);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('[useDashboardData] Requisição cancelada');
          return;
        }
        console.error('Error loading dashboard data:', err);
        if (!abortController.signal.aborted) {
          setError('Erro ao carregar dados do dashboard');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
          isLoadingRef.current = false;
        }
      }
    };

    loadData();

    // Cleanup: cancelar requisição se o componente desmontar ou o período mudar
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isLoadingRef.current = false;
    };
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

