import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { clinicsApi } from '../services/clinicsApi';
import { adminApi, ActiveUnit } from '../services/adminApi';
import { useAlert } from '../hooks/useAlert';
import { SuccessModal } from '../components/SuccessModal';
import { BarChart2, Building2, Stethoscope, ClipboardList, Users, LogOut, MessageCircle, Eye, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'clinics' | 'units'>('clinics');
  
  // Clínicas state
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [filteredClinics, setFilteredClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Clinic>>();

  // Unidades state
  const [units, setUnits] = useState<ActiveUnit[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<ActiveUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [unitsSearchQuery, setUnitsSearchQuery] = useState('');
  const [unitsCurrentPage, setUnitsCurrentPage] = useState(1);
  const [selectedUnit, setSelectedUnit] = useState<ActiveUnit | null>(null);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [modalAction, setModalAction] = useState<'approve' | 'reject'>('approve');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const itemsPerPage = 20;

  // Check authentication
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '');
    const userRole = user?.user_metadata?.role || user?.role;
    
    if (!user || !user.id || userRole !== 'admin') {
      navigate('/login');
      return;
    }
    
    loadClinics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Load units when units tab is selected
  useEffect(() => {
    if (activeTab === 'units') {
      loadActiveUnits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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

  const loadActiveUnits = async () => {
    try {
      setLoadingUnits(true);
      const { units: data } = await adminApi.getAllActiveUnits();
      setUnits(data);
      setFilteredUnits(data);
    } catch (error: any) {
      showError('Erro ao carregar unidades: ' + error.message);
    } finally {
      setLoadingUnits(false);
    }
  };

  // Search functionality for clinics
  useEffect(() => {
    const filtered = clinics.filter(clinic =>
      clinic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clinic.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (clinic.cnpj && clinic.cnpj.includes(searchQuery))
    );
    setFilteredClinics(filtered);
    setCurrentPage(1);
  }, [searchQuery, clinics]);

  // Search functionality for units
  useEffect(() => {
    const filtered = units.filter(unit =>
      unit.name.toLowerCase().includes(unitsSearchQuery.toLowerCase()) ||
      (unit.nickname && unit.nickname.toLowerCase().includes(unitsSearchQuery.toLowerCase())) ||
      unit.clinic.name.toLowerCase().includes(unitsSearchQuery.toLowerCase())
    );
    setFilteredUnits(filtered);
    setUnitsCurrentPage(1);
  }, [unitsSearchQuery, units]);

  // Pagination for clinics
  const totalPages = Math.ceil(filteredClinics.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentClinics = filteredClinics.slice(startIndex, endIndex);

  // Pagination for units
  const unitsTotalPages = Math.ceil(filteredUnits.length / itemsPerPage);
  const unitsStartIndex = (unitsCurrentPage - 1) * itemsPerPage;
  const unitsEndIndex = unitsStartIndex + itemsPerPage;
  const currentUnits = filteredUnits.slice(unitsStartIndex, unitsEndIndex);

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin-dashboard' },
    { id: 'clinics', label: 'Clínicas', icon: <Building2 size={20} color={colors.primary} />, action: 'navigate', path: '/admin/clinics' },
    { id: 'vets', label: 'Veterinários', icon: <Stethoscope size={20} color={colors.primary} />, action: 'navigate', path: '/admin/vets' },
    { id: 'demands', label: 'Demandas', icon: <ClipboardList size={20} color={colors.primary} />, action: 'navigate', path: '/admin/demands' },
    { id: 'support', label: 'Tickets de Suporte', icon: <MessageCircle size={20} color={colors.primary} />, action: 'navigate', path: '/admin/support-tickets' },
    { id: 'users', label: 'Usuários', icon: <Users size={20} color={colors.primary} />, action: 'navigate', path: '/admin/users' },
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

  // Unit modal handlers
  const handleOpenUnitModal = (unit: ActiveUnit, action: 'approve' | 'reject') => {
    setSelectedUnit(unit);
    setModalAction(action);
    setRejectionReason('');
    setShowUnitModal(true);
  };

  const handleCloseUnitModal = () => {
    setShowUnitModal(false);
    setSelectedUnit(null);
    setRejectionReason('');
  };

  const handleConfirmUnitAction = async () => {
    if (!selectedUnit) return;

    if (modalAction === 'reject' && !rejectionReason.trim()) {
      showError('Por favor, informe o motivo da rejeição.');
      return;
    }

    setProcessing(true);

    try {
      await adminApi.reviewUnit(selectedUnit.id, modalAction === 'approve', rejectionReason);

      setSuccessMessage(
        modalAction === 'approve'
          ? 'Unidade aprovada com sucesso! A clínica foi ativada.'
          : 'Unidade reprovada. A clínica foi notificada.'
      );
      setShowSuccessModal(true);

      handleCloseUnitModal();
      loadActiveUnits();
    } catch (error: any) {
      console.error('Error reviewing unit:', error);
      showError(`Erro ao ${modalAction === 'approve' ? 'aprovar' : 'reprovar'} unidade: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'approved':
      case 'active':
        return { backgroundColor: '#d1fae5', color: '#065f46' };
      case 'rejected':
        return { backgroundColor: '#fee2e2', color: '#991b1b' };
      case 'pending_review':
        return { backgroundColor: '#fef3c7', color: '#92400e' };
      default:
        return { backgroundColor: '#f3f4f6', color: '#374151' };
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Aprovada';
      case 'active':
        return 'Ativa';
      case 'rejected':
        return 'Rejeitada';
      case 'pending_review':
        return 'Pendente';
      default:
        return status;
    }
  };

  return (
    <>
      {/* Success Modal */}
      {showSuccessModal && (
        <SuccessModal
          isOpen={showSuccessModal}
          message={successMessage}
          onClose={() => setShowSuccessModal(false)}
        />
      )}

      <DashboardLayout pageName="Clínicas Cadastradas" menuItems={menuItems}>
        <div style={styles.container}>
          {/* Header */}
          <div style={styles.header}>
            <h2 style={styles.title}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Building2 size={28} color={colors.primary} />
                <span>Clínicas e Unidades</span>
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
              Clínicas
            </button>
            <button
              onClick={() => setActiveTab('units')}
              style={{
                ...styles.tab,
                ...(activeTab === 'units' ? styles.activeTab : {}),
              }}
            >
              Unidades Ativas
            </button>
          </div>

          {/* Search Bar */}
          <div style={styles.searchContainer}>
            <SearchBar
              placeholder={
                activeTab === 'clinics'
                  ? 'Buscar por nome, email ou CNPJ...'
                  : 'Buscar por nome da unidade ou clínica...'
              }
              value={activeTab === 'clinics' ? searchQuery : unitsSearchQuery}
              onChange={activeTab === 'clinics' ? setSearchQuery : setUnitsSearchQuery}
            />
          </div>

          {/* Stats */}
          <div style={styles.stats}>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Total:</span>
              <span style={styles.statValue}>
                {activeTab === 'clinics' ? filteredClinics.length : filteredUnits.length}
              </span>
            </div>
          </div>

          {/* Clinics Tab Content */}
          {activeTab === 'clinics' && (
            <>
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
                                  <Eye size={16} color="#3b82f6" />
                                </button>
                                <button
                                  onClick={() => handleEdit(clinic)}
                                  style={{ ...styles.actionButton, ...styles.editButton }}
                                  title="Editar"
                                >
                                  <Edit size={16} color="#f59e0b" />
                                </button>
                                <button
                                  onClick={() => handleDeactivate(clinic)}
                                  style={{ ...styles.actionButton, ...styles.deleteButton }}
                                  title="Inativar"
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
            </>
          )}

          {/* Units Tab Content */}
          {activeTab === 'units' && (
            <>
              {loadingUnits ? (
                <div style={styles.loading}>Carregando unidades...</div>
              ) : currentUnits.length === 0 ? (
                <div style={styles.emptyState}>
                  <p>Nenhuma unidade ativa encontrada</p>
                </div>
              ) : (
                <>
                  <div style={styles.tableContainer}>
                    <table style={styles.table}>
                      <thead>
                        <tr style={styles.tableHeaderRow}>
                          <th style={styles.tableHeader}>Nome da Unidade</th>
                          <th style={styles.tableHeader}>Clínica</th>
                          <th style={styles.tableHeader}>Localização</th>
                          <th style={styles.tableHeader}>CNPJ</th>
                          <th style={styles.tableHeader}>Telefone</th>
                          <th style={styles.tableHeader}>Responsável Técnico</th>
                          <th style={styles.tableHeader}>Status</th>
                          <th style={styles.tableHeader}>Data Criação</th>
                          <th style={styles.tableHeader}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentUnits.map((unit) => (
                          <tr key={unit.id} style={styles.tableRow}>
                            <td style={styles.tableCell}>
                              {unit.name}
                              {unit.nickname && (
                                <span style={styles.nicknameText}> ({unit.nickname})</span>
                              )}
                              {unit.is_main && (
                                <span style={styles.mainBadge}> 🏆 Principal</span>
                              )}
                            </td>
                            <td style={styles.tableCell}>{unit.clinic.name}</td>
                            <td style={styles.tableCell}>
                              {unit.city} - {unit.state}
                            </td>
                            <td style={styles.tableCell}>{unit.cnpj || 'N/A'}</td>
                            <td style={styles.tableCell}>{unit.phone || 'N/A'}</td>
                            <td style={styles.tableCell}>{unit.technical_manager || 'N/A'}</td>
                            <td style={styles.tableCell}>
                              <span
                                style={{
                                  ...styles.statusBadge,
                                  ...getStatusBadgeStyle(unit.status),
                                }}
                              >
                                {getStatusLabel(unit.status)}
                              </span>
                            </td>
                            <td style={styles.tableCell}>{formatDate(unit.created_at)}</td>
                            <td style={styles.tableCell}>
                              <div style={styles.actions}>
                                <button
                                  onClick={() => handleOpenUnitModal(unit, 'approve')}
                                  style={{ ...styles.actionButton, ...styles.approveButton }}
                                  title="Aprovar"
                                >
                                  <CheckCircle size={16} color="#10b981" />
                                </button>
                                <button
                                  onClick={() => handleOpenUnitModal(unit, 'reject')}
                                  style={{ ...styles.actionButton, ...styles.rejectButton }}
                                  title="Reprovar"
                                >
                                  <XCircle size={16} color="#ef4444" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    currentPage={unitsCurrentPage}
                    totalPages={unitsTotalPages}
                    onPageChange={setUnitsCurrentPage}
                  />
                </>
              )}
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

          {/* Unit Review Modal */}
          {showUnitModal && selectedUnit && (
            <div style={styles.modalOverlay} onClick={handleCloseUnitModal}>
              <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                  <h3 style={styles.modalTitle}>
                    {modalAction === 'approve' ? '✅ Aprovar Unidade' : '❌ Reprovar Unidade'}
                  </h3>
                  <button onClick={handleCloseUnitModal} style={styles.closeButton}>
                    ✕
                  </button>
                </div>

                <div style={styles.modalBody}>
                  <p style={styles.modalText}>
                    <strong>Unidade:</strong> {selectedUnit.name}
                    {selectedUnit.nickname && ` (${selectedUnit.nickname})`}
                  </p>
                  <p style={styles.modalText}>
                    <strong>Clínica:</strong> {selectedUnit.clinic.name}
                  </p>

                  {modalAction === 'approve' ? (
                    <div style={styles.infoBox}>
                      <span style={styles.infoIcon}>ℹ️</span>
                      <div>
                        <strong>O que vai acontecer:</strong>
                        <ul style={styles.infoList}>
                          <li>Unidade será marcada como "aprovada"</li>
                          {selectedUnit.is_main && (
                            <li>Clínica será ativada (status: active)</li>
                          )}
                          {selectedUnit.is_main && (
                            <li>Usuários da clínica serão ativados</li>
                          )}
                          <li>Clínica poderá criar demandas e anúncios</li>
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={styles.warningBox}>
                        <span style={styles.warningIcon}>⚠️</span>
                        <div>
                          <strong>O que vai acontecer:</strong>
                          <ul style={styles.infoList}>
                            <li>Unidade será marcada como "rejeitada"</li>
                            {selectedUnit.is_main && (
                              <li>Clínica voltará a ter status "pending_unit"</li>
                            )}
                            {selectedUnit.is_main && (
                              <li>Clínica precisará criar uma nova unidade</li>
                            )}
                          </ul>
                        </div>
                      </div>

                      <div style={styles.formGroup}>
                        <label style={styles.label}>
                          Motivo da Rejeição <span style={styles.required}>*</span>
                        </label>
                        <textarea
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="Explique o motivo da rejeição..."
                          style={styles.textarea}
                          rows={4}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div style={styles.modalFooter}>
                  <button
                    onClick={handleCloseUnitModal}
                    style={styles.cancelButton}
                    disabled={processing}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmUnitAction}
                    style={
                      modalAction === 'approve'
                        ? styles.confirmApproveButton
                        : styles.confirmRejectButton
                    }
                    disabled={processing}
                  >
                    {processing
                      ? 'Processando...'
                      : modalAction === 'approve'
                      ? 'Confirmar Aprovação'
                      : 'Confirmar Rejeição'}
                  </button>
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
    </>
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
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '2px solid #e5e5e5',
  },
  tab: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '500',
    color: '#737373',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '3px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'Inter, sans-serif',
  },
  activeTab: {
    color: colors.primary,
    borderBottomColor: colors.primary,
    fontWeight: '600',
  },
  searchContainer: {
    marginBottom: '24px',
  },
  nicknameText: {
    fontSize: '13px',
    color: '#737373',
    fontStyle: 'italic',
  },
  mainBadge: {
    fontSize: '12px',
    color: '#92400e',
    marginLeft: '8px',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block',
  },
  approveButton: {
    borderColor: '#10b981',
  },
  rejectButton: {
    borderColor: '#ef4444',
  },
  infoBox: {
    backgroundColor: '#dbeafe',
    borderLeft: '4px solid #3b82f6',
    padding: '16px',
    borderRadius: '8px',
    display: 'flex',
    gap: '12px',
    fontSize: '13px',
    color: '#1e40af',
    marginTop: '16px',
  },
  warningBox: {
    backgroundColor: '#fee2e2',
    borderLeft: '4px solid #ef4444',
    padding: '16px',
    borderRadius: '8px',
    display: 'flex',
    gap: '12px',
    fontSize: '13px',
    color: '#991b1b',
    marginTop: '16px',
    marginBottom: '16px',
  },
  infoIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  warningIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  infoList: {
    margin: '8px 0 0 0',
    paddingLeft: '20px',
  },
  textarea: {
    padding: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    resize: 'vertical',
    width: '100%',
    boxSizing: 'border-box',
  },
  required: {
    color: '#ef4444',
  },
  confirmApproveButton: {
    padding: '10px 20px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  confirmRejectButton: {
    padding: '10px 20px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
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
  modalText: {
    fontSize: '14px',
    color: '#374151',
    marginBottom: '12px',
  },
  modalFooter: {
    padding: '16px 24px',
    borderTop: '1px solid #e5e5e5',
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
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
