import React, { useState, useEffect } from 'react';
import { demandsApi } from '../../../services/demandsApi';
import { applicationsApi } from '../../../services/applicationsApi';
import { useUnit } from '../../../contexts/UnitContext';
import { ClipboardList, CheckCircle, MessageSquare, Calendar, Users, FileText, Eye } from 'lucide-react';
import colors from '../../../styles/colors';

interface AssistantDashboardProps {
  activeSection: string;
}

const AssistantDashboard: React.FC<AssistantDashboardProps> = ({ activeSection }) => {
  const renderSection = () => {
    switch (activeSection) {
      case 'resumo':
        return <ResumoSection />;
      case 'mensagens':
        return <MensagensSection />;
      default:
        return <ResumoSection />;
    }
  };

  return <div style={styles.container}>{renderSection()}</div>;
};

const ResumoSection: React.FC = () => {
  const { selectedUnit } = useUnit();
  const [stats, setStats] = useState({
    totalDemands: 0,
    totalApplications: 0,
    todayDemands: 0,
  });
  const [recentDemands, setRecentDemands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const clinicUser = JSON.parse(localStorage.getItem('clinic_user') || '{}');
        const clinicId = clinicUser.clinic_id || user.user_metadata?.clinic_id || user.id;

        console.log('Loading assistant data for clinic:', { clinicId, userId: user.id });

        // Fetch clinic's demands
        const { demands } = await demandsApi.getOpen('clinic', clinicId);
        
        // Fetch applications for clinic
        const { applications } = await applicationsApi.getByClinic(clinicId);

        // Calculate today's demands
        const today = new Date().toISOString().split('T')[0];
        const todayDemands = demands.filter((d: any) => 
          d.demand_date === today
        );

        setStats({
          totalDemands: demands.length,
          totalApplications: applications.length,
          todayDemands: todayDemands.length,
        });

        setRecentDemands(demands.slice(0, 3));
      } catch (error: any) {
        console.error('Error loading assistant data:', error);
        console.error('Error details:', error.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedUnit]);

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Meu Painel</h2>

      {/* Stats Cards */}
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
            <ClipboardList size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalDemands}</h3>
            <p style={styles.statLabel}>Demandas Abertas</p>
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
            <CheckCircle size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.totalApplications}</h3>
            <p style={styles.statLabel}>Candidaturas Recebidas</p>
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
            <Calendar size={24} color={colors.primary} />
          </div>
          <div style={styles.statContent}>
            <h3 style={styles.statValue}>{stats.todayDemands}</h3>
            <p style={styles.statLabel}>Demandas Hoje</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={styles.quickActions}>
        <h3 style={styles.subsectionTitle}>Ações Rápidas</h3>
        <div style={styles.actionsGrid}>
          <button 
            style={styles.actionButton}
            onMouseEnter={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(124, 58, 237, 0.18)';
              e.currentTarget.style.borderColor = '#a855f7';
              if (icon) icon.style.transform = 'scale(1.1) rotate(5deg)';
            }}
            onMouseLeave={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.08)';
              e.currentTarget.style.borderColor = '#d7c7ff';
              if (icon) icon.style.transform = 'scale(1) rotate(0deg)';
            }}
          >
            <div className="action-icon-circle" style={styles.actionIconCircle}>
              <ClipboardList size={28} strokeWidth={1.5} color="white" />
            </div>
            <span style={styles.actionLabel}>Nova Demanda</span>
          </button>
          <button 
            style={styles.actionButton}
            onMouseEnter={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(124, 58, 237, 0.18)';
              e.currentTarget.style.borderColor = '#a855f7';
              if (icon) icon.style.transform = 'scale(1.1) rotate(5deg)';
            }}
            onMouseLeave={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.08)';
              e.currentTarget.style.borderColor = '#d7c7ff';
              if (icon) icon.style.transform = 'scale(1) rotate(0deg)';
            }}
          >
            <div className="action-icon-circle" style={styles.actionIconCircle}>
              <Eye size={28} strokeWidth={1.5} color="white" />
            </div>
            <span style={styles.actionLabel}>Ver Candidaturas</span>
          </button>
          <button 
            style={styles.actionButton}
            onMouseEnter={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(124, 58, 237, 0.18)';
              e.currentTarget.style.borderColor = '#a855f7';
              if (icon) icon.style.transform = 'scale(1.1) rotate(5deg)';
            }}
            onMouseLeave={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.08)';
              e.currentTarget.style.borderColor = '#d7c7ff';
              if (icon) icon.style.transform = 'scale(1) rotate(0deg)';
            }}
          >
            <div className="action-icon-circle" style={styles.actionIconCircle}>
              <Calendar size={28} strokeWidth={1.5} color="white" />
            </div>
            <span style={styles.actionLabel}>Agenda</span>
          </button>
          <button 
            style={styles.actionButton}
            onMouseEnter={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(124, 58, 237, 0.18)';
              e.currentTarget.style.borderColor = '#a855f7';
              if (icon) icon.style.transform = 'scale(1.1) rotate(5deg)';
            }}
            onMouseLeave={(e) => {
              const icon = e.currentTarget.querySelector('.action-icon-circle') as HTMLElement;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.08)';
              e.currentTarget.style.borderColor = '#d7c7ff';
              if (icon) icon.style.transform = 'scale(1) rotate(0deg)';
            }}
          >
            <div className="action-icon-circle" style={styles.actionIconCircle}>
              <MessageSquare size={28} strokeWidth={1.5} color="white" />
            </div>
            <span style={styles.actionLabel}>Mensagens</span>
          </button>
        </div>
      </div>

      {/* Recent Demands */}
      <div style={styles.recentSection}>
        <h3 style={styles.subsectionTitle}>Demandas Recentes</h3>
        <div style={styles.demandsList}>
          {loading ? (
            <p style={styles.placeholderText}>Carregando...</p>
          ) : recentDemands.length > 0 ? (
            recentDemands.map((demand) => (
              <DemandCard
                key={demand.id}
                title={demand.title}
                date={new Date(demand.demand_date).toLocaleDateString('pt-BR')}
                status={demand.status === 'open' ? 'Aberta' : demand.status === 'closed' ? 'Fechada' : 'Em Andamento'}
                candidates={0}
              />
            ))
          ) : (
            <p style={styles.placeholderText}>Nenhuma demanda recente</p>
          )}
        </div>
      </div>
    </div>
  );
};

const MensagensSection: React.FC = () => {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>Mensagens</h2>
      <div style={styles.placeholder}>
        <p style={styles.placeholderText}>
          <MessageSquare size={24} color={colors.primary} style={{ marginRight: '8px', display: 'inline-block', verticalAlign: 'middle' }} />
          Suas mensagens aparecerão aqui
        </p>
      </div>
    </div>
  );
};

const DemandCard: React.FC<{
  title: string;
  date: string;
  status: string;
  candidates: number;
}> = ({ title, date, status, candidates }) => {
  const statusColor = status === 'Aberta' ? '#10b981' : '#6b7280';

  return (
    <div style={styles.demandCard}>
      <div style={styles.demandHeader}>
        <h4 style={styles.demandTitle}>{title}</h4>
        <span style={{ ...styles.statusBadge, backgroundColor: statusColor }}>
          {status}
        </span>
      </div>
      <div style={styles.demandInfo}>
        <span style={styles.demandDate}>
          <Calendar size={16} style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }} />
          {date}
        </span>
        <span style={styles.demandCandidates}>
          <Users size={16} style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }} />
          {candidates} candidatos
        </span>
      </div>
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
  quickActions: {
    marginTop: '32px',
  },
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '20px',
  },
  actionButton: {
    backgroundColor: '#ffffff',
    border: '1px solid #d7c7ff',
    borderRadius: '16px',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  actionIconCircle: {
    width: '56px',
    height: '56px',
    background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)',
  },
  actionLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2d1b69',
    textAlign: 'center',
  },
  recentSection: {
    marginTop: '32px',
  },
  demandsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  demandCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
  },
  demandHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  demandTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '16px',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '600',
  },
  demandInfo: {
    display: 'flex',
    gap: '16px',
    fontSize: '14px',
    color: '#737373',
  },
  demandDate: {},
  demandCandidates: {},
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

export default AssistantDashboard;

