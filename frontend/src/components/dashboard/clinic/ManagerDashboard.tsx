import React, { useState, useEffect } from 'react';
import { useUnit } from '../../../contexts/UnitContext';
import { unitsApi } from '../../../services/unitsApi';
import { demandsApi } from '../../../services/demandsApi';
import { applicationsApi } from '../../../services/applicationsApi';
import { ClipboardList, Users, CheckCircle, MessageSquare, Stethoscope, Calendar } from 'lucide-react';
import colors from '../../../styles/colors';

interface ManagerDashboardProps {
  activeSection: string;
}

const ManagerDashboard: React.FC<ManagerDashboardProps> = ({ activeSection }) => {
  const { selectedUnit } = useUnit();

  const renderSection = () => {
    switch (activeSection) {
      case 'resumo':
        return <ResumoSection unit={selectedUnit} />;
      case 'profissionais':
        return <ProfissionaisSection unitId={selectedUnit?.id} />;
      case 'mensagens':
        return <MensagensSection />;
      default:
        return <ResumoSection unit={selectedUnit} />;
    }
  };

  return <div style={styles.container}>{renderSection()}</div>;
};

const ResumoSection: React.FC<{ unit: any }> = ({ unit }) => {
  const [stats, setStats] = useState({
    totalDemands: 0,
    openDemands: 0,
    totalApplications: 0,
    pendingApplications: 0,
  });
  const [recentDemands, setRecentDemands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!unit?.id) return;

      try {
        setLoading(true);
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const clinicUser = JSON.parse(localStorage.getItem('clinic_user') || '{}');
        const clinicId = clinicUser.clinic_id || user.user_metadata?.clinic_id || user.id;

        console.log('Loading manager data for clinic:', { clinicId, unitId: unit.id });

        // Fetch unit statistics
        const { stats: unitStats } = await unitsApi.getUnitStats(unit.id);
        setStats(unitStats);

        // Fetch recent activity
        const { demands } = await demandsApi.getRecentActivity(clinicId, unit.id, 3);
        setRecentDemands(demands);
      } catch (error: any) {
        console.error('Error loading manager data:', error);
        console.error('Error details:', error.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [unit]);

  if (loading) {
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Carregando...</h2>
      </div>
    );
  }

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>
        Resumo - {unit?.name || 'Unidade'}
      </h2>

      {/* Unit Stats */}
      <div style={styles.statsGrid}>
        <div 
          style={{ ...styles.statCard, borderLeftColor: '#7c3aed' }}
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
            {/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}
            <ClipboardList size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.openDemands}</h3>
            <p style={styles.statLabel}>Demandas Abertas</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, borderLeftColor: '#3b82f6' }}
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
            {/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}
            <Users size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalApplications}</h3>
            <p style={styles.statLabel}>Profissionais Aplicados</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, borderLeftColor: '#10b981' }}
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
            {/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}
            <CheckCircle size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.pendingApplications}</h3>
            <p style={styles.statLabel}>Pendentes Aprovação</p>
          </div>
        </div>

        <div 
          style={{ ...styles.statCard, borderLeftColor: '#f59e0b' }}
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
            {/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}
            <Calendar size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalDemands}</h3>
            <p style={styles.statLabel}>Total de Demandas</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div style={styles.activitySection}>
        <h3 style={styles.subsectionTitle}>Atividades Recentes</h3>
        <div style={styles.activityList}>
          {recentDemands.length > 0 ? (
            recentDemands.map((demand) => (
              <ActivityItem
                key={demand.id}
                icon={/* @ts-ignore - Type incompatibility between React 18 and lucide-react */<ClipboardList size={20} color={colors.primary} />}
                title={demand.title}
                description={`Categoria: ${demand.category} - Status: ${demand.status}`}
                time={new Date(demand.created_at).toLocaleDateString('pt-BR')}
              />
            ))
          ) : (
            <p style={styles.placeholderText}>Nenhuma atividade recente</p>
          )}
        </div>
      </div>
    </div>
  );
};

const ProfissionaisSection: React.FC<{ unitId?: string }> = ({ unitId }) => {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadApplications = async () => {
      if (!unitId) return;

      try {
        setLoading(true);
        const { applications: apps } = await applicationsApi.getByUnit(unitId);
        setApplications(apps);
      } catch (error) {
        console.error('Error loading applications:', error);
      } finally {
        setLoading(false);
      }
    };

    loadApplications();
  }, [unitId]);

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Profissionais Aplicados</h2>
      {loading ? (
        <p style={styles.placeholderText}>Carregando...</p>
      ) : applications.length > 0 ? (
        <div style={styles.activityList}>
          {applications.map((app) => (
            <div key={app.id} style={styles.activityItem}>
              <div style={styles.activityIcon}>
                {/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}
                <Stethoscope size={20} color={colors.primary} />
              </div>
              <div style={styles.activityContent}>
                <h4 style={styles.activityTitle}>Candidatura #{app.id.substring(0, 8)}</h4>
                <p style={styles.activityDescription}>
                  Status: {app.status} - {new Date(app.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.placeholder}>
          <p style={styles.placeholderText}>
            {/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}
            <Stethoscope size={20} color={colors.primary} style={{ marginRight: '8px', display: 'inline-block', verticalAlign: 'middle' }} />
            Nenhuma candidatura recebida ainda
          </p>
        </div>
      )}
    </div>
  );
};

const MensagensSection: React.FC = () => {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Mensagens Recentes</h2>
      <div style={styles.placeholder}>
        <p style={styles.placeholderText}>
          {/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}
          <MessageSquare size={24} color={colors.primary} style={{ marginRight: '8px', display: 'inline-block', verticalAlign: 'middle' }} />
          Suas mensagens aparecerão aqui
        </p>
      </div>
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
  section: {
    marginBottom: '32px',
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
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
  },
  statIcon: {
    fontSize: '36px',
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
  },
};

export default ManagerDashboard;

