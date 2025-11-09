import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import LoadingOverlay from '../components/LoadingOverlay';
import { MenuItem } from '../components/DashboardSidebar';
import { BarChart2, Building2, Stethoscope, ClipboardList, Users, LogOut, MessageCircle, CheckCircle, Settings, TrendingUp, Clock } from 'lucide-react';
import colors from '../styles/colors';
import { adminApi } from '../services/adminApi';

const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [stats, setStats] = useState({
    totalClinics: 0,
    totalVets: 0,
    totalDemands: 0,
    totalUsers: 0,
  });
  const [pendingVetsCount, setPendingVetsCount] = useState(0);

  // Check authentication
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '');
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

    loadSystemStats();
    loadPendingVets();
  }, []);

  const menuItems: MenuItem[] = [
    {
      id: 'overview',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'section',
      sectionId: 'overview',
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
    // {
    //   id: 'logout',
    //   label: 'Sair',
    //   icon: <LogOut size={20} color={colors.primary} />,
    //   action: 'logout',
    // },
  ];

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return <OverviewSection stats={stats} pendingVetsCount={pendingVetsCount} />;
      case 'clinics':
        return <ClinicsSection />;
      case 'vets':
        return <VetsSection />;
      case 'demands':
        return <DemandsSection />;
      case 'reports':
        return <ReportsSection />;
      case 'settings':
        return <SettingsSection />;
      default:
        return <OverviewSection stats={stats} pendingVetsCount={pendingVetsCount} />;
    }
  };

  return (
    <>
      <DashboardLayout 
        pageName="Painel do Administrador" 
        menuItems={menuItems}
      >
        {renderSection()}
      </DashboardLayout>
      <LoadingOverlay visible={checkingAuth} />
    </>
  );
};

// Overview Section
const OverviewSection: React.FC<{ stats: any; pendingVetsCount: number }> = ({ stats, pendingVetsCount }) => {
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
      <h2 style={styles.sectionTitle}>Visão Geral do Sistema</h2>

      {/* System Stats */}
      <div style={styles.statsGrid}>
        <div 
          style={{ ...styles.statCard, ...styles.statCardClickable, borderLeftColor: '#7c3aed' }}
          onClick={() => navigate('/admin/clinics')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(124, 58, 237, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            <Building2 size={36} color="#7c3aed" />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalClinics}</h3>
            <p style={styles.statLabel}>Clínicas Cadastradas</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, ...styles.statCardClickable, borderLeftColor: '#3b82f6' }}
          onClick={() => navigate('/admin/vets')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            {}
            <Stethoscope size={36} color="#3b82f6" />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalVets}</h3>
            <p style={styles.statLabel}>Veterinários Cadastrados</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, ...styles.statCardClickable, borderLeftColor: '#10b981' }}
          onClick={() => navigate('/admin/demands')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(16, 185, 129, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            {}
            <ClipboardList size={36} color="#10b981" />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalDemands}</h3>
            <p style={styles.statLabel}>Demandas Ativas</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, ...styles.statCardClickable, borderLeftColor: '#f59e0b' }}
          onClick={() => navigate('/admin/users')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 10px 25px rgba(245, 158, 11, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
          }}
        >
          <div style={styles.statIcon}>
            {}
            <Users size={36} color="#f59e0b" />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalUsers}</h3>
            <p style={styles.statLabel}>Usuários Totais</p>
          </div>
        </div>
      </div>

      {/* Pending Approvals Section */}
      <div style={styles.pendingSection}>
        <h3 style={styles.subsectionTitle}>Aprovações Pendentes</h3>
        <div style={styles.pendingGrid}>
          <div 
            style={{ ...styles.pendingCard, ...styles.statCardClickable }}
            onClick={() => navigate('/admin/pending-units')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 10px 25px rgba(124, 58, 237, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
            }}
          >
            <div style={styles.pendingIcon}>
              <Building2 size={32} color={colors.primary} />
            </div>
            <div style={styles.pendingContent}>
              <h4 style={styles.pendingTitle}>Unidades Pendentes</h4>
              <p style={styles.pendingText}>Clínicas aguardando aprovação</p>
            </div>
            <div style={styles.pendingArrow}>→</div>
          </div>

          <div 
            style={{ 
              ...styles.pendingCard, 
              ...styles.statCardClickable,
              ...(pendingVetsCount > 0 ? styles.pendingCardHighlight : {}),
            }}
            onClick={() => navigate('/admin/pending-vets')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
            }}
          >
            <div style={styles.pendingIcon}>
              <Stethoscope size={32} color={colors.primary} />
              {pendingVetsCount > 0 && (
                <span style={styles.badge}>{pendingVetsCount}</span>
              )}
            </div>
            <div style={styles.pendingContent}>
              <h4 style={styles.pendingTitle}>Veterinários Pendentes</h4>
              <p style={styles.pendingText}>
                {pendingVetsCount > 0 
                  ? `${pendingVetsCount} ${pendingVetsCount === 1 ? 'veterinário' : 'veterinários'} aguardando aprovação`
                  : 'Nenhum veterinário pendente'}
              </p>
            </div>
            <div style={styles.pendingArrow}>→</div>
          </div>
        </div>
      </div>

      {/* System Health */}
      <div style={styles.healthSection}>
        <h3 style={styles.subsectionTitle}>Saúde do Sistema</h3>
        <div style={styles.healthCards}>
          <HealthCard
            title="API Status"
            status="Operacional"
            statusColor="#10b981"
            icon={<CheckCircle size={32} color="#10b981" />}
          />
          <HealthCard
            title="Database"
            status="Operacional"
            statusColor="#10b981"
            icon={<CheckCircle size={32} color="#10b981" />}
          />
          <HealthCard
            title="Storage"
            status="Operacional"
            statusColor="#10b981"
            icon={<CheckCircle size={32} color="#10b981" />}
          />
          <HealthCard
            title="Email Service"
            status="Operacional"
            statusColor="#10b981"
            icon={<CheckCircle size={32} color="#10b981" />}
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div style={styles.activitySection}>
        <h3 style={styles.subsectionTitle}>Atividade Recente</h3>
        <div style={styles.activityList}>
          <ActivityItem
            icon={<Building2 size={20} color="#7c3aed" />}
            title="Nova clínica cadastrada"
            description="Vet Care Alphaville"
            time="Há 2 horas"
          />
          <ActivityItem
            icon={<Stethoscope size={20} color="#7c3aed" />}
            title="Novo veterinário registrado"
            description="Dr. João Silva - CRMV 12345"
            time="Há 5 horas"
          />
          <ActivityItem
            icon={<ClipboardList size={20} color="#7c3aed" />}
            title="Demanda criada"
            description="Plantão emergencial - Clínica São Paulo"
            time="Há 1 dia"
          />
        </div>
      </div>
    </div>
  );
};

// Clinics Section
const ClinicsSection: React.FC = () => {
  return (
    <div style={styles.container}>
      <h2 style={styles.sectionTitle}>Gerenciar Clínicas</h2>
      <div style={styles.placeholder}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <Building2 size={48} color="#a3a3a3" />
        </div>
        <p style={styles.placeholderText}>
          Lista de clínicas cadastradas no sistema
        </p>
        <p style={styles.placeholderSubtext}>
          Aqui você poderá visualizar, editar e gerenciar todas as clínicas
        </p>
      </div>
    </div>
  );
};

// Vets Section
const VetsSection: React.FC = () => {
  return (
    <div style={styles.container}>
      <h2 style={styles.sectionTitle}>Gerenciar Veterinários</h2>
      <div style={styles.placeholder}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          {}
          <Stethoscope size={48} color="#a3a3a3" />
        </div>
        <p style={styles.placeholderText}>
          Lista de veterinários cadastrados no sistema
        </p>
        <p style={styles.placeholderSubtext}>
          Aqui você poderá visualizar, editar e gerenciar todos os veterinários
        </p>
      </div>
    </div>
  );
};

// Demands Section
const DemandsSection: React.FC = () => {
  return (
    <div style={styles.container}>
      <h2 style={styles.sectionTitle}>Demandas do Sistema</h2>
      <div style={styles.placeholder}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          {}
          <ClipboardList size={48} color="#a3a3a3" />
        </div>
        <p style={styles.placeholderText}>
          Visão geral de todas as demandas do sistema
        </p>
        <p style={styles.placeholderSubtext}>
          Acompanhe estatísticas e métricas de demandas
        </p>
      </div>
    </div>
  );
};

// Reports Section
const ReportsSection: React.FC = () => {
  return (
    <div style={styles.container}>
      <h2 style={styles.sectionTitle}>Relatórios e Analytics</h2>
      <div style={styles.placeholder}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          {}
          <TrendingUp size={48} color="#a3a3a3" />
        </div>
        <p style={styles.placeholderText}>
          Relatórios e análises do sistema
        </p>
        <p style={styles.placeholderSubtext}>
          Visualize métricas, gráficos e insights do negócio
        </p>
      </div>
    </div>
  );
};

// Settings Section
const SettingsSection: React.FC = () => {
  return (
    <div style={styles.container}>
      <h2 style={styles.sectionTitle}>Configurações do Sistema</h2>
      <div style={styles.placeholder}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          {}
          <Settings size={48} color="#a3a3a3" />
        </div>
        <p style={styles.placeholderText}>
          Configurações gerais do sistema
        </p>
        <p style={styles.placeholderSubtext}>
          Gerencie configurações, integrações e parâmetros do sistema
        </p>
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
}> = ({ title, status, statusColor, icon }) => {
  return (
    <div style={styles.healthCard}>
      <div style={styles.healthIcon}>{icon}</div>
      <h4 style={styles.healthTitle}>{title}</h4>
      <p style={{ ...styles.healthStatus, color: statusColor }}>{status}</p>
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
};

export default AdminDashboardPage;

