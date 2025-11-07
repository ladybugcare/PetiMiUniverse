import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { clinicsApi } from '../services/clinicsApi';
import { useAlert } from '../hooks/useAlert';
import { BarChart2, Building2, Stethoscope, ClipboardList, Users, LogOut, MessageCircle, Eye, Edit, Trash2 } from 'lucide-react';
import colors from '../styles/colors';

interface Clinic {
  id: string;
  name: string;
  cnpj: string;
  address: string;
  email: string;
  phone?: string;
  city?: string;
  state?: string;
  status?: string;
  deleted_at?: string | null;
  created_at: string;
}

const AdminClinicsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError, showConfirm } = useAlert();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [filteredClinics, setFilteredClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Clinic>>({});

  const itemsPerPage = 20;

  // Check authentication
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userRole = user?.user_metadata?.role || user?.role;
    
    if (!user || !user.id || userRole !== 'admin') {
      navigate('/login');
      return;
    }
    
    loadClinics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const loadClinics = async () => {
    try {
      setLoading(true);
      const { clinics: data } = await clinicsApi.getAll();
      setClinics(data);
      setFilteredClinics(data);
    } catch (error: any) {
      showError('Erro ao carregar clínicas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Search functionality
  useEffect(() => {
    const filtered = clinics.filter(clinic =>
      clinic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clinic.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (clinic.cnpj && clinic.cnpj.includes(searchQuery))
    );
    setFilteredClinics(filtered);
    setCurrentPage(1);
  }, [searchQuery, clinics]);

  // Pagination
  const totalPages = Math.ceil(filteredClinics.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentClinics = filteredClinics.slice(startIndex, endIndex);

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin-dashboard' },
    { id: 'clinics', label: 'Clínicas', icon: <Building2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin/clinics' },
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    { id: 'vets', label: 'Veterinários', icon: <Stethoscope size={20} color={colors.primary} />, action: 'navigate', path: '/admin/vets' },
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    { id: 'demands', label: 'Demandas', icon: <ClipboardList size={20} color={colors.primary} />, action: 'navigate', path: '/admin/demands' },
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    { id: 'support', label: 'Tickets de Suporte', icon: <MessageCircle size={20} color={colors.primary} />, action: 'navigate', path: '/admin/support-tickets' },
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    { id: 'users', label: 'Usuários', icon: <Users size={20} color={colors.primary} />, action: 'navigate', path: '/admin/users' },
    // @ts-ignore - Type incompatibility between React 18 and lucide-react
    { id: 'logout', label: 'Sair', icon: <LogOut size={20} color={colors.primary} />, action: 'logout' },
  ];

  const handleView = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    setShowViewModal(true);
  };

  const handleEdit = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    setEditFormData(clinic);
    setShowEditModal(true);
  };

  const handleDeactivate = (clinic: Clinic) => {
    showConfirm(
      `Tem certeza que deseja inativar a clínica "${clinic.name}"? Usuários dessa clínica perderão o acesso até que seja reativada.`,
      async () => {
        try {
          await clinicsApi.deactivate(clinic.id);
          showSuccess('Clínica inativada com sucesso!');
          loadClinics();
        } catch (error: any) {
          showError('Erro ao inativar clínica: ' + error.message);
        }
      },
      'Confirmar Inativação'
    );
  };

  const handleSaveEdit = async () => {
    if (!selectedClinic) return;

    try {
      await clinicsApi.update(selectedClinic.id, editFormData);
      showSuccess('Clínica atualizada com sucesso!');
      setShowEditModal(false);
      loadClinics();
    } catch (error: any) {
      showError('Erro ao atualizar clínica: ' + error.message);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <DashboardLayout pageName="Clínicas Cadastradas" menuItems={menuItems}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Building2 size={28} color={colors.primary} />
              <span>Clínicas Cadastradas</span>
            </div>
          </h2>
          <SearchBar
            placeholder="Buscar por nome, email ou CNPJ..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>

        {/* Stats */}
        <div style={styles.stats}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Total:</span>
            <span style={styles.statValue}>{filteredClinics.length}</span>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={styles.loading}>Carregando...</div>
        ) : currentClinics.length === 0 ? (
          <div style={styles.emptyState}>
            <p>Nenhuma clínica encontrada</p>
          </div>
        ) : (
          <>
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.tableHeader}>Nome</th>
                    <th style={styles.tableHeader}>E-mail</th>
                    <th style={styles.tableHeader}>CNPJ</th>
                    <th style={styles.tableHeader}>Telefone</th>
                    <th style={styles.tableHeader}>Cidade/Estado</th>
                    <th style={styles.tableHeader}>Data Cadastro</th>
                    <th style={styles.tableHeader}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {currentClinics.map((clinic) => (
                    <tr key={clinic.id} style={styles.tableRow}>
                      <td style={styles.tableCell}>{clinic.name}</td>
                      <td style={styles.tableCell}>{clinic.email}</td>
                      <td style={styles.tableCell}>{clinic.cnpj || 'N/A'}</td>
                      <td style={styles.tableCell}>{clinic.phone || 'N/A'}</td>
                      <td style={styles.tableCell}>
                        {clinic.city && clinic.state ? `${clinic.city}/${clinic.state}` : 'N/A'}
                      </td>
                      <td style={styles.tableCell}>{formatDate(clinic.created_at)}</td>
                      <td style={styles.tableCell}>
                        <div style={styles.actions}>
                          <button
                            onClick={() => handleView(clinic)}
                            style={{ ...styles.actionButton, ...styles.viewButton }}
                            title="Ver detalhes"
                          >
                            // @ts-ignore - Type incompatibility between React 18 and lucide-react
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleEdit(clinic)}
                            style={{ ...styles.actionButton, ...styles.editButton }}
                            title="Editar"
                          >
                            // @ts-ignore - Type incompatibility between React 18 and lucide-react
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDeactivate(clinic)}
                            style={{ ...styles.actionButton, ...styles.deleteButton }}
                            title="Inativar"
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
        {showViewModal && selectedClinic && (
          <div style={styles.modalOverlay} onClick={() => setShowViewModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Detalhes da Clínica</h3>
                <button onClick={() => setShowViewModal(false)} style={styles.closeButton}>
                  ✕
                </button>
              </div>
              <div style={styles.modalBody}>
                <div style={styles.detailRow}>
                  <strong>Nome:</strong> {selectedClinic.name}
                </div>
                <div style={styles.detailRow}>
                  <strong>E-mail:</strong> {selectedClinic.email}
                </div>
                <div style={styles.detailRow}>
                  <strong>CNPJ:</strong> {selectedClinic.cnpj || 'N/A'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Telefone:</strong> {selectedClinic.phone || 'N/A'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Endereço:</strong> {selectedClinic.address || 'N/A'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Cidade:</strong> {selectedClinic.city || 'N/A'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Estado:</strong> {selectedClinic.state || 'N/A'}
                </div>
                <div style={styles.detailRow}>
                  <strong>Data de Cadastro:</strong> {formatDate(selectedClinic.created_at)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && selectedClinic && (
          <div style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Editar Clínica</h3>
                <button onClick={() => setShowEditModal(false)} style={styles.closeButton}>
                  ✕
                </button>
              </div>
              <div style={styles.modalBody}>
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
                  <label style={styles.label}>CNPJ:</label>
                  <input
                    type="text"
                    value={editFormData.cnpj || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, cnpj: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Telefone:</label>
                  <input
                    type="text"
                    value={editFormData.phone || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Endereço:</label>
                  <input
                    type="text"
                    value={editFormData.address || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
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
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    gap: '24px',
    flexWrap: 'wrap',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    margin: 0,
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
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
};

export default AdminClinicsPage;
