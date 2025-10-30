import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { applicationsApi, Application } from '../services/applicationsApi';
import { useAlert } from '../hooks/useAlert';
import { BarChart2, ClipboardList, FileText, User, LogOut } from 'lucide-react';
import colors from '../styles/colors';

interface ApplicationWithDemand extends Application {
  demand?: {
    title: string;
    description: string;
    clinic?: {
      name: string;
    };
  };
}

const MyApplicationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showError } = useAlert();
  const [applications, setApplications] = useState<ApplicationWithDemand[]>([]);
  const [loading, setLoading] = useState(true);

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/vet-dashboard',
    },
    {
      id: 'demandas',
      label: 'Demandas Disponíveis',
      icon: <ClipboardList size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'candidaturas',
      label: 'Minhas Candidaturas',
      icon: <FileText size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/my-applications',
    },
    {
      id: 'perfil',
      label: 'Meu Perfil',
      icon: <User size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/vet-profile',
    },
    {
      id: 'logout',
      label: 'Sair',
      icon: <LogOut size={20} color={colors.primary} />,
      action: 'logout',
    },
  ];

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const vetId = user.id;

      const response = await applicationsApi.getByVet(vetId);
      setApplications(response.applications || []);
    } catch (error) {
      console.error('Error loading applications:', error);
      showError('Erro ao carregar candidaturas');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; text: string }> = {
      pending: { color: '#f59e0b', text: 'Pendente' },
      accepted: { color: '#22c55e', text: 'Aceita' },
      rejected: { color: '#ef4444', text: 'Rejeitada' },
    };

    const badge = badges[status] || badges.pending;
    return (
      <span
        style={{
          ...styles.statusBadge,
          backgroundColor: badge.color,
        }}
      >
        {badge.text}
      </span>
    );
  };

  return (
    <DashboardLayout
      pageName="Minhas Candidaturas"
      menuItems={menuItems}
      notificationCount={0}
    >
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Minhas Candidaturas</h1>
          <p style={styles.subtitle}>
            Acompanhe o status das suas candidaturas às demandas
          </p>
        </div>

        {loading ? (
          <div style={styles.loadingContainer}>
            <div style={styles.loadingSpinner}>⏳</div>
            <p style={styles.loadingText}>Carregando candidaturas...</p>
          </div>
        ) : applications.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📝</div>
            <h3 style={styles.emptyTitle}>Nenhuma candidatura ainda</h3>
            <p style={styles.emptyText}>
              Vá para a página de demandas e candidate-se às vagas disponíveis
            </p>
            <button
              onClick={() => navigate('/demands')}
              style={styles.emptyButton}
            >
              Ver Demandas
            </button>
          </div>
        ) : (
          <div style={styles.applicationsList}>
            {applications.map((application) => (
              <div key={application.id} style={styles.applicationCard}>
                <div style={styles.cardHeader}>
                  <div style={styles.cardHeaderContent}>
                    <h3 style={styles.applicationTitle}>
                      {application.demand?.title || 'Demanda não encontrada'}
                    </h3>
                    <p style={styles.clinicName}>
                      {application.demand?.clinic?.name || 'Clínica'}
                    </p>
                  </div>
                  {getStatusBadge(application.status)}
                </div>

                {application.message && (
                  <div style={styles.messageBox}>
                    <p style={styles.messageLabel}>Sua mensagem:</p>
                    <p style={styles.messageText}>{application.message}</p>
                  </div>
                )}

                <div style={styles.cardFooter}>
                  <span style={styles.dateText}>
                    Candidatura enviada em{' '}
                    {new Date(application.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '32px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '8px',
  },
  subtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '64px 0',
  },
  loadingSpinner: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  loadingText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
  },
  emptyState: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '8px',
  },
  emptyText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
    marginBottom: '24px',
  },
  emptyButton: {
    padding: '12px 24px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  applicationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  applicationCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    transition: 'box-shadow 0.2s ease',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
    gap: '16px',
  },
  cardHeaderContent: {
    flex: 1,
  },
  applicationTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '4px',
  },
  clinicName: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
  },
  statusBadge: {
    padding: '6px 12px',
    borderRadius: '20px',
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  messageBox: {
    backgroundColor: '#fafafa',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '16px',
  },
  messageLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#404040',
    marginBottom: '4px',
  },
  messageText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#a3a3a3',
  },
};

export default MyApplicationsPage;

