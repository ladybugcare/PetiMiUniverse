import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import LoadingOverlay from '../components/LoadingOverlay';
import { demandsApi, clinicsApi } from '../services';
import { Demand } from '../services/demandsApi';
import { useAlert } from '../hooks/useAlert';
import { BarChart2, Building2, Stethoscope, ClipboardList, Users, LogOut, MessageCircle, Eye, Edit, Trash2 } from 'lucide-react';
import colors from '../styles/colors';

interface Application {
  id: string;
  vet_id: string;
  demand_id: string;
  status: string;
  message?: string;
  created_at: string;
  vets?: {
    name: string;
    email: string;
    crmv: string;
    specialties: string[];
  };
}

const AdminDemandsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError, showConfirm } = useAlert();
  const [demands, setDemands] = useState<Demand[]>([]);
  const [filteredDemands, setFilteredDemands] = useState<Demand[]>([]);
  const [clinics, setClinics] = useState<any[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Demand>>({});

  const itemsPerPage = 20;

  // Check authentication
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userRole = user?.user_metadata?.role || user?.role;
    
    if (!user || !user.id || userRole !== 'admin') {
      navigate('/login');
      return;
    }
    
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [demandsResult, clinicsResult] = await Promise.all([
        demandsApi.getAll(),
        clinicsApi.getAll(),
      ]);
      setDemands(demandsResult.demands);
      setFilteredDemands(demandsResult.demands);
      setClinics(clinicsResult.clinics);
    } catch (error: any) {
      showError('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getClinicName = (clinicId: string) => {
    const clinic = clinics.find((c) => c.id === clinicId);
    return clinic?.name || 'N/A';
  };

  // Filter functionality
  useEffect(() => {
    let filtered = demands.filter((demand) => {
      const searchLower = searchQuery.toLowerCase();
      const clinic = clinics.find((c) => c.id === demand.clinic_id);
      const clinicName = (clinic?.name || 'N/A').toLowerCase();
      
      return (
        demand.title.toLowerCase().includes(searchLower) ||
        clinicName.includes(searchLower)
      );
    });

    if (statusFilter !== 'all') {
      filtered = filtered.filter((demand) => demand.status === statusFilter);
    }

    setFilteredDemands(filtered);
    setCurrentPage(1);
  }, [searchQuery, statusFilter, demands, clinics]);

  // Pagination
  const totalPages = Math.ceil(filteredDemands.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentDemands = filteredDemands.slice(startIndex, endIndex);

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin-dashboard' },
    { id: 'clinics', label: 'Clínicas', icon: <Building2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin/clinics' },
    { id: 'vets', label: 'Veterinários', icon: <Stethoscope size={20} color={colors.primary} />, action: 'navigate', path: '/admin/vets' },
    { id: 'demands', label: 'Demandas', icon: <ClipboardList size={20} color={colors.primary} />, action: 'navigate', path: '/admin/demands' },
    { id: 'support', label: 'Tickets de Suporte', icon: <MessageCircle size={20} color={colors.primary} />, action: 'navigate', path: '/admin/support-tickets' },
    { id: 'users', label: 'Usuários', icon: <Users size={20} color={colors.primary} />, action: 'navigate', path: '/admin/users' },
    { id: 'logout', label: 'Sair', icon: <LogOut size={20} color={colors.primary} />, action: 'logout' },
  ];

  const handleView = async (demand: Demand) => {
    setSelectedDemand(demand);
    try {
      const { applications: apps } = await demandsApi.getApplications(demand.id);
      setApplications(apps);
    } catch (error) {
      setApplications([]);
    }
    setShowViewModal(true);
  };

  const handleEdit = (demand: Demand) => {
    setSelectedDemand(demand);
    setEditFormData(demand);
    setShowEditModal(true);
  };

  const handleDelete = (demand: Demand) => {
    showConfirm(
      `Tem certeza que deseja excluir a demanda "${demand.title}"? Esta ação não pode ser desfeita.`,
      async () => {
        try {
          await demandsApi.delete(demand.id);
          showSuccess('Demanda excluída com sucesso!');
          loadData();
        } catch (error: any) {
          showError('Erro ao excluir demanda: ' + error.message);
        }
      },
      'Confirmar Exclusão'
    );
  };

  const handleSaveEdit = async () => {
    if (!selectedDemand) return;

    try {
      await demandsApi.update(selectedDemand.id, editFormData);
      showSuccess('Demanda atualizada com sucesso!');
      setShowEditModal(false);
      loadData();
    } catch (error: any) {
      showError('Erro ao atualizar demanda: ' + error.message);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: { label: string; color: string } } = {
      open: { label: 'Aberta', color: '#10b981' },
      in_progress: { label: 'Em Progresso', color: '#3b82f6' },
      closed: { label: 'Fechada', color: '#737373' },
      cancelled: { label: 'Cancelada', color: '#ef4444' },
    };

    const config = statusConfig[status] || statusConfig.open;

    return (
      <span
        style={{
          ...styles.statusBadge,
          backgroundColor: config.color,
        }}
      >
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <>
    <DashboardLayout pageName="Demandas" menuItems={menuItems}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ClipboardList size={28} color={colors.primary} />
              <span>Demandas</span>
            </div>
          </h2>
          <div style={styles.headerActions}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={styles.select}
            >
              <option value="all">Todas</option>
              <option value="open">Aberta</option>
              <option value="in_progress">Em Progresso</option>
              <option value="closed">Fechada</option>
              <option value="cancelled">Cancelada</option>
            </select>
            <SearchBar
              placeholder="Buscar por título ou clínica..."
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </div>
        </div>

        {/* Stats */}
        <div style={styles.stats}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Total:</span>
            <span style={styles.statValue}>{filteredDemands.length}</span>
          </div>
        </div>

        {/* Table */}
        {currentDemands.length === 0 ? (
          <div style={styles.emptyState}>
            <p>Nenhuma demanda encontrada</p>
          </div>
        ) : (
          <>
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.tableHeader}>Título</th>
                    <th style={styles.tableHeader}>Clínica</th>
                    <th style={styles.tableHeader}>Status</th>
                    <th style={styles.tableHeader}>Data Demanda</th>
                    <th style={styles.tableHeader}>Categoria</th>
                    <th style={styles.tableHeader}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {currentDemands.map((demand) => (
                    <tr key={demand.id} style={styles.tableRow}>
                      <td style={styles.tableCell}>{demand.title}</td>
                      <td style={styles.tableCell}>{getClinicName(demand.clinic_id)}</td>
                      <td style={styles.tableCell}>{getStatusBadge(demand.status)}</td>
                      <td style={styles.tableCell}>{formatDate(demand.demand_date)}</td>
                      <td style={styles.tableCell}>{demand.category || 'N/A'}</td>
                      <td style={styles.tableCell}>
                        <div style={styles.actions}>
                          <button
                            onClick={() => handleView(demand)}
                            style={{ ...styles.actionButton, ...styles.viewButton }}
                            title="Ver detalhes"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleEdit(demand)}
                            style={{ ...styles.actionButton, ...styles.editButton }}
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(demand)}
                            style={{ ...styles.actionButton, ...styles.deleteButton }}
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </>
        )}

        {/* View Modal */}
        {showViewModal && selectedDemand && (
          <div style={styles.modalOverlay} onClick={() => setShowViewModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Detalhes da Demanda</h3>
                <button onClick={() => setShowViewModal(false)} style={styles.closeButton}>
                  ✕
                </button>
              </div>
              <div style={styles.modalBody}>
                <div style={styles.detailRow}>
                  <strong>Título:</strong> {selectedDemand.title}
                </div>
                <div style={styles.detailRow}>
                  <strong>Clínica:</strong> {getClinicName(selectedDemand.clinic_id)}
                </div>
                <div style={styles.detailRow}>
                  <strong>Status:</strong> {getStatusBadge(selectedDemand.status)}
                </div>
                <div style={styles.detailRow}>
                  <strong>Categoria:</strong> {selectedDemand.category}
                </div>
                <div style={styles.detailRow}>
                  <strong>Descrição:</strong> {selectedDemand.description}
                </div>
                <div style={styles.detailRow}>
                  <strong>Data da Demanda:</strong> {formatDate(selectedDemand.demand_date)}
                </div>
                <div style={styles.detailRow}>
                  <strong>Horário:</strong> {selectedDemand.start_time}
                </div>
                <div style={styles.detailRow}>
                  <strong>Duração:</strong> {selectedDemand.duration_hours}h
                </div>
                <div style={styles.detailRow}>
                  <strong>Especialidades Requeridas:</strong>{' '}
                  {selectedDemand.required_specialties?.join(', ') || 'Nenhuma'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Pagamento:</strong> {selectedDemand.payment ? `R$ ${selectedDemand.payment}` : 'N/A'}
                </div>

                {/* Applications */}
                <div style={{ marginTop: '24px' }}>
                  <h4 style={styles.subsectionTitle}>
                    Candidatos ({applications.length})
                  </h4>
                  {applications.length === 0 ? (
                    <p style={styles.emptyText}>Nenhum candidato ainda</p>
                  ) : (
                    <div style={styles.applicationsList}>
                      {applications.map((app) => (
                        <div key={app.id} style={styles.applicationCard}>
                          <div style={styles.applicationHeader}>
                            <strong>{app.vets?.name || 'N/A'}</strong>
                            <span style={styles.applicationBadge}>
                              {app.status === 'pending' ? 'Pendente' : app.status}
                            </span>
                          </div>
                          <div style={styles.applicationDetail}>
                            CRMV: {app.vets?.crmv || 'N/A'}
                          </div>
                          <div style={styles.applicationDetail}>
                            Email: {app.vets?.email || 'N/A'}
                          </div>
                          {app.message && (
                            <div style={styles.applicationMessage}>
                              <em>"{app.message}"</em>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && selectedDemand && (
          <div style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Editar Demanda</h3>
                <button onClick={() => setShowEditModal(false)} style={styles.closeButton}>
                  ✕
                </button>
              </div>
              <div style={styles.modalBody}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Título:</label>
                  <input
                    type="text"
                    value={editFormData.title || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Descrição:</label>
                  <textarea
                    value={editFormData.description || ''}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, description: e.target.value })
                    }
                    style={{ ...styles.input, minHeight: '80px' }}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Status:</label>
                  <select
                    value={editFormData.status || 'open'}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as any })}
                    style={styles.input}
                  >
                    <option value="open">Aberta</option>
                    <option value="in_progress">Em Progresso</option>
                    <option value="closed">Fechada</option>
                    <option value="cancelled">Cancelada</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Pagamento:</label>
                  <input
                    type="number"
                    value={editFormData.payment || ''}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, payment: parseFloat(e.target.value) })
                    }
                    style={styles.input}
                  />
                </div>
                <div style={styles.formActions}>
                  <button onClick={() => setShowEditModal(false)} style={styles.cancelButton}>
                    Cancelar
                  </button>
                  <button onClick={handleSaveEdit} style={styles.saveButton}>
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
    <LoadingOverlay visible={loading} label="Carregando demandas..." />
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    marginBottom: '24px',
  },
  headerActions: {
    display: 'flex',
    gap: '16px',
    marginTop: '16px',
    flexWrap: 'wrap',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    margin: 0,
  },
  select: {
    padding: '12px 16px',
    fontSize: '14px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  },
  stats: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
  },
  statItem: {
    backgroundColor: '#f9fafb',
    padding: '12px 20px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statLabel: {
    fontSize: '14px',
    color: '#737373',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    color: '#ffffff',
  },
  loading: {
    textAlign: 'center',
    padding: '48px',
    fontSize: '16px',
    color: '#737373',
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px',
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    color: '#737373',
  },
  tableContainer: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid #e5e5e5',
    overflow: 'hidden',
    marginBottom: '24px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeaderRow: {
    backgroundColor: '#f9fafb',
  },
  tableHeader: {
    padding: '16px',
    textAlign: 'left',
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
    borderBottom: '1px solid #e5e5e5',
  },
  tableRow: {
    borderBottom: '1px solid #f3f4f6',
  },
  tableCell: {
    padding: '16px',
    fontSize: '14px',
    color: '#262626',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  actionButton: {
    padding: '6px 10px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s',
  },
  viewButton: {
    backgroundColor: '#3b82f6',
  },
  editButton: {
    backgroundColor: '#f59e0b',
  },
  deleteButton: {
    backgroundColor: '#ef4444',
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
    borderRadius: '12px',
    width: '90%',
    maxWidth: '700px',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    borderBottom: '1px solid #e5e5e5',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#737373',
  },
  modalBody: {
    padding: '24px',
  },
  detailRow: {
    padding: '12px 0',
    borderBottom: '1px solid #f3f4f6',
    fontSize: '14px',
  },
  subsectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '16px',
    color: '#262626',
  },
  emptyText: {
    color: '#737373',
    fontSize: '14px',
  },
  applicationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  applicationCard: {
    backgroundColor: '#f9fafb',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e5e5e5',
  },
  applicationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  applicationBadge: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    padding: '4px 8px',
    borderRadius: '8px',
    fontSize: '12px',
  },
  applicationDetail: {
    fontSize: '13px',
    color: '#737373',
    marginBottom: '4px',
  },
  applicationMessage: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#262626',
    fontStyle: 'italic',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#262626',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    boxSizing: 'border-box',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#e5e5e5',
    color: '#262626',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  saveButton: {
    padding: '10px 20px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
};

export default AdminDemandsPage;

