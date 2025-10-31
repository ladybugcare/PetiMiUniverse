import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { clinicsApi, vetsApi } from '../services';
import { adminApi, CreateUserData } from '../services/adminApi';
import { useAlert } from '../hooks/useAlert';
import { BarChart2, Building2, Stethoscope, ClipboardList, Users, LogOut, MessageCircle, Eye, EyeOff, Edit, Trash2, UserCog, Truck, UserPlus, Plus, Shield } from 'lucide-react';
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
  
  // Create user form states
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [createUserStep, setCreateUserStep] = useState<1 | 2>(1);
  const [createUserFormData, setCreateUserFormData] = useState<Partial<CreateUserData>>({
    status: 'active',
    generate_password: true,
  });
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string>('');

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

  // Handle next step in create user form
  const handleNextStep = () => {
    if (!createUserFormData.user_type) {
      showError('Por favor, selecione o tipo de usuário');
      return;
    }
    setCreateUserStep(2);
  };

  // Handle back step
  const handleBackStep = () => {
    setCreateUserStep(1);
  };

  // Handle close modal and reset
  const handleCloseCreateModal = () => {
    setShowCreateUserModal(false);
    setCreateUserStep(1);
    setShowPassword(false);
    setEmailError('');
    setCreateUserFormData({
      status: 'active',
      generate_password: true,
    });
  };

  // Create user handler
  const handleCreateUser = async () => {
    // Limpar erros anteriores
    setEmailError('');
    
    if (!createUserFormData.name || !createUserFormData.email || !createUserFormData.user_type || !createUserFormData.status) {
      showError('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(createUserFormData.email)) {
      setEmailError('Formato de e-mail inválido');
      return;
    }

    try {
      setCreateUserLoading(true);
      const response = await adminApi.createUser(createUserFormData as CreateUserData);
      showSuccess(response.message || 'Usuário criado com sucesso!');
      handleCloseCreateModal();
      loadData();
    } catch (error: any) {
      // Extrair mensagem de erro
      let errorMessage = error.message || 'Erro desconhecido';
      
      // Tentar parsear JSON se o erro vier como string JSON
      try {
        const errorJson = JSON.parse(errorMessage);
        if (errorJson.error) {
          errorMessage = errorJson.error;
        }
      } catch (e) {
        // Não é JSON, usar mensagem original
      }
      
      // Se o erro contém informações sobre email duplicado
      if (errorMessage.includes('já está cadastrado') || errorMessage.includes('já existe') || errorMessage.includes('already registered') || errorMessage.includes('cadastrado')) {
        setEmailError('Este e-mail já está cadastrado');
      } else if (errorMessage.includes('Formato de e-mail inválido') || errorMessage.includes('email inválido') || errorMessage.includes('invalid email')) {
        setEmailError('Formato de e-mail inválido');
      } else {
        // Para outros erros, mostrar no alert
        showError('Erro ao criar usuário: ' + errorMessage);
      }
    } finally {
      setCreateUserLoading(false);
    }
  };

  // Pagination
  const currentData = activeTab === 'clinics' ? filteredClinics : filteredVets;
  const totalPages = Math.ceil(currentData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = currentData.slice(startIndex, endIndex);

  return (
    <DashboardLayout pageName="Usuários" menuItems={menuItems}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Users size={28} color={colors.primary} />
              <span>Usuários Totais</span>
            </div>
          </h2>
          <button
            onClick={() => setShowCreateUserModal(true)}
            style={styles.newUserButton}
          >
            <Plus size={18} />
            Novo Usuário
          </button>
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

        {/* Create User Modal */}
        {showCreateUserModal && (
          <div style={styles.modalOverlay} onClick={handleCloseCreateModal}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <UserPlus size={24} color={colors.primary} />
                  <h3 style={styles.modalTitle}>Novo Usuário</h3>
                </div>
                <button onClick={handleCloseCreateModal} style={styles.closeButton}>
                  ✕
                </button>
              </div>

              {/* Step Indicator */}
              <div style={styles.stepIndicator}>
                <div style={styles.stepContainer}>
                  <div style={{
                    ...styles.stepCircle,
                    ...(createUserStep >= 1 ? styles.stepCircleActive : {})
                  }}>
                    1
                  </div>
                  <span style={styles.stepLabel}>Tipo de Usuário</span>
                </div>
                <div style={styles.stepLine}></div>
                <div style={styles.stepContainer}>
                  <div style={{
                    ...styles.stepCircle,
                    ...(createUserStep >= 2 ? styles.stepCircleActive : {})
                  }}>
                    2
                  </div>
                  <span style={styles.stepLabel}>Informações</span>
                </div>
              </div>

              <div style={styles.modalBody}>
                {/* Step 1: User Type Selection */}
                {createUserStep === 1 && (
                  <div style={styles.stepContent}>
                    <div style={styles.formGroup}>
                      <div style={styles.userTypeButtons}>
                        {[
                          { id: 'admin', label: 'Administrador', icon: UserCog, color: '#7c3aed' },
                          { id: 'clinic', label: 'Clínica', icon: Building2, color: '#3b82f6' },
                          { id: 'vet', label: 'Veterinário', icon: Stethoscope, color: '#10b981' },
                          { id: 'supplier', label: 'Fornecedor', icon: Truck, color: '#f59e0b' },
                          { id: 'tutor', label: 'Tutor', icon: UserPlus, color: '#ef4444' },
                        ].map((type) => {
                          const IconComponent = type.icon;
                          const isSelected = createUserFormData.user_type === type.id;
                          return (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() =>
                                setCreateUserFormData({
                                  ...createUserFormData,
                                  user_type: type.id as 'clinic' | 'vet' | 'supplier' | 'tutor' | 'admin',
                                })
                              }
                              style={{
                                ...styles.userTypeButton,
                                ...(isSelected ? { ...styles.userTypeButtonSelected, borderColor: type.color } : {}),
                              }}
                            >
                              <div
                                style={{
                                  ...styles.userTypeIconCircle,
                                  backgroundColor: isSelected ? type.color : '#f3f4f6',
                                }}
                              >
                                <IconComponent size={28} strokeWidth={1.5} color={isSelected ? 'white' : '#6b7280'} />
                              </div>
                              <span
                                style={{
                                  ...styles.userTypeLabel,
                                  color: isSelected ? type.color : '#374151',
                                  fontWeight: isSelected ? '600' : '500',
                                }}
                              >
                                {type.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={styles.formActions}>
                      <button onClick={handleCloseCreateModal} style={styles.cancelButton}>
                        Cancelar
                      </button>
                      <button
                        onClick={handleNextStep}
                        style={{
                          ...styles.saveButton,
                          ...(!createUserFormData.user_type ? styles.buttonDisabled : {})
                        }}
                        disabled={!createUserFormData.user_type}
                      >
                        Próximo
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: User Information */}
                {createUserStep === 2 && (
                  <div style={styles.stepContent}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>Nome Completo *</label>
                      <input
                        type="text"
                        value={createUserFormData.name || ''}
                        onChange={(e) =>
                          setCreateUserFormData({ ...createUserFormData, name: e.target.value })
                        }
                        style={styles.input}
                        placeholder="Nome completo"
                      />
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.label}>E-mail *</label>
                      <input
                        type="email"
                        value={createUserFormData.email || ''}
                        onChange={(e) => {
                          const emailValue = e.target.value;
                          setCreateUserFormData({ ...createUserFormData, email: emailValue });
                          if (emailError) {
                            setEmailError('');
                          }
                        }}
                        onBlur={(e) => {
                          const emailValue = e.target.value.trim();
                          if (!emailValue) return;
                          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                          if (!emailRegex.test(emailValue)) {
                            setEmailError('Formato de e-mail inválido');
                          } else {
                            setEmailError('');
                          }
                        }}
                        style={{
                          ...styles.input,
                          ...(emailError ? { borderColor: '#ef4444', borderWidth: '2px' } : {}),
                        }}
                        placeholder="email@exemplo.com"
                      />
                      {emailError && (
                        <div style={styles.fieldError}>
                          {emailError}
                        </div>
                      )}
                    </div>

                    {createUserFormData.user_type !== 'admin' && (
                      <>
                        {createUserFormData.user_type === 'clinic' && (
                          <>
                            <div style={styles.formGroup}>
                              <label style={styles.label}>CNPJ</label>
                              <input
                                type="text"
                                value={createUserFormData.cnpj || ''}
                                onChange={(e) =>
                                  setCreateUserFormData({ ...createUserFormData, cnpj: e.target.value })
                                }
                                style={styles.input}
                                placeholder="00.000.000/0000-00"
                              />
                            </div>
                            <div style={styles.formGroup}>
                              <label style={styles.label}>Role da Clínica</label>
                              <select
                                value={createUserFormData.clinic_role || 'standard'}
                                onChange={(e) =>
                                  setCreateUserFormData({
                                    ...createUserFormData,
                                    clinic_role: e.target.value as 'standard' | 'premium' | 'partner',
                                  })
                                }
                                style={styles.input}
                              >
                                <option value="standard">Standard</option>
                                <option value="premium">Premium</option>
                                <option value="partner">Partner</option>
                              </select>
                            </div>
                          </>
                        )}

                        {createUserFormData.user_type === 'vet' && (
                          <div style={styles.formGroup}>
                            <label style={styles.label}>CRMV</label>
                            <input
                              type="text"
                              value={createUserFormData.crmv || ''}
                              onChange={(e) =>
                                setCreateUserFormData({ ...createUserFormData, crmv: e.target.value })
                              }
                              style={styles.input}
                              placeholder="CRMV"
                            />
                          </div>
                        )}

                        {(createUserFormData.user_type === 'clinic' || createUserFormData.user_type === 'supplier') && (
                          <>
                            <div style={styles.formGroup}>
                              <label style={styles.label}>Telefone</label>
                              <input
                                type="text"
                                value={createUserFormData.phone || ''}
                                onChange={(e) =>
                                  setCreateUserFormData({ ...createUserFormData, phone: e.target.value })
                                }
                                style={styles.input}
                                placeholder="(00) 00000-0000"
                              />
                            </div>
                            <div style={styles.formGroup}>
                              <label style={styles.label}>Endereço</label>
                              <input
                                type="text"
                                value={createUserFormData.address || ''}
                                onChange={(e) =>
                                  setCreateUserFormData({ ...createUserFormData, address: e.target.value })
                                }
                                style={styles.input}
                                placeholder="Endereço completo"
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                              <div style={{ ...styles.formGroup, flex: 1 }}>
                                <label style={styles.label}>Cidade</label>
                                <input
                                  type="text"
                                  value={createUserFormData.city || ''}
                                  onChange={(e) =>
                                    setCreateUserFormData({ ...createUserFormData, city: e.target.value })
                                  }
                                  style={styles.input}
                                  placeholder="Cidade"
                                />
                              </div>
                              <div style={{ ...styles.formGroup, flex: 1 }}>
                                <label style={styles.label}>Estado</label>
                                <input
                                  type="text"
                                  value={createUserFormData.state || ''}
                                  onChange={(e) =>
                                    setCreateUserFormData({ ...createUserFormData, state: e.target.value })
                                  }
                                  style={styles.input}
                                  placeholder="UF"
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}

                    <div style={styles.formGroup}>
                      <label style={styles.label}>Senha</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={styles.passwordInputWrapper}>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={createUserFormData.password || ''}
                            onChange={(e) =>
                              setCreateUserFormData({
                                ...createUserFormData,
                                password: e.target.value,
                                generate_password: false
                              })
                            }
                            style={styles.passwordInput}
                            placeholder="Deixe vazio para gerar automaticamente"
                            disabled={createUserFormData.generate_password}
                          />
                          {!createUserFormData.generate_password && (
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              style={styles.passwordToggleBtn}
                            >
                              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                          )}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                          <input
                            type="checkbox"
                            checked={createUserFormData.generate_password || false}
                            onChange={(e) => {
                              setCreateUserFormData({
                                ...createUserFormData,
                                generate_password: e.target.checked,
                                password: e.target.checked ? undefined : createUserFormData.password
                              });
                              if (e.target.checked) setShowPassword(false);
                            }}
                          />
                          Gerar senha automaticamente
                        </label>
                      </div>
                    </div>

                    <div style={styles.formGroup}>
                      <label style={styles.label}>Status *</label>
                      <select
                        value={createUserFormData.status || 'active'}
                        onChange={(e) =>
                          setCreateUserFormData({
                            ...createUserFormData,
                            status: e.target.value as 'active' | 'inactive',
                          })
                        }
                        style={styles.input}
                      >
                        <option value="active">Ativo</option>
                        <option value="inactive">Inativo</option>
                      </select>
                    </div>

                    <div style={styles.formActions}>
                      <button onClick={handleBackStep} style={styles.cancelButton}>
                        Voltar
                      </button>
                      <button
                        onClick={handleCreateUser}
                        style={styles.saveButton}
                        disabled={createUserLoading}
                      >
                        {createUserLoading ? 'Criando...' : 'Criar Usuário'}
                      </button>
                    </div>
                  </div>
                )}
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newUserButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
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
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  stepIndicator: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '24px',
    borderBottom: '1px solid #e5e5e5',
    gap: '16px',
  },
  stepContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    maxWidth: '150px',
  },
  stepCircle: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#e5e5e5',
    color: '#737373',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'all 0.3s',
    flexShrink: 0,
  },
  stepCircleActive: {
    backgroundColor: '#7c3aed',
    color: '#ffffff',
  },
  stepLine: {
    width: '100px',
    height: '2px',
    backgroundColor: '#e5e5e5',
    marginTop: '19px',
    flexShrink: 0,
  },
  stepLabel: {
    fontSize: '12px',
    color: '#737373',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: '1.4',
  },
  stepContent: {
    padding: '0',
  },
  userTypeButtons: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '16px',
    marginTop: '12px',
  },
  userTypeButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '20px 16px',
    backgroundColor: '#ffffff',
    border: '2px solid #e5e5e5',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
  },
  userTypeButtonSelected: {
    borderWidth: '2px',
    boxShadow: '0 8px 16px rgba(124, 58, 237, 0.2)',
  },
  userTypeIconCircle: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s',
  },
  userTypeLabel: {
    fontSize: '14px',
    fontWeight: '500',
    textAlign: 'center',
    transition: 'color 0.3s',
  },
  fieldError: {
    color: '#ef4444',
    fontSize: '12px',
    marginTop: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  passwordInputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  passwordInput: {
    width: '100%',
    padding: '12px 40px 12px 12px',
    fontSize: '14px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    boxSizing: 'border-box',
  },
  passwordToggleBtn: {
    position: 'absolute',
    right: '12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    padding: '4px',
  },
};

export default AdminUsersPage;

