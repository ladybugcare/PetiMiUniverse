import React, { useState, useEffect } from 'react';
import DashboardHeader from '../components/DashboardHeader';
import DashboardSidebar from '../components/DashboardSidebar';
import PositionCard from '../components/PositionCard';
import { demandPositionsApi, PositionWithAvailability } from '../services/demandPositionsApi';
import { useAlert } from '../hooks/useAlert';
import { BarChart2, Briefcase, ClipboardList, User, LogOut } from 'lucide-react';
import colors from '../styles/colors';

const VetPositionsPage: React.FC = () => {
  const { showSuccess, showError, showConfirm } = useAlert();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<PositionWithAvailability[]>([]);
  const [filteredPositions, setFilteredPositions] = useState<PositionWithAvailability[]>([]);
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [applyingPositionId, setApplyingPositionId] = useState<string | null>(null);

  const [applicationMessage, setApplicationMessage] = useState('');
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);

  const user = JSON.parse(localStorage.getItem('user') || '');
  const vetId = user.id;

  useEffect(() => {
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filterPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, specialtyFilter, statusFilter]);

  const loadPositions = async () => {
    try {
      setLoading(true);
      const result = await demandPositionsApi.getAvailablePositions({ vet_id: vetId });
      setPositions(result.positions);
    } catch (error: any) {
      console.error('Error loading positions:', error);
      showError('Erro ao carregar posições: ' + (error.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  const filterPositions = () => {
    let filtered = [...positions];

    // Filtro por especialidade
    if (specialtyFilter !== 'all') {
      filtered = filtered.filter((p) => p.specialty === specialtyFilter);
    }

    // Filtro por status da candidatura
    if (statusFilter !== 'all') {
      if (statusFilter === 'available') {
        filtered = filtered.filter((p) => !p.application_status);
      } else if (statusFilter === 'applied') {
        filtered = filtered.filter((p) => p.application_status === 'pending');
      } else if (statusFilter === 'accepted') {
        filtered = filtered.filter((p) => p.application_status === 'accepted');
      }
    }

    setFilteredPositions(filtered);
  };

  const handleApplyClick = (positionId: string) => {
    setSelectedPositionId(positionId);
    setApplicationMessage('');
    setShowApplicationModal(true);
  };

  const handleApplyConfirm = async () => {
    if (!selectedPositionId) return;

    try {
      setApplyingPositionId(selectedPositionId);
      await demandPositionsApi.applyToPosition({
        position_id: selectedPositionId,
        vet_id: vetId,
        message: applicationMessage,
      });
      showSuccess('Candidatura enviada com sucesso!');
      setShowApplicationModal(false);
      setApplicationMessage('');
      setSelectedPositionId(null);
      await loadPositions();
    } catch (error: any) {
      console.error('Error applying to position:', error);
      showError('Erro ao candidatar-se: ' + (error.message || 'Tente novamente.'));
    } finally {
      setApplyingPositionId(null);
    }
  };

  const handleCancelApplication = async (positionId: string) => {
    showConfirm('Tem certeza que deseja cancelar sua candidatura?', async () => {
      try {
        // Encontrar o application_id
        const position = positions.find((p) => p.id === positionId);
        if (!position) return;

        // Como não temos o application_id no card, vamos recarregar após cancelar
        // Idealmente, deveria ser retornado no getAvailablePositions
        showError('Funcionalidade de cancelamento em desenvolvimento.');
      } catch (error: any) {
        console.error('Error cancelling application:', error);
        showError('Erro ao cancelar candidatura: ' + (error.message || 'Tente novamente.'));
      }
    });
  };

  const getUniqueSpecialties = () => {
    const specialties = new Set(positions.map((p) => p.specialty));
    return Array.from(specialties).sort();
  };

  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'navigate' as const,
      path: '/vet-dashboard',
    },
    {
      id: 'positions',
      label: 'Posições Disponíveis',
      icon: <Briefcase size={20} color={colors.primary} />,
      action: 'navigate' as const,
      path: '/vet-positions',
    },
    {
      id: 'applications',
      label: 'Minhas Candidaturas',
      icon: <ClipboardList size={20} color={colors.primary} />,
      action: 'navigate' as const,
      path: '/vet-applications',
    },
    {
      id: 'profile',
      label: 'Meu Perfil',
      icon: <User size={20} color={colors.primary} />,
      action: 'navigate' as const,
      path: '/vet-profile',
    },
    // {
    //   id: 'logout',
    //   label: 'Sair',
<<<<<<< HEAD
    //   icon: <LogOut size={20} color={colors.primary} />,
=======
        //   icon: <LogOut size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
    //   action: 'logout' as const,
    // },
  ];

  return (
    <div style={styles.container}>
      <DashboardHeader
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        pageName="Posições Disponíveis"
      />

      <div style={styles.mainContainer}>
        <DashboardSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          menuItems={menuItems}
          userName={user.name || 'Veterinário'}
          userEmail={user.email || ''}
        />

        <main style={styles.content}>
          <div style={styles.pageHeader}>
            <div>
              <h1 style={styles.pageTitle}>Posições Disponíveis</h1>
              <p style={styles.pageSubtitle}>
                Encontre oportunidades profissionais e candidate-se
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div style={styles.filters}>
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Especialidade</label>
              <select
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
                style={styles.filterSelect}
              >
                <option value="all">Todas</option>
                {getUniqueSpecialties().map((specialty) => (
                  <option key={specialty} value={specialty}>
                    {specialty}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={styles.filterSelect}
              >
                <option value="all">Todos</option>
                <option value="available">Disponíveis</option>
                <option value="applied">Candidaturas Pendentes</option>
                <option value="accepted">Aceito</option>
              </select>
            </div>

            <button onClick={loadPositions} style={styles.refreshButton}>
              🔄 Atualizar
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div style={styles.loading}>
              <div style={styles.spinner} />
              <p>Carregando posições...</p>
            </div>
          )}

          {/* Lista de Posições */}
          {!loading && filteredPositions.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>🔍</div>
              <h3 style={styles.emptyTitle}>Nenhuma posição encontrada</h3>
              <p style={styles.emptyText}>
                {positions.length === 0
                  ? 'Não há posições disponíveis no momento.'
                  : 'Nenhuma posição corresponde aos filtros selecionados.'}
              </p>
            </div>
          )}

          {!loading && filteredPositions.length > 0 && (
            <div style={styles.positionsGrid}>
              {filteredPositions.map((position) => (
                <PositionCard
                  key={position.id}
                  position={position}
                  onApply={handleApplyClick}
                  onCancel={handleCancelApplication}
                  loading={applyingPositionId === position.id}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Modal de Candidatura */}
      {showApplicationModal && (
        <div style={styles.modalOverlay} onClick={() => setShowApplicationModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Candidatar-se à Posição</h2>
            <p style={styles.modalSubtitle}>
              Escreva uma mensagem para se destacar (opcional):
            </p>
            <textarea
              value={applicationMessage}
              onChange={(e) => setApplicationMessage(e.target.value)}
              placeholder="Ex: Tenho 5 anos de experiência em cirurgias ortopédicas..."
              style={styles.modalTextarea}
              rows={6}
            />
            <div style={styles.modalActions}>
              <button
                onClick={() => setShowApplicationModal(false)}
                style={styles.modalCancelButton}
              >
                Cancelar
              </button>
              <button
                onClick={handleApplyConfirm}
                style={styles.modalConfirmButton}
                disabled={!!applyingPositionId}
              >
                {applyingPositionId ? 'Enviando...' : 'Confirmar Candidatura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#fafafa',
  },
  mainContainer: {
    display: 'flex',
    flex: 1,
    paddingTop: '70px',
  },
  content: {
    flex: 1,
    padding: '32px',
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%',
  },
  pageHeader: {
    marginBottom: '32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#262626',
    margin: '0 0 8px 0',
  },
  pageSubtitle: {
    fontSize: '16px',
    color: '#737373',
    margin: 0,
  },
  filters: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  filterLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#525252',
  },
  filterSelect: {
    padding: '10px 14px',
    fontSize: '14px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    minWidth: '180px',
  },
  refreshButton: {
    padding: '10px 20px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    color: '#737373',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f4f6',
    borderTop: '4px solid #7c3aed',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  positionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '24px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '8px',
  },
  emptyText: {
    fontSize: '16px',
    color: '#737373',
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
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '500px',
    width: '90%',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#262626',
    marginBottom: '8px',
  },
  modalSubtitle: {
    fontSize: '14px',
    color: '#737373',
    marginBottom: '16px',
  },
  modalTextarea: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    resize: 'vertical',
    marginBottom: '24px',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
  },
  modalCancelButton: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#f3f4f6',
    color: '#262626',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  modalConfirmButton: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

export default VetPositionsPage;

