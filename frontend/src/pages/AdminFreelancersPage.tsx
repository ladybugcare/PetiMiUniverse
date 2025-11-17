import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { freelancersApi, Freelancer } from '../services/freelancersApi';
import { useAlert } from '../hooks/useAlert';
import { Eye, Edit, Trash2, Briefcase } from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';
import AddressAutocomplete from '../components/AddressAutocomplete';

const AdminFreelancersPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError, showConfirm } = useAlert();
  
  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'ADMIN';
  const { menuItems } = useSidebarMenu(userRole);
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [filteredFreelancers, setFilteredFreelancers] = useState<Freelancer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedFreelancer, setSelectedFreelancer] = useState<Freelancer | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Freelancer>>();

  const itemsPerPage = 20;

  // Check authentication
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '');
    const userRole = user?.user_metadata?.role || user?.role;
    
    if (!user || !user.id || userRole !== 'admin') {
      navigate('/login');
      return;
    }
    
    loadFreelancers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const loadFreelancers = async () => {
    try {
      setLoading(true);
      const { freelancers: data } = await freelancersApi.getAll();
      setFreelancers(data);
      setFilteredFreelancers(data);
    } catch (error: any) {
      showError('Erro ao carregar freelancers: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter functionality
  useEffect(() => {
    let filtered = freelancers.filter(freelancer =>
      freelancer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      freelancer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (freelancer.document_number && freelancer.document_number.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (statusFilter !== 'all') {
      filtered = filtered.filter(freelancer => freelancer.status === statusFilter);
    }

    setFilteredFreelancers(filtered);
    setCurrentPage(1);
  }, [searchQuery, statusFilter, freelancers]);

  // Pagination
  const totalPages = Math.ceil(filteredFreelancers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentFreelancers = filteredFreelancers.slice(startIndex, endIndex);


  const handleView = (freelancer: Freelancer) => {
    setSelectedFreelancer(freelancer);
    setShowViewModal(true);
  };

  const handleEdit = (freelancer: Freelancer) => {
    setSelectedFreelancer(freelancer);
    setEditFormData(freelancer);
    setShowEditModal(true);
  };

  const handleDelete = (freelancer: Freelancer) => {
    showConfirm(
      `Tem certeza que deseja excluir o freelancer "${freelancer.name}"? Esta ação não pode ser desfeita.`,
      async () => {
        try {
          await freelancersApi.delete(freelancer.id);
          showSuccess('Freelancer excluído com sucesso!');
          loadFreelancers();
        } catch (error: any) {
          showError('Erro ao excluir freelancer: ' + error.message);
        }
      },
      'Confirmar Exclusão'
    );
  };

  const handleSaveEdit = async () => {
    if (!selectedFreelancer) return;

    try {
      await freelancersApi.update(selectedFreelancer.id, editFormData);
      showSuccess('Freelancer atualizado com sucesso!');
      setShowEditModal(false);
      loadFreelancers();
    } catch (error: any) {
      showError('Erro ao atualizar freelancer: ' + error.message);
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

  const formatDocument = (docType?: string, docNumber?: string) => {
    if (!docType || !docNumber) return '—';
    const normalized = docNumber.replace(/[^\d]/g, '');
    if (docType === 'CPF') {
      return normalized.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else {
      return normalized.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
  };

  return (
    <DashboardLayout pageName="Freelancers Cadastrados" menuItems={menuItems}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Briefcase size={28} color={colors.primary} />
              <span>Freelancers Cadastrados</span>
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
              placeholder="Buscar por nome, email ou documento..."
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </div>
        </div>

        {/* Stats */}
        <div style={styles.stats}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Total:</span>
            <span style={styles.statValue}>{filteredFreelancers.length}</span>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={styles.loading}>Carregando...</div>
        ) : currentFreelancers.length === 0 ? (
          <div style={styles.emptyState}>
            <p>Nenhum freelancer encontrado</p>
          </div>
        ) : (
          <>
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.tableHeader}>Nome</th>
                    <th style={styles.tableHeader}>E-mail</th>
                    <th style={styles.tableHeader}>Documento</th>
                    <th style={styles.tableHeader}>Especialidades</th>
                    <th style={styles.tableHeader}>Status</th>
                    <th style={styles.tableHeader}>Data Cadastro</th>
                    <th style={styles.tableHeader}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {currentFreelancers.map((freelancer) => (
                    <tr key={freelancer.id} style={styles.tableRow}>
                      <td style={styles.tableCell}>{freelancer.name}</td>
                      <td style={styles.tableCell}>{freelancer.email}</td>
                      <td style={styles.tableCell}>
                        {freelancer.document_type && freelancer.document_number
                          ? `${freelancer.document_type}: ${formatDocument(freelancer.document_type, freelancer.document_number)}`
                          : '—'}
                      </td>
                      <td style={styles.tableCell}>
                        {freelancer.specialties && freelancer.specialties.length > 0
                          ? freelancer.specialties.slice(0, 2).join(', ') +
                            (freelancer.specialties.length > 2 ? '...' : '')
                          : 'N/A'}
                      </td>
                      <td style={styles.tableCell}>{getStatusBadge(freelancer.status)}</td>
                      <td style={styles.tableCell}>{formatDate(freelancer.created_at)}</td>
                      <td style={styles.tableCell}>
                        <div style={styles.actions}>
                          <button
                            onClick={() => handleView(freelancer)}
                            style={{ ...styles.actionButton, ...styles.viewButton }}
                            title="Ver detalhes"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleEdit(freelancer)}
                            style={{ ...styles.actionButton, ...styles.editButton }}
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(freelancer)}
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
        {showViewModal && selectedFreelancer && (
          <div style={styles.modalOverlay} onClick={() => setShowViewModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Detalhes do Freelancer</h3>
                <button onClick={() => setShowViewModal(false)} style={styles.closeButton}>
                  ✕
                </button>
              </div>
              <div style={styles.modalBody}>
                <div style={styles.detailRow}>
                  <strong>Nome:</strong> {selectedFreelancer.name}
                </div>
                <div style={styles.detailRow}>
                  <strong>E-mail:</strong> {selectedFreelancer.email}
                </div>
                <div style={styles.detailRow}>
                  <strong>Documento:</strong>{' '}
                  {selectedFreelancer.document_type && selectedFreelancer.document_number
                    ? `${selectedFreelancer.document_type}: ${formatDocument(selectedFreelancer.document_type, selectedFreelancer.document_number)}`
                    : '—'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Endereço:</strong> {selectedFreelancer.address || '—'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Status:</strong> {getStatusBadge(selectedFreelancer.status)}
                </div>
                <div style={styles.detailRow}>
                  <strong>Status de Aprovação:</strong> {selectedFreelancer.approval_status || 'pending'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Especialidades:</strong>{' '}
                  {selectedFreelancer.specialties?.join(', ') || 'N/A'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Regiões de Atendimento:</strong>{' '}
                  {selectedFreelancer.service_regions?.join(', ') || 'N/A'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Experiência:</strong> {selectedFreelancer.experience || 'N/A'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Bio:</strong> {selectedFreelancer.bio || '—'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Data de Cadastro:</strong> {formatDate(selectedFreelancer.created_at)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && selectedFreelancer && (
          <div style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Editar Freelancer</h3>
                <button onClick={() => setShowEditModal(false)} style={styles.closeButton}>
                  ✕
                </button>
              </div>
              <div style={styles.modalBody}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Nome:</label>
                  <input
                    type="text"
                    value={editFormData?.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>E-mail:</label>
                  <input
                    type="email"
                    value={editFormData?.email || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Endereço:</label>
                  <AddressAutocomplete
                    value={editFormData?.address || ''}
                    onChange={(address) => setEditFormData({ ...editFormData, address })}
                    placeholder="Ex: Rua das Flores, 123 - Centro - São Paulo/SP"
                    className="input"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Status:</label>
                  <select
                    value={editFormData?.status || 'pending'}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as any })}
                    style={styles.input}
                  >
                    <option value="active">Ativo</option>
                    <option value="pending">Pendente</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Status de Aprovação:</label>
                  <select
                    value={editFormData?.approval_status || 'pending'}
                    onChange={(e) => setEditFormData({ ...editFormData, approval_status: e.target.value as any })}
                    style={styles.input}
                  >
                    <option value="pending">Pendente</option>
                    <option value="pending_approval">Aguardando Aprovação</option>
                    <option value="approved">Aprovado</option>
                    <option value="rejected">Rejeitado</option>
                    <option value="pending_review">Aguardando Revisão</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Bio:</label>
                  <textarea
                    value={editFormData?.bio || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, bio: e.target.value })}
                    style={{ ...styles.input, minHeight: '80px' }}
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
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1f2937',
    margin: 0,
  },
  select: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
  },
  stats: {
    display: 'flex',
    gap: '24px',
    marginBottom: '24px',
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statLabel: {
    fontSize: '14px',
    color: '#6b7280',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1f2937',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#6b7280',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px',
    color: '#6b7280',
  },
  tableContainer: {
    overflowX: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#ffffff',
  },
  tableHeaderRow: {
    backgroundColor: '#f9fafb',
  },
  tableHeader: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    borderBottom: '1px solid #e5e7eb',
  },
  tableRow: {
    borderBottom: '1px solid #e5e7eb',
    transition: 'background-color 0.2s',
  },
  tableCell: {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#4b5563',
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
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  viewButton: {
    backgroundColor: '#eff6ff',
    color: '#3b82f6',
  },
  editButton: {
    backgroundColor: '#f0fdf4',
    color: '#10b981',
  },
  deleteButton: {
    backgroundColor: '#fef2f2',
    color: '#ef4444',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#ffffff',
    display: 'inline-block',
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
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1f2937',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#6b7280',
    cursor: 'pointer',
    padding: 0,
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: '24px',
  },
  detailRow: {
    marginBottom: '16px',
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: '1.6',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
  },
  formActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  saveButton: {
    padding: '10px 20px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

export default AdminFreelancersPage;

