import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { clinicsApi, vetsApi } from '../services';
import { useAlert } from '../hooks/useAlert';
import { BarChart2, Building2, Stethoscope, ClipboardList, Users, LogOut, MessageCircle, Eye, Edit, Trash2 } from 'lucide-react';
import colors from '../styles/colors';

interface Clinic {
  id: string;
  name: string;
  email: string;
  cnpj?: string;
  created_at: string;
}

interface Vet {
  id: string;
  name: string;
  email: string;
  crmv: string;
  created_at: string;
}

const AdminUsersPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError, showConfirm } = useAlert();
  const [activeTab, setActiveTab] = useState<'clinics' | 'vets'>('clinics');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [vets, setVets] = useState<Vet[]>([]);
  const [filteredClinics, setFilteredClinics] = useState<Clinic[]>([]);
  const [filteredVets, setFilteredVets] = useState<Vet[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [selectedVet, setSelectedVet] = useState<Vet | null>(null);
  const [showViewClinicModal, setShowViewClinicModal] = useState(false);
  const [showViewVetModal, setShowViewVetModal] = useState(false);
  const [showEditClinicModal, setShowEditClinicModal] = useState(false);
  const [showEditVetModal, setShowEditVetModal] = useState(false);
  const [editClinicFormData, setEditClinicFormData] = useState<Partial<Clinic>>({});
  const [editVetFormData, setEditVetFormData] = useState<Partial<Vet>>({});

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
      const [clinicsResult, vetsResult] = await Promise.all([
        clinicsApi.getAll(),
        vetsApi.getAll(),
      ]);
      setClinics(clinicsResult.clinics);
      setVets(vetsResult.vets);
      setFilteredClinics(clinicsResult.clinics);
      setFilteredVets(vetsResult.vets);
    } catch (error: any) {
      showError('Erro ao carregar usuários: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Search for clinics
  useEffect(() => {
    if (activeTab === 'clinics') {
      const filtered = clinics.filter((clinic) =>
        clinic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        clinic.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredClinics(filtered);
      setCurrentPage(1);
    }
  }, [searchQuery, clinics, activeTab]);

  // Search for vets
  useEffect(() => {
    if (activeTab === 'vets') {
      const filtered = vets.filter((vet) =>
        vet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vet.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredVets(filtered);
      setCurrentPage(1);
    }
  }, [searchQuery, vets, activeTab]);

  // Reset search when changing tabs
  useEffect(() => {
    setSearchQuery('');
    setCurrentPage(1);
  }, [activeTab]);

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin-dashboard' },
    { id: 'clinics', label: 'Clínicas', icon: <Building2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin/clinics' },
    { id: 'vets', label: 'Veterinários', icon: <Stethoscope size={20} color={colors.primary} />, action: 'navigate', path: '/admin/vets' },
    { id: 'demands', label: 'Demandas', icon: <ClipboardList size={20} color={colors.primary} />, action: 'navigate', path: '/admin/demands' },
    { id: 'support', label: 'Tickets de Suporte', icon: <MessageCircle size={20} color={colors.primary} />, action: 'navigate', path: '/admin/support-tickets' },
    { id: 'users', label: 'Usuários', icon: <Users size={20} color={colors.primary} />, action: 'navigate', path: '/admin/users' },
    { id: 'logout', label: 'Sair', icon: <LogOut size={20} color={colors.primary} />, action: 'logout' },
  ];

  // Clinic handlers
  const handleViewClinic = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    setShowViewClinicModal(true);
  };

  const handleEditClinic = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    setEditClinicFormData(clinic);
    setShowEditClinicModal(true);
  };

  const handleDeleteClinic = (clinic: Clinic) => {
    showConfirm(
      `Tem certeza que deseja excluir a clínica "${clinic.name}"? Esta ação não pode ser desfeita.`,
      async () => {
        try {
          await clinicsApi.delete(clinic.id);
          showSuccess('Clínica excluída com sucesso!');
          loadData();
        } catch (error: any) {
          showError('Erro ao excluir clínica: ' + error.message);
        }
      },
      'Confirmar Exclusão'
    );
  };

  const handleSaveEditClinic = async () => {
    if (!selectedClinic) return;

    try {
      await clinicsApi.update(selectedClinic.id, editClinicFormData);
      showSuccess('Clínica atualizada com sucesso!');
      setShowEditClinicModal(false);
      loadData();
    } catch (error: any) {
      showError('Erro ao atualizar clínica: ' + error.message);
    }
  };

  // Vet handlers
  const handleViewVet = (vet: Vet) => {
    setSelectedVet(vet);
    setShowViewVetModal(true);
  };

  const handleEditVet = (vet: Vet) => {
    setSelectedVet(vet);
    setEditVetFormData(vet);
    setShowEditVetModal(true);
  };

  const handleDeleteVet = (vet: Vet) => {
    showConfirm(
      `Tem certeza que deseja excluir o veterinário "${vet.name}"? Esta ação não pode ser desfeita.`,
      async () => {
        try {
          await vetsApi.delete(vet.id);
          showSuccess('Veterinário excluído com sucesso!');
          loadData();
        } catch (error: any) {
          showError('Erro ao excluir veterinário: ' + error.message);
        }
      },
      'Confirmar Exclusão'
    );
  };

  const handleSaveEditVet = async () => {
    if (!selectedVet) return;

    try {
      await vetsApi.update(selectedVet.id, editVetFormData);
      showSuccess('Veterinário atualizado com sucesso!');
      setShowEditVetModal(false);
      loadData();
    } catch (error: any) {
      showError('Erro ao atualizar veterinário: ' + error.message);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  // Pagination
  const currentData = activeTab === 'clinics' ? filteredClinics : filteredVets;
  const totalPages = Math.ceil(currentData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = currentData.slice(startIndex, endIndex);

  return (
    <DashboardLayout pageName="Usuários" menuItems={menuItems} notificationCount={0}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Users size={28} color={colors.primary} />
              <span>Usuários Totais</span>
            </div>
          </h2>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            onClick={() => setActiveTab('clinics')}
            style={{
              ...styles.tab,
              ...(activeTab === 'clinics' ? styles.activeTab : {}),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={18} />
              <span>Clínicas ({clinics.length})</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('vets')}
            style={{
              ...styles.tab,
              ...(activeTab === 'vets' ? styles.activeTab : {}),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Stethoscope size={18} />
              <span>Veterinários ({vets.length})</span>
            </div>
          </button>
        </div>

        {/* Search */}
        <div style={styles.searchContainer}>
          <SearchBar
            placeholder={
              activeTab === 'clinics'
                ? 'Buscar clínicas...'
                : 'Buscar veterinários...'
            }
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>

        {/* Stats */}
        <div style={styles.stats}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Mostrando:</span>
            <span style={styles.statValue}>{currentData.length}</span>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={styles.loading}>Carregando...</div>
        ) : currentItems.length === 0 ? (
          <div style={styles.emptyState}>
            <p>Nenhum usuário encontrado</p>
          </div>
        ) : (
          <>
            {activeTab === 'clinics' ? (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={styles.tableHeader}>Nome</th>
                      <th style={styles.tableHeader}>E-mail</th>
                      <th style={styles.tableHeader}>Tipo</th>
                      <th style={styles.tableHeader}>Data Cadastro</th>
                      <th style={styles.tableHeader}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currentItems as Clinic[]).map((clinic) => (
                      <tr key={clinic.id} style={styles.tableRow}>
                        <td style={styles.tableCell}>{clinic.name}</td>
                        <td style={styles.tableCell}>{clinic.email}</td>
                        <td style={styles.tableCell}>
                          <span style={{ ...styles.typeBadge, backgroundColor: '#7c3aed' }}>
                            Clínica
                          </span>
                        </td>
                        <td style={styles.tableCell}>{formatDate(clinic.created_at)}</td>
                        <td style={styles.tableCell}>
                          <div style={styles.actions}>
                            <button
                              onClick={() => handleViewClinic(clinic)}
                              style={{ ...styles.actionButton, ...styles.viewButton }}
                              title="Ver detalhes"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => handleEditClinic(clinic)}
                              style={{ ...styles.actionButton, ...styles.editButton }}
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteClinic(clinic)}
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
            ) : (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={styles.tableHeader}>Nome</th>
                      <th style={styles.tableHeader}>E-mail</th>
                      <th style={styles.tableHeader}>Tipo</th>
                      <th style={styles.tableHeader}>Data Cadastro</th>
                      <th style={styles.tableHeader}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currentItems as Vet[]).map((vet) => (
                      <tr key={vet.id} style={styles.tableRow}>
                        <td style={styles.tableCell}>{vet.name}</td>
                        <td style={styles.tableCell}>{vet.email}</td>
                        <td style={styles.tableCell}>
                          <span style={{ ...styles.typeBadge, backgroundColor: '#3b82f6' }}>
                            Veterinário
                          </span>
                        </td>
                        <td style={styles.tableCell}>{formatDate(vet.created_at)}</td>
                        <td style={styles.tableCell}>
                          <div style={styles.actions}>
                            <button
                              onClick={() => handleViewVet(vet)}
                              style={{ ...styles.actionButton, ...styles.viewButton }}
                              title="Ver detalhes"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => handleEditVet(vet)}
                              style={{ ...styles.actionButton, ...styles.editButton }}
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteVet(vet)}
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
            )}

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </>
        )}

        {/* Clinic View Modal */}
        {showViewClinicModal && selectedClinic && (
          <div style={styles.modalOverlay} onClick={() => setShowViewClinicModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Detalhes da Clínica</h3>
                <button onClick={() => setShowViewClinicModal(false)} style={styles.closeButton}>
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
                  <strong>Data de Cadastro:</strong> {formatDate(selectedClinic.created_at)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Clinic Edit Modal */}
        {showEditClinicModal && selectedClinic && (
          <div style={styles.modalOverlay} onClick={() => setShowEditClinicModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Editar Clínica</h3>
                <button onClick={() => setShowEditClinicModal(false)} style={styles.closeButton}>
                  ✕
                </button>
              </div>
              <div style={styles.modalBody}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Nome:</label>
                  <input
                    type="text"
                    value={editClinicFormData.name || ''}
                    onChange={(e) =>
                      setEditClinicFormData({ ...editClinicFormData, name: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>E-mail:</label>
                  <input
                    type="email"
                    value={editClinicFormData.email || ''}
                    onChange={(e) =>
                      setEditClinicFormData({ ...editClinicFormData, email: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div style={styles.formActions}>
                  <button onClick={() => setShowEditClinicModal(false)} style={styles.cancelButton}>
                    Cancelar
                  </button>
                  <button onClick={handleSaveEditClinic} style={styles.saveButton}>
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Vet View Modal */}
        {showViewVetModal && selectedVet && (
          <div style={styles.modalOverlay} onClick={() => setShowViewVetModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Detalhes do Veterinário</h3>
                <button onClick={() => setShowViewVetModal(false)} style={styles.closeButton}>
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
                  <strong>Data de Cadastro:</strong> {formatDate(selectedVet.created_at)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Vet Edit Modal */}
        {showEditVetModal && selectedVet && (
          <div style={styles.modalOverlay} onClick={() => setShowEditVetModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Editar Veterinário</h3>
                <button onClick={() => setShowEditVetModal(false)} style={styles.closeButton}>
                  ✕
                </button>
              </div>
              <div style={styles.modalBody}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Nome:</label>
                  <input
                    type="text"
                    value={editVetFormData.name || ''}
                    onChange={(e) =>
                      setEditVetFormData({ ...editVetFormData, name: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>E-mail:</label>
                  <input
                    type="email"
                    value={editVetFormData.email || ''}
                    onChange={(e) =>
                      setEditVetFormData({ ...editVetFormData, email: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>CRMV:</label>
                  <input
                    type="text"
                    value={editVetFormData.crmv || ''}
                    onChange={(e) =>
                      setEditVetFormData({ ...editVetFormData, crmv: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div style={styles.formActions}>
                  <button onClick={() => setShowEditVetModal(false)} style={styles.cancelButton}>
                    Cancelar
                  </button>
                  <button onClick={handleSaveEditVet} style={styles.saveButton}>
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
  title: {
    fontSize: '28px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    margin: 0,
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '2px solid #e5e5e5',
  },
  tab: {
    padding: '12px 24px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '3px solid transparent',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    color: '#737373',
    transition: 'all 0.2s',
  },
  activeTab: {
    color: '#7c3aed',
    borderBottomColor: '#7c3aed',
  },
  searchContainer: {
    marginBottom: '24px',
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
  typeBadge: {
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

export default AdminUsersPage;

