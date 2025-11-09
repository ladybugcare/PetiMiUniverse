import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import LoadingOverlay from '../components/LoadingOverlay';
import { MenuItem } from '../components/DashboardSidebar';
import { BarChart2, Building2, Stethoscope, ClipboardList, Users, MessageCircle, Settings, Clock, Briefcase, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import colors from '../styles/colors';
import { adminApi } from '../services/adminApi';
import PeriodFilter, { PeriodType } from '../components/admin/PeriodFilter';
import QuickActions from '../components/admin/QuickActions';
import SystemInsights from '../components/admin/SystemInsights';
import TopPerformersTable from '../components/admin/TopPerformersTable';
import GrowthChart from '../components/admin/GrowthChart';
import StatCard from '../components/admin/StatCard';
import PendingCard from '../components/admin/PendingCard';
import SkeletonLoader from '../components/admin/SkeletonLoader';
import { useDashboardData } from '../hooks/useDashboardData';
import { useAlert } from '../hooks/useAlert';
import { healthApi, SystemHealth } from '../services/healthApi';

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

  // Check authentication
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    let user = null;
    
    if (userStr && userStr.trim() !== '') {
      try {
        user = JSON.parse(userStr);
      } catch (error) {
        console.error('Erro ao fazer parse do usuário:', error);
        localStorage.removeItem('user');
        navigate('/login');
        return setCheckingAuth(false);
      }
    }
    
    const userRole = user?.user_metadata?.role || user?.role;
    
    if (!user || !user.id) {
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

  useEffect(() => {
    const loadSystemStats = async () => {
      try {
        const { statisticsApi } = await import('../services/statisticsApi');
        const { stats: systemStats } = await statisticsApi.getSystemStats();
        
        setStats({
          totalClinics: systemStats.totalClinics,
          totalVets: systemStats.totalVets,
          totalFreelancers: systemStats.totalFreelancers || 0,
          totalDemands: systemStats.activeDemands,
          totalUsers: systemStats.totalUsers,
        });
      } catch (error) {
        console.error('Error loading system stats:', error);
      }
    };

    const loadPendingVets = async () => {
      try {
        const { vets } = await adminApi.getPendingVets();
        setPendingVetsCount(vets.length);
      } catch (error) {
        console.error('Error loading pending vets:', error);
      }
    };

    const loadPendingFreelancers = async () => {
      try {
        const { freelancers } = await adminApi.getPendingFreelancers();
        setPendingFreelancersCount(freelancers.length);
      } catch (error) {
        console.error('Error loading pending freelancers:', error);
      }
    };

    loadSystemStats();
    loadPendingVets();
    loadPendingFreelancers();
  }, []);

  const menuItems: MenuItem[] = [
    {
      id: 'overview',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin-dashboard',
    },
    {
      id: 'clinics',
      label: 'Clínicas',
      icon: <Building2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/clinics',
    },
    {
      id: 'vets',
      label: 'Veterinários',
      icon: <Stethoscope size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/vets',
    },
    {
      id: 'freelancers',
      label: 'Freelancers',
      icon: <Briefcase size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/freelancers',
    },
    {
      id: 'demands',
      label: 'Demandas',
      icon: <ClipboardList size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/demands',
    },
    {
      id: 'support',
      label: 'Tickets de Suporte',
      icon: <MessageCircle size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/support-tickets',
    },
    {
      id: 'users',
      label: 'Usuários',
      icon: <Users size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/users',
    },
    {
      id: 'settings',
      label: 'Configurações',
      icon: <Settings size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/settings',
    },
  ];

  return (
    <>
      <DashboardLayout 
        pageName="Painel do Administrador" 
        menuItems={menuItems}
      >
        <OverviewSection stats={stats} pendingVetsCount={pendingVetsCount} pendingFreelancersCount={pendingFreelancersCount} />
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

// Overview Section
const OverviewSection: React.FC<{ stats: any; pendingVetsCount: number; pendingFreelancersCount: number }> = ({ stats, pendingVetsCount, pendingFreelancersCount }) => {
  const navigate = useNavigate();
  const { showError } = useAlert();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('30d');
  const [adminName, setAdminName] = useState('');
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

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
    // Refresh health every 30 seconds
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
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

  return (
    <div style={styles.container}>
      {/* Header with Welcome and Period Filter */}
      <div style={styles.headerSection}>
        <div style={styles.welcomeSection}>
          <h2 style={styles.sectionTitle}>
            {getGreeting()}, {adminName} {getGreeting() === 'Boa noite' ? '🌙' : getGreeting() === 'Boa tarde' ? '☀️' : '🌅'}
          </h2>
          {pendingVetsCount + pendingFreelancersCount > 0 && (
            <p style={styles.welcomeSubtitle}>
              {pendingVetsCount + pendingFreelancersCount} cadastro(s) aguardando análise
            </p>
          )}
        </div>
        <div style={styles.filterSection}>
          <PeriodFilter selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />
        </div>
      </div>

      <h3 style={styles.subsectionTitle}>Visão Geral do Sistema</h3>

      {/* System Stats */}
      <div style={styles.statsGrid}>
        <StatCard
          icon={<Building2 />}
          value={stats.totalClinics}
          label="Clínicas Cadastradas"
          color="#7c3aed"
          onClick={() => navigate('/admin/clinics')}
          subtext={periodStats ? `${periodStats.newClinics} novos nos últimos ${selectedPeriod === 'today' ? 'dias' : selectedPeriod === '7d' ? '7 dias' : '30 dias'}` : null}
          growth={periodStats?.clinicsGrowth}
        />
        <StatCard
          icon={<Stethoscope />}
          value={stats.totalVets}
          label="Veterinários Cadastrados"
          color="#3b82f6"
          onClick={() => navigate('/admin/vets')}
          subtext={periodStats ? `${periodStats.newVets} novos nos últimos ${selectedPeriod === 'today' ? 'dias' : selectedPeriod === '7d' ? '7 dias' : '30 dias'}` : null}
          growth={periodStats?.vetsGrowth}
        />
        <StatCard
          icon={<Briefcase />}
          value={stats.totalFreelancers || 0}
          label="Freelancers Cadastrados"
          color="#8b5cf6"
          onClick={() => navigate('/admin/freelancers')}
          subtext={periodStats ? `${periodStats.newFreelancers} novos nos últimos ${selectedPeriod === 'today' ? 'dias' : selectedPeriod === '7d' ? '7 dias' : '30 dias'}` : null}
          growth={periodStats?.freelancersGrowth}
        />
        <StatCard
          icon={<ClipboardList />}
          value={stats.totalDemands}
          label="Demandas Ativas"
          color="#10b981"
          onClick={() => navigate('/admin/demands')}
        />
        <StatCard
          icon={<Users />}
          value={stats.totalUsers}
          label="Usuários Totais"
          color="#f59e0b"
          onClick={() => navigate('/admin/users')}
        />
      </div>

      {/* Pending Approvals Section */}
      <div style={styles.pendingSection}>
        <h3 style={styles.subsectionTitle}>Aprovações Pendentes</h3>
        <div style={styles.pendingGrid}>
          <PendingCard
            icon={<Building2 />}
            title="Unidades Pendentes"
            description="Clínicas aguardando aprovação"
            onClick={() => navigate('/admin/pending-units')}
          />
          <PendingCard
            icon={<Stethoscope />}
            title="Veterinários Pendentes"
            description={pendingVetsCount > 0 
              ? `${pendingVetsCount} ${pendingVetsCount === 1 ? 'veterinário' : 'veterinários'} aguardando aprovação`
              : 'Nenhum veterinário pendente'}
            count={pendingVetsCount > 0 ? pendingVetsCount : undefined}
            highlight={pendingVetsCount > 0}
            onClick={() => navigate('/admin/pending-all')}
          />
          <PendingCard
            icon={<Briefcase />}
            title="Freelancers Pendentes"
            description={pendingFreelancersCount > 0
              ? `${pendingFreelancersCount} ${pendingFreelancersCount === 1 ? 'freelancer' : 'freelancers'} aguardando aprovação`
              : 'Nenhum freelancer pendente'}
            count={pendingFreelancersCount > 0 ? pendingFreelancersCount : undefined}
            highlight={pendingFreelancersCount > 0}
            onClick={() => navigate('/admin/pending-all')}
          />
        </div>
      </div>

      {/* System Health */}
      <div style={styles.healthSection}>
        <h3 style={styles.subsectionTitle}>Saúde do Sistema</h3>
        {healthLoading ? (
          <div style={styles.healthCards}>
            <SkeletonLoader variant="statCard" count={4} />
          </div>
        ) : systemHealth ? (
          <div style={styles.healthCards}>
            <HealthCard
              title="API Status"
              status={systemHealth.api.status === 'healthy' ? 'Operacional' : systemHealth.api.status === 'degraded' ? 'Degradado' : 'Indisponível'}
              statusColor={systemHealth.api.status === 'healthy' ? '#10b981' : systemHealth.api.status === 'degraded' ? '#f59e0b' : '#ef4444'}
              icon={
                systemHealth.api.status === 'healthy' ? (
                  <CheckCircle size={32} color="#10b981" />
                ) : systemHealth.api.status === 'degraded' ? (
                  <AlertTriangle size={32} color="#f59e0b" />
                ) : (
                  <XCircle size={32} color="#ef4444" />
                )
              }
              latency={systemHealth.api.latency}
            />
            <HealthCard
              title="Database"
              status={systemHealth.database.status === 'healthy' ? 'Operacional' : systemHealth.database.status === 'degraded' ? 'Degradado' : 'Indisponível'}
              statusColor={systemHealth.database.status === 'healthy' ? '#10b981' : systemHealth.database.status === 'degraded' ? '#f59e0b' : '#ef4444'}
              icon={
                systemHealth.database.status === 'healthy' ? (
                  <CheckCircle size={32} color="#10b981" />
                ) : systemHealth.database.status === 'degraded' ? (
                  <AlertTriangle size={32} color="#f59e0b" />
                ) : (
                  <XCircle size={32} color="#ef4444" />
                )
              }
              latency={systemHealth.database.latency}
            />
            <HealthCard
              title="Storage"
              status={systemHealth.storage.status === 'healthy' ? 'Operacional' : systemHealth.storage.status === 'degraded' ? 'Degradado' : 'Indisponível'}
              statusColor={systemHealth.storage.status === 'healthy' ? '#10b981' : systemHealth.storage.status === 'degraded' ? '#f59e0b' : '#ef4444'}
              icon={
                systemHealth.storage.status === 'healthy' ? (
                  <CheckCircle size={32} color="#10b981" />
                ) : systemHealth.storage.status === 'degraded' ? (
                  <AlertTriangle size={32} color="#f59e0b" />
                ) : (
                  <XCircle size={32} color="#ef4444" />
                )
              }
              latency={systemHealth.storage.latency}
            />
            <HealthCard
              title="Email Service"
              status={systemHealth.email.status === 'healthy' ? 'Operacional' : systemHealth.email.status === 'degraded' ? 'Degradado' : 'Indisponível'}
              statusColor={systemHealth.email.status === 'healthy' ? '#10b981' : systemHealth.email.status === 'degraded' ? '#f59e0b' : '#ef4444'}
              icon={
                systemHealth.email.status === 'healthy' ? (
                  <CheckCircle size={32} color="#10b981" />
                ) : systemHealth.email.status === 'degraded' ? (
                  <AlertTriangle size={32} color="#f59e0b" />
                ) : (
                  <XCircle size={32} color="#ef4444" />
                )
              }
            />
          </div>
        ) : (
          <div style={styles.errorSection}>
            <p style={styles.errorText}>Erro ao carregar status do sistema</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <QuickActions pendingCount={pendingVetsCount + pendingFreelancersCount} />

      {/* System Insights */}
      {loading ? (
        <div style={styles.loadingSection}>
          <SkeletonLoader variant="statCard" count={2} />
        </div>
      ) : error ? (
        <div style={styles.errorSection}>
          <p style={styles.errorText}>Erro ao carregar insights. Tente novamente.</p>
        </div>
      ) : (
        insights.length > 0 && <SystemInsights insights={insights} />
      )}

      {/* Growth Chart */}
      {loading ? (
        <div style={styles.loadingSection}>
          <SkeletonLoader variant="chart" />
        </div>
      ) : (
        growthTrends.length > 0 && <GrowthChart trends={growthTrends} />
      )}

      {/* Top Performers */}
      {loading ? (
        <div style={styles.loadingSection}>
          <SkeletonLoader variant="statCard" count={2} />
        </div>
      ) : (
        (topClinics.length > 0 || topVets.length > 0) && (
          <TopPerformersTable clinics={topClinics} vets={topVets} />
        )
      )}

      {/* Recent Activity */}
      <div style={styles.activitySection}>
        <h3 style={styles.subsectionTitle}>Atividade Recente</h3>
        <div style={styles.activityList}>
          {loading ? (
            <SkeletonLoader variant="activity" count={3} />
          ) : recentActivities.length > 0 ? (
            recentActivities.map((activity) => (
              <ActivityItem
                key={activity.id}
                icon={getActivityIcon(activity.icon, activity.color)}
                title={activity.title}
                description={activity.description}
                time={formatTimeAgo(activity.timestamp)}
              />
            ))
          ) : (
            <p style={styles.emptyText}>Nenhuma atividade recente</p>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper Components
const HealthCard: React.FC<{
  title: string;
  status: string;
  statusColor: string;
  icon: React.ReactNode;
  latency?: number;
}> = ({ title, status, statusColor, icon, latency }) => {
  return (
    <div style={styles.healthCard}>
      <div style={styles.healthIcon}>{icon}</div>
      <h4 style={styles.healthTitle}>{title}</h4>
      <p style={{ ...styles.healthStatus, color: statusColor }}>{status}</p>
      {latency !== undefined && (
        <p style={styles.healthLatency}>{latency}ms</p>
      )}
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
    padding: '32px',
    fontFamily: 'Inter, sans-serif',
  },
  sectionTitle: {
    fontSize: '28px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    marginBottom: '24px',
  },
  subsectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '24px',
    marginBottom: '32px',
  },
  statCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderLeft: '4px solid',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  statCardClickable: {
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  statIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
  },
  statLabel: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
    marginTop: '4px',
  },
  healthSection: {
    marginBottom: '32px',
  },
  healthCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  healthCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'center',
  },
  healthIcon: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '8px',
  },
  healthTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '8px',
  },
  healthStatus: {
    fontSize: '14px',
    fontWeight: '600',
    margin: 0,
    marginBottom: '4px',
  },
  healthLatency: {
    fontSize: '12px',
    color: '#737373',
    margin: 0,
  },
  activitySection: {
    marginTop: '32px',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  activityItem: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  activityIcon: {
    fontSize: '24px',
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: '50%',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '4px',
  },
  activityDescription: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  activityTime: {
    fontSize: '13px',
    color: '#a3a3a3',
    whiteSpace: 'nowrap',
  },
  placeholder: {
    backgroundColor: '#fafafa',
    border: '2px dashed #e5e5e5',
    borderRadius: '12px',
    padding: '64px 32px',
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: '18px',
    color: '#525252',
    marginBottom: '8px',
  },
  placeholderSubtext: {
    fontSize: '14px',
    color: '#737373',
  },
  pendingSection: {
    marginTop: '32px',
    marginBottom: '32px',
  },
  pendingGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
  },
  pendingCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  pendingCardHighlight: {
    borderColor: colors.primary,
    borderWidth: '2px',
    backgroundColor: colors.primaryBg,
  },
  pendingIcon: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    backgroundColor: colors.danger,
    color: '#ffffff',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '700',
  },
  pendingContent: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
    marginBottom: '4px',
  },
  pendingText: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  pendingArrow: {
    fontSize: '20px',
    color: colors.primary,
    fontWeight: '600',
  },
  headerSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    gap: '24px',
    flexWrap: 'wrap',
  },
  welcomeSection: {
    flex: 1,
    minWidth: '200px',
  },
  welcomeSubtitle: {
    fontSize: '14px',
    color: '#737373',
    marginTop: '8px',
    margin: 0,
  },
  filterSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  statSubtext: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
    fontSize: '12px',
    color: '#737373',
  },
  loadingText: {
    padding: '20px',
    textAlign: 'center',
    color: '#737373',
    fontSize: '14px',
  },
  emptyText: {
    padding: '20px',
    textAlign: 'center',
    color: '#737373',
    fontSize: '14px',
  },
  loadingSection: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '40px',
    textAlign: 'center',
    marginTop: '32px',
    marginBottom: '32px',
  },
  errorSection: {
    backgroundColor: '#ffffff',
    border: '1px solid #ef4444',
    borderRadius: '12px',
    padding: '24px',
    marginTop: '32px',
    marginBottom: '32px',
  },
  errorText: {
    color: '#ef4444',
    fontSize: '14px',
    margin: 0,
    textAlign: 'center',
  },
};

export default AdminDashboardPage;

