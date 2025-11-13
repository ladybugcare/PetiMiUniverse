import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import LoadingOverlay from '../components/LoadingOverlay';
import { applicationsApi, Application } from '../services/applicationsApi';
import { demandsApi } from '../services/demandsApi';
import { useAlert } from '../hooks/useAlert';
import { Settings } from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';

interface DemandWithApplications {
  demandId: string;
  title: string;
  description?: string;
  applications: Application[];
  pendingCount: number;
}

const ClinicApplicationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const { showSuccess, showError, showConfirm } = useAlert();
  
  const [loading, setLoading] = useState(false);
  const [demandsWithApplications, setDemandsWithApplications] = useState<DemandWithApplications[]>([]);
  const [selectedDemandId, setSelectedDemandId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [hoveredManageButton, setHoveredManageButton] = useState<string | null>(null);

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'CADMIN';
  const { menuItems } = useSidebarMenu(userRole);

  const clinicId = user?.id || '';
  
  // Get status filter from query params
  const statusFilter = searchParams.get('status');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load applications for clinic
      const applicationsResult = await applicationsApi.getByClinic(clinicId);
      let applications = applicationsResult.applications || [];
      
      // Filter by status if statusFilter is provided
      if (statusFilter === 'pending') {
        applications = applications.filter(app => app.status === 'pending');
      }
      
      // Get unique demand IDs
      const demandIds = Array.from(new Set(applications.map(app => app.demand_id)));
      
      // Load demands to get titles
      const demandsMap = new Map();
      for (const demandId of demandIds) {
        try {
          const demandResult = await demandsApi.getById(demandId);
          if (demandResult.demand) {
            demandsMap.set(demandId, demandResult.demand);
          }
        } catch (error) {
          console.error(`Error loading demand ${demandId}:`, error);
        }
      }
      
      // Group applications by demand
      const grouped: DemandWithApplications[] = [];
      demandIds.forEach(demandId => {
        const demandApps = applications.filter(app => app.demand_id === demandId);
        const pendingApps = demandApps.filter(app => app.status === 'pending');
        const demand = demandsMap.get(demandId);
        
        if (demand || demandApps.length > 0) {
          grouped.push({
            demandId,
            title: demand?.title || 'Demanda não encontrada',
            description: demand?.description,
            applications: demandApps,
            pendingCount: pendingApps.length,
          });
        }
      });
      
      // Sort by pending count (descending)
      grouped.sort((a, b) => b.pendingCount - a.pendingCount);
      
      setDemandsWithApplications(grouped);
    } catch (error: any) {
      console.error('Error loading applications:', error);
      showError('Erro ao carregar candidaturas: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (applicationId: string) => {
    showConfirm('Tem certeza que deseja aceitar este candidato?', async () => {
      try {
        setProcessingId(applicationId);
        await applicationsApi.updateStatus(applicationId, 'accepted');
        showSuccess('Candidato aceito com sucesso!');
        await loadData();
      } catch (error: any) {
        console.error('Error accepting application:', error);
        showError('Erro ao aceitar candidato: ' + (error.message || ''));
      } finally {
        setProcessingId(null);
      }
    });
  };

  const handleReject = async (applicationId: string) => {
    showConfirm('Tem certeza que deseja rejeitar este candidato?', async () => {
      try {
        setProcessingId(applicationId);
        await applicationsApi.updateStatus(applicationId, 'rejected');
        showSuccess('Candidatura rejeitada');
        await loadData();
      } catch (error: any) {
        console.error('Error rejecting application:', error);
        showError('Erro ao rejeitar candidato: ' + (error.message || ''));
      } finally {
        setProcessingId(null);
      }
    });
  };

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; color: string; bgColor: string } } = {
      applied: { label: 'Pendente', color: '#92400e', bgColor: '#fef3c7' },
      pending: { label: 'Pendente', color: '#92400e', bgColor: '#fef3c7' },
      accepted: { label: 'Aceito', color: '#065f46', bgColor: '#d1fae5' },
      rejected: { label: 'Rejeitado', color: '#991b1b', bgColor: '#fee2e2' },
    };

    const statusInfo = statusMap[status] || { label: status, color: '#6b7280', bgColor: '#f3f4f6' };

    return (
      <span
        style={{
          ...styles.statusBadge,
          backgroundColor: statusInfo.bgColor,
          color: statusInfo.color,
        }}
      >
        {statusInfo.label}
      </span>
    );
  };

  const selectedDemand = selectedDemandId
    ? demandsWithApplications.find(d => d.demandId === selectedDemandId)
    : null;

  return (
    <>
      <DashboardLayout pageName="Candidaturas" menuItems={menuItems}>
        <div style={styles.container}>
          <div style={styles.header}>
            <div>
              <h1 style={styles.title}>Candidaturas</h1>
              <p style={styles.subtitle}>
                {statusFilter === 'pending' 
                  ? 'Gerencie as candidaturas pendentes para suas demandas'
                  : 'Visualize e gerencie todas as candidaturas recebidas'}
              </p>
            </div>
          </div>

          {demandsWithApplications.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📋</div>
              <h3 style={styles.emptyTitle}>
                {statusFilter === 'pending' 
                  ? 'Nenhuma candidatura pendente' 
                  : 'Nenhuma candidatura recebida'}
              </h3>
              <p style={styles.emptyText}>
                {statusFilter === 'pending'
                  ? 'Não há candidaturas pendentes no momento.'
                  : 'Ainda não há candidaturas para suas demandas.'}
              </p>
            </div>
          ) : (
            <div style={styles.demandsGrid}>
              {demandsWithApplications.map((demandWithApps) => {
                const isExpanded = selectedDemandId === demandWithApps.demandId;
                const pendingApps = demandWithApps.applications.filter(
                  app => app.status === 'pending'
                );

                return (
                  <div key={demandWithApps.demandId} style={styles.demandCard}>
                    <div style={styles.cardHeader}>
                      <div style={styles.cardHeaderContent}>
                        <h3 style={styles.demandTitle}>{demandWithApps.title}</h3>
                        {demandWithApps.description && (
                          <p style={styles.demandDescription}>{demandWithApps.description}</p>
                        )}
                      </div>
                      <div style={styles.badgeContainer}>
                        {pendingApps.length > 0 && (
                          <span style={styles.pendingBadge}>
                            {pendingApps.length} {pendingApps.length === 1 ? 'pendente' : 'pendentes'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={styles.cardFooter}>
                      <div style={styles.stats}>
                        <span style={styles.statText}>
                          Total: {demandWithApps.applications.length} candidaturas
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedDemandId(isExpanded ? null : demandWithApps.demandId)}
                        onMouseEnter={() => setHoveredManageButton(demandWithApps.demandId)}
                        onMouseLeave={() => setHoveredManageButton(null)}
                        style={{
                          ...styles.manageButton,
                          backgroundColor: hoveredManageButton === demandWithApps.demandId ? colors.primaryDark : colors.primary,
                        }}
                      >
                        <Settings size={16} style={{ marginRight: '6px' }} />
                        {isExpanded ? 'Ocultar' : 'Gerenciar'}
                      </button>
                    </div>

                    {isExpanded && (
                      <div style={styles.applicationsSection}>
                        <h4 style={styles.sectionTitle}>
                          Candidatos ({demandWithApps.applications.length})
                        </h4>
                        {demandWithApps.applications.length === 0 ? (
                          <p style={styles.emptyText}>Nenhum candidato ainda</p>
                        ) : (
                          <div style={styles.applicationsList}>
                            {demandWithApps.applications.map((app) => (
                              <div key={app.id} style={styles.applicationCard}>
                                <div style={styles.applicationHeader}>
                                  <div>
                                    <h4 style={styles.vetName}>
                                      {app.vets?.name || 'Nome não disponível'}
                                    </h4>
                                    {app.vets?.email && (
                                      <p style={styles.vetEmail}>{app.vets.email}</p>
                                    )}
                                    {app.vets?.crmv && (
                                      <p style={styles.vetCrmv}>CRMV: {app.vets.crmv}</p>
                                    )}
                                  </div>
                                  {getStatusBadge(app.status)}
                                </div>

                                {app.message && (
                                  <div style={styles.messageBox}>
                                    <p style={styles.messageLabel}>Mensagem do candidato:</p>
                                    <p style={styles.messageText}>{app.message}</p>
                                  </div>
                                )}

                                <div style={styles.applicationFooter}>
                                  <span style={styles.dateText}>
                                    Candidatura em {new Date(app.applied_at || app.created_at).toLocaleDateString('pt-BR')}
                                  </span>
                                  {app.status === 'pending' && (
                                    <div style={styles.actionButtons}>
                                      <button
                                        onClick={() => handleAccept(app.id)}
                                        disabled={processingId === app.id}
                                        style={{
                                          ...styles.actionButton,
                                          ...styles.acceptButton,
                                          opacity: processingId === app.id ? 0.6 : 1,
                                        }}
                                      >
                                        {processingId === app.id ? 'Processando...' : 'Aceitar'}
                                      </button>
                                      <button
                                        onClick={() => handleReject(app.id)}
                                        disabled={processingId === app.id}
                                        style={{
                                          ...styles.actionButton,
                                          ...styles.rejectButton,
                                          opacity: processingId === app.id ? 0.6 : 1,
                                        }}
                                      >
                                        {processingId === app.id ? 'Processando...' : 'Rejeitar'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
    maxWidth: '1400px',
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
  emptyState: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '24px',
  },
  emptyTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  emptyText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
  },
  demandsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '24px',
  },
  demandCard: {
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
  },
  cardHeaderContent: {
    flex: 1,
  },
  demandTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '8px',
    margin: 0,
  },
  demandDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    marginTop: '8px',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  badgeContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '8px',
  },
  pendingBadge: {
    padding: '6px 12px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '16px',
    borderTop: '1px solid #e5e5e5',
  },
  stats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
  },
  manageButton: {
    padding: '8px 16px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s ease',
  },
  applicationsSection: {
    marginTop: '24px',
    paddingTop: '24px',
    borderTop: '1px solid #e5e5e5',
  },
  sectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  applicationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  applicationCard: {
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid #e5e5e5',
  },
  applicationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  vetName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '4px',
    margin: 0,
  },
  vetEmail: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: '2px 0',
  },
  vetCrmv: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: '2px 0',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  messageBox: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '12px',
    border: '1px solid #e5e5e5',
  },
  messageLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: '600',
    color: '#525252',
    marginBottom: '4px',
  },
  messageText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    margin: 0,
  },
  applicationFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
  },
  dateText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#a3a3a3',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
  },
  actionButton: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
  },
  acceptButton: {
    backgroundColor: '#10b981',
    color: '#ffffff',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
  },
};

export default ClinicApplicationsPage;

