import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import LoadingOverlay from '../components/LoadingOverlay';
import { applicationsApi, Application, DemandApplication } from '../services/applicationsApi';
import { demandInvitesApi } from '../services/demandInvitesApi';
import { workProofApi, WorkProof } from '../services/workProofApi';
import { useAlert } from '../hooks/useAlert';
import { Clock, Edit, CheckCircle, XCircle } from 'lucide-react';
import IconWrapper from '../components/IconWrapper';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';
import ApplicationStatusBadge from '../components/ApplicationStatusBadge';
import WorkProofForm from '../components/WorkProofForm';

interface ApplicationWithDemand extends DemandApplication {
  demand?: {
    title: string;
    description: string;
    clinic?: {
      name: string;
    };
  };
  workProof?: WorkProof | null;
}

const MyApplicationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showError, showSuccess } = useAlert();
  const [applications, setApplications] = useState<ApplicationWithDemand[]>([]);
  const [loading, setLoading] = useState(true);
  const [workProofs, setWorkProofs] = useState<Record<string, WorkProof | null>>({});
  const [loadingWorkProofs, setLoadingWorkProofs] = useState<Record<string, boolean>>({});

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'VET';
  const { menuItems } = useSidebarMenu(userRole);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('user') || '');
      const vetId = user.id;

      const response = await applicationsApi.getByVet(vetId);
      const apps = response.applications || [];
      setApplications(apps);

      // Carregar work proofs para aplicações que precisam
      const appsNeedingWorkProof = apps.filter(
        (app) => ['check_in', 'check_out', 'report_sent', 'report_approved'].includes(app.status)
      );
      for (const app of appsNeedingWorkProof) {
        loadWorkProof(app.id);
      }
    } catch (error) {
      console.error('Error loading applications:', error);
      showError('Erro ao carregar candidaturas');
    } finally {
      setLoading(false);
    }
  };

  const loadWorkProof = async (applicationId: string) => {
    try {
      setLoadingWorkProofs((prev) => ({ ...prev, [applicationId]: true }));
      const response = await workProofApi.getWorkProof(applicationId);
      setWorkProofs((prev) => ({ ...prev, [applicationId]: response.workProof }));
    } catch (error: any) {
      console.error('Error loading work proof:', error);
    } finally {
      setLoadingWorkProofs((prev) => ({ ...prev, [applicationId]: false }));
    }
  };

  const handleAcceptInvite = async (applicationId: string) => {
    try {
      await demandInvitesApi.acceptInvite(applicationId);
      showSuccess('Convite aceito com sucesso!');
      loadApplications();
    } catch (error: any) {
      showError('Erro ao aceitar convite: ' + error.message);
    }
    };

  const handleRejectInvite = async (applicationId: string) => {
    try {
      await demandInvitesApi.rejectInvite(applicationId);
      showSuccess('Convite recusado');
      loadApplications();
    } catch (error: any) {
      showError('Erro ao recusar convite: ' + error.message);
    }
  };

  // Removido getStatusBadge - usando ApplicationStatusBadge agora

  return (
    <>
    <DashboardLayout
      pageName="Minhas Candidaturas"
      menuItems={menuItems}
    >
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Minhas Candidaturas</h1>
          <p style={styles.subtitle}>
            Acompanhe o status das suas candidaturas às demandas
          </p>
        </div>

        {applications.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <IconWrapper icon={Edit} size={64} color="#a3a3a3" />
            </div>
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
                  <ApplicationStatusBadge status={application.status} />
                </div>

                {application.message && (
                  <div style={styles.messageBox}>
                    <p style={styles.messageLabel}>Sua mensagem:</p>
                    <p style={styles.messageText}>{application.message}</p>
                  </div>
                )}

                {/* Botões de ação para convites */}
                {application.status === 'invited' && (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '16px', marginBottom: '16px' }}>
                    <button
                      onClick={() => handleAcceptInvite(application.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        backgroundColor: colors.success,
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                      }}
                    >
                      <CheckCircle size={16} />
                      Aceitar Convite
                    </button>
                    <button
                      onClick={() => handleRejectInvite(application.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        backgroundColor: colors.danger,
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                      }}
                    >
                      <XCircle size={16} />
                      Recusar Convite
                    </button>
                  </div>
                )}

                {/* WorkProofForm para aplicações aprovadas ou em progresso */}
                {['approved', 'check_in', 'check_out', 'report_sent', 'report_approved'].includes(application.status) && (
                  <div style={{ marginTop: '16px', marginBottom: '16px' }}>
                    <WorkProofForm
                      applicationId={application.id}
                      currentStatus={application.status}
                      workProof={workProofs[application.id] || null}
                      onUpdate={() => {
                        loadApplications();
                        loadWorkProof(application.id);
                      }}
                    />
                  </div>
                )}

                <div style={styles.cardFooter}>
                  <span style={styles.dateText}>
                    {application.status === 'invited' && application.invited_at
                      ? `Convite recebido em ${new Date(application.invited_at).toLocaleDateString('pt-BR')}`
                      : application.applied_at
                      ? `Candidatura enviada em ${new Date(application.applied_at).toLocaleDateString('pt-BR')}`
                      : `Criado em ${new Date(application.created_at || Date.now()).toLocaleDateString('pt-BR')}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
    <LoadingOverlay visible={loading} label="Carregando candidaturas..." />
    </>
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
    display: 'flex',
    justifyContent: 'center',
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
    display: 'flex',
    justifyContent: 'center',
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

