import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import CalendarView from '../components/CalendarView';
import { demandsApi, clinicsApi, applicationsApi } from '../services';
import { Demand } from '../services/demandsApi';
import { useAlert } from '../hooks/useAlert';

interface Clinic {
  id: string;
  name: string;
  address: string;
}

const DemandsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning } = useAlert();
  const [demands, setDemands] = useState<Demand[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = user?.user_metadata?.role || user?.role;

  // Menu items based on user role
  const getMenuItems = (): MenuItem[] => {
    if (userRole === 'clinic') {
      return [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: '📊',
          action: 'navigate',
          path: '/clinic-dashboard',
        },
        {
          id: 'demandas',
          label: 'Ver Todas Demandas',
          icon: '📋',
          action: 'navigate',
          path: '/demands',
        },
        {
          id: 'criar-demanda',
          label: 'Criar Nova Demanda',
          icon: '➕',
          action: 'navigate',
          path: '/create-demand',
        },
        {
          id: 'perfil',
          label: 'Perfil',
          icon: '👤',
          action: 'navigate',
          path: '/clinic-profile',
        },
        {
          id: 'logout',
          label: 'Sair',
          icon: '🚪',
          action: 'logout',
        },
      ];
    } else {
      // Vet menu
      return [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: '📊',
          action: 'navigate',
          path: '/vet-dashboard',
        },
        {
          id: 'demandas',
          label: 'Demandas Disponíveis',
          icon: '📋',
          action: 'navigate',
          path: '/demands',
        },
        {
          id: 'candidaturas',
          label: 'Minhas Candidaturas',
          icon: '📝',
          action: 'navigate',
          path: '/my-applications',
        },
        {
          id: 'perfil',
          label: 'Meu Perfil',
          icon: '👤',
          action: 'navigate',
          path: '/vet-profile',
        },
        {
          id: 'logout',
          label: 'Sair',
          icon: '🚪',
          action: 'logout',
        },
      ];
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carregar demandas abertas (filtered by user role and user_id for clinics)
      const demandsResult = await demandsApi.getOpen(userRole, user.id);
      setDemands(demandsResult.demands);
      
      // Carregar clínicas
      const clinicsResult = await clinicsApi.getAll();
      setClinics(clinicsResult.clinics);
      
    } catch (error: any) {
      showError('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getClinicName = (clinicId: string) => {
    const clinic = clinics.find(c => c.id === clinicId);
    return clinic?.name || 'Clínica não encontrada';
  };

  const handleApply = async (demand: Demand) => {
    if (userRole !== 'vet') {
      showWarning('Apenas veterinários podem se candidatar a demandas');
      return;
    }
    setSelectedDemand(demand);
  };

  const submitApplication = async () => {
    if (!selectedDemand) return;

    try {
      setIsApplying(true);
      await applicationsApi.apply({
        demand_id: selectedDemand.id,
        vet_id: user.id,
        message: applicationMessage,
      });

      showSuccess('Candidatura enviada com sucesso!');
      setSelectedDemand(null);
      setApplicationMessage('');
    } catch (error: any) {
      showError('Erro ao enviar candidatura: ' + error.message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <DashboardLayout
      pageName="Demandas"
      menuItems={getMenuItems()}
      notificationCount={0}
    >
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Demandas Abertas</h1>
            <p style={styles.subtitle}>
              Encontre oportunidades de trabalho na sua área
            </p>
          </div>

          {/* View Toggle */}
          <div style={styles.viewToggle}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                ...styles.toggleButton,
                ...(viewMode === 'list' && styles.toggleButtonActive),
              }}
            >
              📋 Lista
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              style={{
                ...styles.toggleButton,
                ...(viewMode === 'calendar' && styles.toggleButtonActive),
              }}
            >
              📅 Calendário
            </button>
          </div>
        </div>

        {loading ? (
          <div style={styles.loadingContainer}>
            <div style={styles.loadingSpinner}>⏳</div>
            <p style={styles.loadingText}>Carregando demandas...</p>
          </div>
        ) : demands.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📋</div>
            <h3 style={styles.emptyTitle}>Nenhuma demanda aberta</h3>
            <p style={styles.emptyText}>
              No momento não há demandas disponíveis. Volte mais tarde!
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div style={styles.demandsGrid}>
            {demands.map((demand) => (
              <div key={demand.id} style={styles.demandCard}>
                <div style={styles.cardHeader}>
                  <h2 style={styles.demandTitle}>{demand.title}</h2>
                  <span
                    style={{
                      ...styles.statusBadge,
                      backgroundColor: demand.status === 'open' ? '#22c55e' : '#f59e0b',
                    }}
                  >
                    {demand.status === 'open' ? 'Aberta' : demand.status}
                  </span>
                </div>

                <p style={styles.demandDescription}>{demand.description}</p>

                <div style={styles.cardFooter}>
                  <div style={styles.demandInfo}>
                    <span style={styles.clinicName}>
                      {getClinicName(demand.clinic_id)}
                    </span>
                    {demand.payment && (
                      <span style={styles.payment}>
                        R$ {demand.payment.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div style={styles.demandActions}>
                    <span style={styles.date}>
                      {new Date(demand.created_at).toLocaleDateString('pt-BR')}
                    </span>
                    {userRole === 'vet' && (
                      <button
                        onClick={() => handleApply(demand)}
                        style={styles.applyButton}
                      >
                        Candidatar-se
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <CalendarView
            demands={demands}
            onDemandClick={(demand) => handleApply(demand)}
          />
        )}
      </div>

      {/* Application Modal */}
      {selectedDemand && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>Candidatar-se à Demanda</h2>

            <div style={styles.modalDemandInfo}>
              <h3 style={styles.modalDemandTitle}>{selectedDemand.title}</h3>
              <p style={styles.modalDemandDescription}>
                {selectedDemand.description}
              </p>
            </div>

            <div style={styles.modalInputGroup}>
              <label style={styles.modalLabel}>
                Mensagem para a clínica (opcional)
              </label>
              <textarea
                value={applicationMessage}
                onChange={(e) => setApplicationMessage(e.target.value)}
                placeholder="Conte um pouco sobre você e por que se interessa por esta vaga..."
                style={styles.modalTextarea}
              />
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={submitApplication}
                disabled={isApplying}
                style={{
                  ...styles.modalButton,
                  ...styles.modalButtonPrimary,
                  opacity: isApplying ? 0.7 : 1,
                }}
              >
                {isApplying ? 'Enviando...' : 'Enviar Candidatura'}
              </button>
              <button
                onClick={() => {
                  setSelectedDemand(null);
                  setApplicationMessage('');
                }}
                style={{
                  ...styles.modalButton,
                  ...styles.modalButtonSecondary,
                }}
                disabled={isApplying}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
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
  viewToggle: {
    display: 'flex',
    gap: '8px',
    backgroundColor: '#f5f5f5',
    padding: '4px',
    borderRadius: '12px',
  },
  toggleButton: {
    padding: '10px 20px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#737373',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  toggleButtonActive: {
    backgroundColor: '#ffffff',
    color: '#7c3aed',
    fontWeight: '600',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '24px',
  },
  demandCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  demandTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    flex: 1,
    margin: 0,
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  demandDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    lineHeight: '1.6',
    margin: 0,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardFooter: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: 'auto',
  },
  demandInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clinicName: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
  },
  payment: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '700',
    color: '#22c55e',
  },
  demandActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#a3a3a3',
  },
  applyButton: {
    padding: '8px 16px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '560px',
    width: '100%',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '24px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '24px',
  },
  modalDemandInfo: {
    marginBottom: '24px',
  },
  modalDemandTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#404040',
    marginBottom: '8px',
  },
  modalDemandDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
  },
  modalInputGroup: {
    marginBottom: '24px',
  },
  modalLabel: {
    display: 'block',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#404040',
    marginBottom: '8px',
  },
  modalTextarea: {
    width: '100%',
    minHeight: '120px',
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    resize: 'vertical',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
  },
  modalButton: {
    flex: 1,
    padding: '12px 24px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  modalButtonPrimary: {
    backgroundColor: '#7c3aed',
    color: '#ffffff',
  },
  modalButtonSecondary: {
    backgroundColor: '#fafafa',
    color: '#525252',
    border: '1px solid #e5e5e5',
  },
};

export default DemandsPage;
