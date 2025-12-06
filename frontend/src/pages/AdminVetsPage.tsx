import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { vetsApi, Vet } from '../services/vetsApi';
import { useAlert } from '../hooks/useAlert';
import { Eye, Edit, Trash2, Stethoscope } from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';

const AdminVetsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError, showConfirm } = useAlert();
  
  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'ADMIN';
  const { menuItems } = useSidebarMenu(userRole);
  const [vets, setVets] = useState<Vet[]>([]);
  const [filteredVets, setFilteredVets] = useState<Vet[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedVet, setSelectedVet] = useState<Vet | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Vet>>();

  const itemsPerPage = 20;

  // Check authentication
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '');
    const userRole = user?.user_metadata?.role || user?.role;
    
    if (!user || !user.id || userRole !== 'admin') {
      navigate('/login');
      return;
    }
    
    loadVets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const loadVets = async () => {
    try {
      setLoading(true);
      const { vets: data } = await vetsApi.getAll();
      setVets(data);
      setFilteredVets(data);
    } catch (error: any) {
      showError('Erro ao carregar veterinários: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter functionality
  useEffect(() => {
    let filtered = vets.filter(vet =>
      vet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vet.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (vet.crmv && vet.crmv.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (statusFilter !== 'all') {
      filtered = filtered.filter(vet => vet.status === statusFilter);
    }

    setFilteredVets(filtered);
    setCurrentPage(1);
  }, [searchQuery, statusFilter, vets]);

  // Pagination
  const totalPages = Math.ceil(filteredVets.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentVets = filteredVets.slice(startIndex, endIndex);


  const handleView = (vet: Vet) => {
    setSelectedVet(vet);
    setShowViewModal(true);
  };

  const handleEdit = (vet: Vet) => {
    setSelectedVet(vet);
    setEditFormData(vet);
    setShowEditModal(true);
  };

  const handleDelete = (vet: Vet) => {
    showConfirm(
      `Tem certeza que deseja excluir o veterinário "${vet.name}"? Esta ação não pode ser desfeita.`,
      async () => {
        try {
          await vetsApi.delete(vet.id);
          showSuccess('Veterinário excluído com sucesso!');
          loadVets();
        } catch (error: any) {
          showError('Erro ao excluir veterinário: ' + error.message);
        }
      },
      'Confirmar Exclusão'
    );
  };

  const handleSaveEdit = async () => {
    if (!selectedVet) return;

    try {
      await vetsApi.update(selectedVet.id, editFormData);
      showSuccess('Veterinário atualizado com sucesso!');
      setShowEditModal(false);
      loadVets();
    } catch (error: any) {
      showError('Erro ao atualizar veterinário: ' + error.message);
    }
  };

  const getStatusBadge = (status?: string) => {
    const statusConfig: { [key: string]: { label: string; color: string } } = {
      active: { label: 'Ativo', color: '#10b981' },
      pending: { label: 'Pendente', color: '#f59e0b' },
      inactive: { label: 'Inativo', color: '#737373' },
    };

    const config = statusConfig[status || 'pending'] || statusConfig.pending;

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

  const formatDate = (dateString?: string) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('pt-BR');
};


  return (
    <DashboardLayout pageName="Veterinários Cadastrados" menuItems={menuItems}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Stethoscope size={28} color={colors.brand.primary[500]} />
              <span>Veterinários Cadastrados</span>
            </div>
          </h2>
          <div style={styles.headerActions}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={styles.select}
            >
              <option value="all">Todos</option>
              <option value="active">Ativo</option>
              <option value="pending">Pendente</option>
              <option value="inactive">Inativo</option>
            </select>
            <SearchBar
              placeholder="Buscar por nome, email ou CRMV..."
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </div>
        </div>

        {/* Stats */}
        <div style={styles.stats}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Total:</span>
            <span style={styles.statValue}>{filteredVets.length}</span>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={styles.loading}>Carregando...</div>
        ) : currentVets.length === 0 ? (
          <div style={styles.emptyState}>
            <p>Nenhum veterinário encontrado</p>
          </div>
        ) : (
          <>
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.tableHeader}>Nome</th>
                    <th style={styles.tableHeader}>E-mail</th>
                    <th style={styles.tableHeader}>CRMV</th>
                    <th style={styles.tableHeader}>Especialidades</th>
                    <th style={styles.tableHeader}>Status</th>
                    <th style={styles.tableHeader}>Data Cadastro</th>
                    <th style={styles.tableHeader}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {currentVets.map((vet) => (
                    <tr key={vet.id} style={styles.tableRow}>
                      <td style={styles.tableCell}>{vet.name}</td>
                      <td style={styles.tableCell}>{vet.email}</td>
                      <td style={styles.tableCell}>{vet.crmv}</td>
                      <td style={styles.tableCell}>
                        {vet.specialties && vet.specialties.length > 0
                          ? vet.specialties.slice(0, 2).join(', ') +
                            (vet.specialties.length > 2 ? '...' : '')
                          : 'N/A'}
                      </td>
                      <td style={styles.tableCell}>{getStatusBadge(vet.status)}</td>
                      <td style={styles.tableCell}>{formatDate(vet.created_at)}</td>
                      <td style={styles.tableCell}>
                        <div style={styles.actions}>
                          <button
                            onClick={() => handleView(vet)}
                            style={{ ...styles.actionButton, ...styles.viewButton }}
                            title="Ver detalhes"
                          >
                            <Eye size={16} color="#3b82f6" />
                          </button>
                          <button
                            onClick={() => handleEdit(vet)}
                            style={{ ...styles.actionButton, ...styles.editButton }}
                            title="Editar"
                          >
                            <Edit size={16} color="#f59e0b" />
                          </button>
                          <button
                            onClick={() => handleDelete(vet)}
                            style={{ ...styles.actionButton, ...styles.deleteButton }}
                            title="Excluir"
                          >
                            <Trash2 size={16} color="#ef4444" />
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
        {showViewModal && selectedVet && (
          <div style={styles.modalOverlay} onClick={() => setShowViewModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Detalhes do Veterinário</h3>
                <button onClick={() => setShowViewModal(false)} style={styles.closeButton}>
                  ✕
                </button>
              </div>
              <div style={styles.modalBody}>
                <div style={styles.detailRow}>
                  <strong>Nome:</strong> {selectedVet.name}
                </div>
                <div style={styles.detailRow}>
                  <strong>E-mail:</strong> {selectedVet.email}
                </div>
                <div style={styles.detailRow}>
                  <strong>CRMV:</strong> {selectedVet.crmv}
                </div>
                <div style={styles.detailRow}>
                  <strong>Status:</strong> {getStatusBadge(selectedVet.status)}
                </div>
                <div style={styles.detailRow}>
                  <strong>Especialidades:</strong>{' '}
                  {selectedVet.specialties?.join(', ') || 'N/A'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Certificados:</strong>{' '}
                  {selectedVet.certificates && selectedVet.certificates.length > 0
                    ? selectedVet.certificates.join(', ')
                    : 'Nenhum'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Experiência:</strong> {selectedVet.experience || 'N/A'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Data de Cadastro:</strong> {formatDate(selectedVet.created_at)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && selectedVet && (
          <div style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Editar Veterinário</h3>
                <button onClick={() => setShowEditModal(false)} style={styles.closeButton}>
                  ✕
                </button>
              </div>
              <div style={styles.modalBody}>
                {editFormData && (
                  <>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Nome:</label>
                  <input
                    type="text"
                    value={editFormData.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>E-mail:</label>
                  <input
                    type="email"
                    value={editFormData.email || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>CRMV:</label>
                  <input
                    type="text"
                    value={editFormData.crmv || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, crmv: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Status:</label>
                  <select
                    value={editFormData.status || 'pending'}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    style={styles.input}
                  >
                    <option value="active">Ativo</option>
                    <option value="pending">Pendente</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Experiência:</label>
                  <textarea
                    value={editFormData.experience || ''}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, experience: e.target.value })
                    }
                    style={{ ...styles.input, minHeight: '80px' }}
                  />
                </div>
                  </>
                )}
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
    border: '2px solid',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s',
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewButton: {
    borderColor: '#3b82f6',
  },
  editButton: {
    borderColor: '#f59e0b',
  },
  deleteButton: {
    borderColor: '#ef4444',
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
    maxWidth: '600px',
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
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
};

export default AdminVetsPage;

