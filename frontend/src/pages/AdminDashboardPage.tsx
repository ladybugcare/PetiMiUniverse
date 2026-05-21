import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import LoadingOverlay from '../components/LoadingOverlay';
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Activity,
  Building2,
  Stethoscope,
  Briefcase,
  ClipboardList,
  Users,
  LayoutDashboard,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import PeriodFilter, { PeriodType } from '../components/admin/PeriodFilter';
import QuickActions from '../components/admin/QuickActions';
import SystemInsights from '../components/admin/SystemInsights';
import TopPerformersTable from '../components/admin/TopPerformersTable';
import GrowthChart from '../components/admin/GrowthChart';
import StatCard from '../components/admin/StatCard';
import PendingCard from '../components/admin/PendingCard';
import SkeletonLoader from '../components/admin/SkeletonLoader';
import ActivityModal from '../components/admin/ActivityModal';
import { useDashboardData } from '../hooks/useDashboardData';
import { useAlert } from '../hooks/useAlert';
import { healthApi, SystemHealth } from '../services/healthApi';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import colors from '../styles/colors';

const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [stats, setStats] = useState({
    totalClinics: 0,
    totalVets: 0,
    totalFreelancers: 0,
    totalDemands: 0,
    totalUsers: 0,
  });
  const [pendingVetsCount, setPendingVetsCount] = useState(0);
  const [pendingFreelancersCount, setPendingFreelancersCount] = useState(0);
  const [pendingUnitsCount, setPendingUnitsCount] = useState(0);
  const [user, setUser] = useState<any>(null);

  // Check authentication and get user role
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    let userData = null;
    
    if (userStr && userStr.trim() !== '') {
      try {
        userData = JSON.parse(userStr);
        setUser(userData);
      } catch (error) {
        console.error('Erro ao fazer parse do usuário:', error);
        localStorage.removeItem('user');
        navigate('/login');
        return setCheckingAuth(false);
      }
    }
    
    const userRole = userData?.user_metadata?.role || userData?.role;
    
    if (!userData || !userData.id) {
      navigate('/login');
      return setCheckingAuth(false);
    }
    
    // Only allow system admins
    if (userRole !== 'admin') {
      // Redirect based on actual role
      if (userRole === 'clinic') {
        navigate('/clinic-dashboard');
      } else if (userRole === 'vet') {
        navigate('/vet-dashboard');
      } else {
        navigate('/login');
      }
    }
    setCheckingAuth(false);
  }, [navigate]);

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'ADMIN';
  const { menuItems } = useSidebarMenu(userRole);

  useEffect(() => {
    let isMounted = true;
    let isLoading = false;

    const loadAllData = async () => {
      // Prevenir múltiplas execuções simultâneas
      if (isLoading) {
        return;
      }
      isLoading = true;

      try {
        // Agrupar todas as requisições em paralelo para reduzir tempo total
        const [systemStatsResult, pendingVetsResult, pendingFreelancersResult, pendingUnitsResult] = await Promise.allSettled([
          (async () => {
            const { statisticsApi } = await import('../services/statisticsApi');
            return statisticsApi.getSystemStats();
          })(),
          adminApi.getPendingVets(),
          adminApi.getPendingFreelancers(),
          adminApi.getPendingUnits(),
        ]);

        if (!isMounted) return;

        // Processar resultados
        if (systemStatsResult.status === 'fulfilled') {
          const { stats: systemStats } = systemStatsResult.value;
          setStats({
            totalClinics: systemStats.totalClinics,
            totalVets: systemStats.totalVets,
            totalFreelancers: systemStats.totalFreelancers || 0,
            totalDemands: systemStats.activeDemands,
            totalUsers: systemStats.totalUsers,
          });
        } else {
          console.error('Error loading system stats:', systemStatsResult.reason);
        }

        if (pendingVetsResult.status === 'fulfilled') {
          const { vets } = pendingVetsResult.value;
          setPendingVetsCount(vets.length);
        } else {
          console.error('Error loading pending vets:', pendingVetsResult.reason);
        }

        if (pendingFreelancersResult.status === 'fulfilled') {
          const { freelancers } = pendingFreelancersResult.value;
          setPendingFreelancersCount(freelancers.length);
        } else {
          console.error('Error loading pending freelancers:', pendingFreelancersResult.reason);
        }

        if (pendingUnitsResult.status === 'fulfilled') {
          const { units } = pendingUnitsResult.value;
          setPendingUnitsCount(units.length);
        } else {
          console.error('Error loading pending units:', pendingUnitsResult.reason);
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        isLoading = false;
      }
    };

    loadAllData();

    return () => {
      isMounted = false;
    };
  }, []);


  return (
    <>
      <DashboardLayout 
        pageName="Início" 
        menuItems={menuItems}
      >
        <OverviewSection stats={stats} pendingVetsCount={pendingVetsCount} pendingFreelancersCount={pendingFreelancersCount} pendingUnitsCount={pendingUnitsCount} />
      </DashboardLayout>
      <LoadingOverlay visible={checkingAuth} />
    </>
  );
};

// Helper function to format time ago
const formatTimeAgo = (timestamp: string): string => {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Agora mesmo';
  if (diffInSeconds < 3600) return `Há ${Math.floor(diffInSeconds / 60)} minuto(s)`;
  if (diffInSeconds < 86400) return `Há ${Math.floor(diffInSeconds / 3600)} hora(s)`;
  if (diffInSeconds < 604800) return `Há ${Math.floor(diffInSeconds / 86400)} dia(s)`;
  return time.toLocaleDateString('pt-BR');
};

// Helper function to get icon component
const getActivityIcon = (iconName: string, color: string) => {
  const iconProps = { size: 20, color };
  switch (iconName) {
    case 'building':
      return <Building2 {...iconProps} />;
    case 'stethoscope':
      return <Stethoscope {...iconProps} />;
    case 'briefcase':
      return <Briefcase {...iconProps} />;
    case 'clipboard':
      return <ClipboardList {...iconProps} />;
    default:
      return <Clock {...iconProps} />;
  }
};

// Helper function to get greeting based on time
const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

const SectionHeading: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div style={sectionStyles.headingRow}>
    <span style={sectionStyles.headingBar} aria-hidden />
    <div>
      <h3 style={sectionStyles.headingTitle}>{title}</h3>
      {subtitle ? <p style={sectionStyles.headingSubtitle}>{subtitle}</p> : null}
    </div>
  </div>
);

const sectionStyles: { [key: string]: React.CSSProperties } = {
  headingRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    marginBottom: '18px',
  },
  headingBar: {
    width: '4px',
    minHeight: '44px',
    borderRadius: '4px',
    background: `linear-gradient(180deg, ${colors.brand.primary[500]} 0%, ${colors.accent.sage[500]} 100%)`,
    flexShrink: 0,
    marginTop: '2px',
  },
  headingTitle: {
    fontSize: 'clamp(1.05rem, 2.5vw, 1.25rem)',
    fontWeight: 700,
    color: colors.text,
    margin: 0,
    letterSpacing: '-0.02em',
  },
  headingSubtitle: {
    fontSize: '13px',
    color: colors.textSecondary,
    margin: '6px 0 0 0',
    lineHeight: 1.45,
    maxWidth: '520px',
  },
};

type HealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

const healthVisual = (status: HealthState | string) => {
  const s = String(status || 'unknown').toLowerCase();
  if (s === 'healthy') {
    return {
      label: 'Operacional',
      fg: colors.success[700],
      icon: <CheckCircle size={26} color={colors.success[500]} strokeWidth={2} />,
    };
  }
  if (s === 'degraded') {
    return {
      label: 'Atenção',
      fg: colors.warning[700],
      icon: <AlertTriangle size={26} color={colors.warning[500]} strokeWidth={2} />,
    };
  }
  return {
    label: 'Indisponível / não verificado',
    fg: colors.error[700],
    icon: <XCircle size={26} color={colors.error[500]} strokeWidth={2} />,
  };
};

// Overview Section
const OverviewSection: React.FC<{ stats: any; pendingVetsCount: number; pendingFreelancersCount: number; pendingUnitsCount: number }> = ({ stats, pendingVetsCount, pendingFreelancersCount, pendingUnitsCount }) => {
  const navigate = useNavigate();
  const { showError } = useAlert();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('30d');
  const [adminName, setAdminName] = useState('');
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [showActivityModal, setShowActivityModal] = useState(false);

  // Get admin name
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setAdminName(user.user_metadata?.name || user.email?.split('@')[0] || 'Admin');
      } catch (error) {
        console.error('Error parsing user:', error);
      }
    }
  }, []);

  // Load system health
  useEffect(() => {
    const loadHealth = async () => {
      try {
        setHealthLoading(true);
        const health = await healthApi.getSystemHealth();
        setSystemHealth(health);
      } catch (error: any) {
        console.error('Error loading system health:', error);
        // Set default unhealthy state on error
        setSystemHealth({
          api: { status: 'unhealthy', message: 'Erro ao verificar' },
          database: { status: 'unknown', message: 'Não verificado' },
          storage: { status: 'unknown', message: 'Não verificado' },
          email: { status: 'unknown', message: 'Não verificado' },
          overall: 'unhealthy',
          timestamp: new Date().toISOString(),
        });
      } finally {
        setHealthLoading(false);
      }
    };

    loadHealth();
    // Refresh health every 60 seconds (aumentado para reduzir carga)
    // Só fazer polling se a página estiver visível
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadHealth();
      }
    }, 60000);
    
    // Recarregar quando a página voltar a ficar visível
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadHealth();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Use custom hook for dashboard data
  const {
    periodStats,
    recentActivities,
    insights,
    topClinics,
    topVets,
    growthTrends,
    loading,
    error,
  } = useDashboardData(selectedPeriod);

  // Show error notification if any
  useEffect(() => {
    if (error) {
      showError(error);
    }
  }, [error, showError]);

  const totalPending = pendingVetsCount + pendingFreelancersCount + pendingUnitsCount;

  return (
    <div style={styles.container}>
      <header style={styles.hero}>
        <div style={styles.heroMain}>
          <div style={styles.heroKicker}>
            <LayoutDashboard size={18} color={colors.brand.primary[600]} aria-hidden />
            <span>Visão geral da plataforma</span>
          </div>
          <h2 style={styles.heroTitle}>
            {getGreeting()}, {adminName}
          </h2>
          <p style={styles.heroSubtitle}>
            {totalPending > 0
              ? `${totalPending} ${totalPending === 1 ? 'item aguarda' : 'itens aguardam'} sua revisão (unidades, vets ou freelancers). Use as filas abaixo para agir.`
              : 'Nenhuma fila de aprovação no momento. Continue acompanhando métricas e saúde do sistema.'}
          </p>
        </div>
        <div style={styles.heroAside}>
          <p style={styles.filterLabel}>Período dos gráficos</p>
          <PeriodFilter selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />
        </div>
      </header>

      <SectionHeading
        title="Visão inteligente"
        subtitle="Destaques e alertas calculados automaticamente com base no período selecionado."
      />
      {loading ? (
        <div style={styles.loadingSection}>
          <SkeletonLoader variant="statCard" count={2} />
        </div>
      ) : error ? (
        <div style={styles.errorSection}>
          <p style={styles.errorText}>Erro ao carregar insights. Tente novamente.</p>
        </div>
      ) : insights.length > 0 ? (
        <SystemInsights insights={insights} />
      ) : (
        <div style={styles.emptySection}>
          <p style={styles.emptyText}>Nenhum insight disponível no momento.</p>
        </div>
      )}

      <SectionHeading
        title="Visão geral do sistema"
        subtitle="Métricas consolidadas. Toque em um card para abrir a área correspondente."
      />
      <div style={styles.statsGrid}>
        <StatCard
          icon={<Building2 />}
          value={stats.totalClinics}
          label="Clínicas cadastradas"
          color={colors.brand.primary[500]}
          onClick={() => navigate('/admin/clinics')}
          subtext={periodStats ? `${periodStats.newClinics} novos nos últimos ${selectedPeriod === 'today' ? 'dias' : selectedPeriod === '7d' ? '7 dias' : '30 dias'}` : null}
          growth={periodStats?.clinicsGrowth}
        />
        <StatCard
          icon={<Stethoscope />}
          value={stats.totalVets}
          label="Veterinários cadastrados"
          color={colors.info[500]}
          onClick={() => navigate('/admin/vets')}
          subtext={periodStats ? `${periodStats.newVets} novos nos últimos ${selectedPeriod === 'today' ? 'dias' : selectedPeriod === '7d' ? '7 dias' : '30 dias'}` : null}
          growth={periodStats?.vetsGrowth}
        />
        <StatCard
          icon={<Briefcase />}
          value={stats.totalFreelancers || 0}
          label="Freelancers cadastrados"
          color={colors.accent.sage[500]}
          onClick={() => navigate('/admin/freelancers')}
          subtext={periodStats ? `${periodStats.newFreelancers} novos nos últimos ${selectedPeriod === 'today' ? 'dias' : selectedPeriod === '7d' ? '7 dias' : '30 dias'}` : null}
          growth={periodStats?.freelancersGrowth}
        />
        <StatCard
          icon={<ClipboardList />}
          value={stats.totalDemands}
          label="Demandas ativas"
          color={colors.brand.primary[600]}
          onClick={() => navigate('/admin/demands')}
        />
        <StatCard
          icon={<Users />}
          value={stats.totalUsers}
          label="Usuários totais"
          color={colors.warning[500]}
          onClick={() => navigate('/admin/users')}
        />
      </div>

      <div style={styles.pendingSection}>
        <SectionHeading
          title="Fila de aprovações"
          subtitle="Priorize unidades novas de clínica e cadastros de profissionais aguardando revisão."
        />
        <div style={styles.pendingGrid}>
          <PendingCard
            icon={<Building2 />}
            title="Unidades pendentes"
            description={
              pendingUnitsCount > 0
                ? `${pendingUnitsCount} ${pendingUnitsCount === 1 ? 'unidade aguarda' : 'unidades aguardam'} revisão antes de a clínica seguir no fluxo.`
                : 'Nenhuma unidade na fila — ótimo momento para revisar outros cadastros.'
            }
            count={pendingUnitsCount > 0 ? pendingUnitsCount : undefined}
            highlight={pendingUnitsCount > 0}
            iconColor={colors.brand.primary[600]}
            onClick={() => navigate('/admin/pending-units')}
          />
          <PendingCard
            icon={<Stethoscope />}
            title="Veterinários pendentes"
            description={
              pendingVetsCount > 0
                ? `${pendingVetsCount} ${pendingVetsCount === 1 ? 'cadastro aguarda' : 'cadastros aguardam'} análise de documentação e perfil.`
                : 'Nenhum veterinário aguardando aprovação neste momento.'
            }
            count={pendingVetsCount > 0 ? pendingVetsCount : undefined}
            highlight={pendingVetsCount > 0}
            iconColor={colors.info[500]}
            onClick={() => navigate('/admin/pending-all')}
          />
          <PendingCard
            icon={<Briefcase />}
            title="Freelancers pendentes"
            description={
              pendingFreelancersCount > 0
                ? `${pendingFreelancersCount} ${pendingFreelancersCount === 1 ? 'perfil aguarda' : 'perfis aguardam'} revisão administrativa.`
                : 'Nenhum freelancer na fila de aprovação.'
            }
            count={pendingFreelancersCount > 0 ? pendingFreelancersCount : undefined}
            highlight={pendingFreelancersCount > 0}
            iconColor={colors.accent.sage[500]}
            onClick={() => navigate('/admin/pending-all')}
          />
        </div>
      </div>

      {/* 4. Crescimento Mensal / Saúde do Sistema */}
      <div style={styles.twoColumnSection}>
        <div style={styles.panel}>
          <SectionHeading
            title="Crescimento no período"
            subtitle="Evolução de cadastros — ajuste o intervalo no topo da página."
          />
          <div style={styles.chartWrapper}>
            {loading ? (
              <div style={styles.loadingSection}>
                <SkeletonLoader variant="chart" />
              </div>
            ) : (
              growthTrends.length > 0 && <GrowthChart trends={growthTrends} />
            )}
          </div>
        </div>

        <div style={styles.panel}>
          <SectionHeading
            title="Saúde do sistema"
            subtitle="Monitoramento em tempo quase real dos serviços críticos."
          />
          <div style={styles.healthSection}>
            {healthLoading ? (
              <div style={styles.healthCardsGrid}>
                <SkeletonLoader variant="statCard" count={4} />
              </div>
            ) : systemHealth ? (
              <div style={styles.healthCardsGrid}>
                <HealthCard
                  title="API"
                  rawStatus={systemHealth.api.status}
                  latency={systemHealth.api.latency}
                />
                <HealthCard
                  title="Base de dados"
                  rawStatus={systemHealth.database.status}
                  latency={systemHealth.database.latency}
                />
                <HealthCard
                  title="Armazenamento"
                  rawStatus={systemHealth.storage.status}
                  latency={systemHealth.storage.latency}
                />
                <HealthCard title="E-mail" rawStatus={systemHealth.email.status} />
              </div>
            ) : (
              <div style={styles.errorSection}>
                <p style={styles.errorText}>Erro ao carregar status do sistema</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Ações Rápidas */}
      <QuickActions pendingCount={pendingVetsCount + pendingFreelancersCount + pendingUnitsCount} />

      {/* 6. Top Performers */}
      {loading ? (
        <div style={styles.loadingSection}>
          <SkeletonLoader variant="statCard" count={2} />
        </div>
      ) : (
        (topClinics.length > 0 || topVets.length > 0) && (
          <TopPerformersTable clinics={topClinics} vets={topVets} />
        )
      )}

      {/* 7. Atividade Recente */}
      <div style={styles.activitySection}>
        <SectionHeading
          title="Atividade recente"
          subtitle="Últimos eventos registrados na plataforma (amostra rápida)."
        />
        <div style={styles.activityList}>
          {loading ? (
            <SkeletonLoader variant="activity" count={5} />
          ) : recentActivities.length > 0 ? (
            <>
              {recentActivities.slice(0, 5).map((activity) => (
                <ActivityItem
                  key={activity.id}
                  icon={getActivityIcon(activity.icon, activity.color)}
                  title={activity.title}
                  description={activity.description}
                  time={formatTimeAgo(activity.timestamp)}
                />
              ))}
              {recentActivities.length > 5 && (
                <button
                  style={styles.seeMoreButton}
                  onClick={() => setShowActivityModal(true)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.brand.primary[600];
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = colors.brand.primary[500];
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  Ver mais
                </button>
              )}
            </>
          ) : (
            <p style={styles.emptyText}>Nenhuma atividade recente</p>
          )}
        </div>
      </div>

      {/* Activity Modal */}
      <ActivityModal
        activities={recentActivities}
        isOpen={showActivityModal}
        onClose={() => setShowActivityModal(false)}
        getActivityIcon={getActivityIcon}
        formatTimeAgo={formatTimeAgo}
      />
    </div>
  );
};

// Helper Components
const HealthCard: React.FC<{
  title: string;
  rawStatus: string;
  latency?: number;
}> = ({ title, rawStatus, latency }) => {
  const v = healthVisual(rawStatus);
  return (
    <div style={styles.healthCard}>
      <div style={styles.healthIcon}>{v.icon}</div>
      <h4 style={styles.healthTitle}>{title}</h4>
      <p style={{ ...styles.healthStatus, color: v.fg }}>{v.label}</p>
      {latency !== undefined && <p style={styles.healthLatency}>{latency} ms</p>}
    </div>
  );
};

const ActivityItem: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  time: string;
}> = ({ icon, title, description, time }) => {
  return (
    <div style={styles.activityItem}>
      <div style={styles.activityIcon}>{icon}</div>
      <div style={styles.activityContent}>
        <h4 style={styles.activityTitle}>{title}</h4>
        <p style={styles.activityDescription}>{description}</p>
      </div>
      <div style={styles.activityTime}>{time}</div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: 'clamp(16px, 3vw, 36px)',
    maxWidth: '1240px',
    margin: '0 auto',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    color: colors.text,
  },
  hero: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '24px',
    marginBottom: '36px',
    padding: 'clamp(20px, 3vw, 28px)',
    borderRadius: '18px',
    background: `linear-gradient(135deg, ${colors.brand.primary[50]} 0%, ${colors.surface} 55%, ${colors.accent.sage[100]} 100%)`,
    border: `1px solid ${colors.brand.primary[200]}`,
    boxShadow: '0 8px 30px rgba(42, 39, 38, 0.06)',
  },
  heroMain: {
    flex: '1 1 280px',
    minWidth: 0,
  },
  heroKicker: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colors.brand.primary[700],
    marginBottom: '10px',
  },
  heroTitle: {
    fontSize: 'clamp(1.5rem, 4vw, 2rem)',
    fontWeight: 800,
    color: colors.text,
    margin: '0 0 10px 0',
    letterSpacing: '-0.03em',
    lineHeight: 1.2,
  },
  heroSubtitle: {
    fontSize: '15px',
    lineHeight: 1.55,
    color: colors.textSecondary,
    margin: 0,
    maxWidth: '560px',
  },
  heroAside: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '8px',
    minWidth: '200px',
  },
  filterLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: colors.textMuted,
    margin: 0,
    alignSelf: 'flex-end',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    gap: '18px',
    marginBottom: '8px',
  },
  twoColumnSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
    gap: '22px',
    marginTop: '8px',
    marginBottom: '28px',
    alignItems: 'stretch',
  },
  panel: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    padding: '22px 22px 24px',
    boxShadow: '0 4px 18px rgba(42, 39, 38, 0.05)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  chartWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '320px',
    justifyContent: 'center',
  },
  healthSection: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: '280px',
    justifyContent: 'center',
  },
  healthCardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '14px',
    flex: 1,
  },
  healthCard: {
    backgroundColor: colors.neutral[50],
    border: `1px solid ${colors.border}`,
    borderRadius: '14px',
    padding: '18px 14px',
    textAlign: 'center' as const,
  },
  healthIcon: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '10px',
  },
  healthTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.text,
    margin: 0,
    marginBottom: '6px',
    letterSpacing: '-0.01em',
  },
  healthStatus: {
    fontSize: '13px',
    fontWeight: 600,
    margin: 0,
    marginBottom: '4px',
  },
  healthLatency: {
    fontSize: '11px',
    color: colors.textMuted,
    margin: 0,
  },
  activitySection: {
    marginTop: '12px',
    marginBottom: '24px',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  activityItem: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '14px',
    padding: '16px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    boxShadow: '0 1px 2px rgba(42, 39, 38, 0.04)',
  },
  activityIcon: {
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[100],
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  activityContent: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: colors.text,
    margin: 0,
    marginBottom: '4px',
    letterSpacing: '-0.02em',
  },
  activityDescription: {
    fontSize: '13px',
    color: colors.textSecondary,
    margin: 0,
    lineHeight: 1.45,
  },
  activityTime: {
    fontSize: '12px',
    color: colors.textMuted,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  pendingSection: {
    marginTop: '8px',
    marginBottom: '28px',
  },
  pendingGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
    gap: '16px',
  },
  emptySection: {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '14px',
    padding: '28px',
    textAlign: 'center' as const,
  },
  emptyText: {
    padding: '12px',
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: '14px',
    margin: 0,
  },
  seeMoreButton: {
    marginTop: '12px',
    padding: '12px 22px',
    backgroundColor: colors.brand.primary[500],
    color: colors.surface,
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s, transform 0.2s',
    alignSelf: 'center',
    width: 'fit-content',
    boxShadow: '0 2px 10px rgba(196, 108, 106, 0.3)',
  },
  loadingSection: {
    backgroundColor: colors.neutral[50],
    border: `1px dashed ${colors.border}`,
    borderRadius: '14px',
    padding: '36px 24px',
    textAlign: 'center',
    marginTop: '0',
    marginBottom: '0',
  },
  errorSection: {
    backgroundColor: colors.error[100],
    border: `1px solid ${colors.error[500]}`,
    borderRadius: '14px',
    padding: '20px',
    marginTop: '0',
    marginBottom: '0',
  },
  errorText: {
    color: colors.error[700],
    fontSize: '14px',
    margin: 0,
    textAlign: 'center',
  },
};

export default AdminDashboardPage;

