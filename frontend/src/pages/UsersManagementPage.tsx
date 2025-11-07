import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { useAlert } from '../hooks/useAlert';
import { usePermissions } from '../hooks/usePermissions';
import { useUnit } from '../contexts/UnitContext';
import { clinicUsersApi } from '../services/clinicUsersApi';
import { ClinicUser, UserInvitation, Role } from '../types/units';
import { getRoleDisplayName, getRoleColor } from '../utils/permissions';
import { Home, ClipboardList, ShoppingCart, Building2, Users, LogOut } from 'lucide-react';
import colors from '../styles/colors';

const UsersManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError, showConfirm } = useAlert();
  const { canInviteUser, canEditUser, canDeleteUser } = usePermissions();
  const { units, selectedUnit } = useUnit();

  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<ClinicUser[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users');

  const [inviteForm, setInviteForm] = useState({
    email: '',
    unit_id: '',
    role: 'CASSISTANT' as Role,
  });

  const user = JSON.parse(localStorage.getItem('user') || '');
  const userRole = user?.user_metadata?.role || user?.role;
  const clinicId = user.id;

  const getMenuItems = (): MenuItem[] => {
    const baseItems: MenuItem[] = [];

    if (userRole === 'clinic') {
      baseItems.push(
<<<<<<< HEAD
        { id: 'dashboard', label: 'Dashboard', icon: <Home size={20} color={colors.primary} />, action: 'navigate', path: '/clinic-dashboard' },
        { id: 'demands', label: 'Demandas', icon: <ClipboardList size={20} color={colors.primary} />, action: 'navigate', path: '/demands' },
        { id: 'marketplace', label: 'Marketplace', icon: <ShoppingCart size={20} color={colors.primary} />, action: 'navigate', path: '/marketplace' },
        { id: 'units', label: 'Gerenciar Unidades', icon: <Building2 size={20} color={colors.primary} />, action: 'navigate', path: '/units' },
        { id: 'users', label: 'Gerenciar Usuários', icon: <Users size={20} color={colors.primary} />, action: 'navigate', path: '/users' },
        { id: 'logout', label: 'Sair', icon: <LogOut size={20} color={colors.primary} />, action: 'logout' }
=======
                { id: 'dashboard', label: 'Dashboard', icon: <Home size={20} color={colors.primary} />, action: 'navigate', path: '/clinic-dashboard' },
                { id: 'demands', label: 'Demandas', icon: <ClipboardList size={20} color={colors.primary} />, action: 'navigate', path: '/demands' },
                { id: 'marketplace', label: 'Marketplace', icon: <ShoppingCart size={20} color={colors.primary} />, action: 'navigate', path: '/marketplace' },
        { id: 'units', label: 'Gerenciar Unidades', icon: <Building2 size={20} color={colors.primary} />, action: 'navigate', path: '/units' },
                { id: 'users', label: 'Gerenciar Usuários', icon: <Users size={20} color={colors.primary} />, action: 'navigate', path: '/users' },
                { id: 'logout', label: 'Sair', icon: <LogOut size={20} color={colors.primary} />, action: 'logout' }
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      );
    }

    return baseItems;
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load users
      const usersResult = await clinicUsersApi.getClinicUsers(clinicId);
      setUsers(usersResult.clinic_users);

      // Load pending invitations
      const invitationsResult = await clinicUsersApi.getPendingInvitations(clinicId);
      setInvitations(invitationsResult.invitations);
    } catch (error: any) {
      showError('Erro ao carregar dados: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = () => {
    setInviteForm({
      email: '',
      unit_id: selectedUnit?.id || units[0]?.id || '',
      role: 'CASSISTANT',
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setInviteForm({
      email: '',
      unit_id: '',
      role: 'CASSISTANT',
    });
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteForm.email || !inviteForm.unit_id || !inviteForm.role) {
      showError('Por favor, preencha todos os campos');
      return;
    }

    try {
      setLoading(true);
      await clinicUsersApi.invite({
        email: inviteForm.email,
        clinic_id: clinicId,
        unit_id: inviteForm.unit_id,
        role: inviteForm.role,
      });

      showSuccess('Convite enviado com sucesso!');
      await loadData();
      handleCloseModal();
    } catch (error: any) {
      showError('Erro ao enviar convite: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUser = (clinicUser: ClinicUser) => {
    showConfirm(
      `Tem certeza que deseja remover o usuário "${clinicUser.user?.email}"?`,
      async () => {
        try {
          await clinicUsersApi.removeUser(clinicUser.id);
          showSuccess('Usuário removido com sucesso!');
          await loadData();
        } catch (error: any) {
          showError('Erro ao remover usuário: ' + (error.message || ''));
        }
      },
      'Remover Usuário'
    );
  };

  const handleCancelInvitation = (invitation: UserInvitation) => {
    showConfirm(
      `Tem certeza que deseja cancelar o convite para "${invitation.email}"?`,
      async () => {
        try {
          await clinicUsersApi.cancelInvitation(invitation.id);
          showSuccess('Convite cancelado com sucesso!');
          await loadData();
        } catch (error: any) {
          showError('Erro ao cancelar convite: ' + (error.message || ''));
        }
      },
      'Cancelar Convite'
    );
  };

  const getUnitName = (unitId?: string) => {
    if (!unitId) return 'N/A';
    const unit = units.find((u) => u.id === unitId);
    return unit ? unit.name : 'N/A';
  };

  return (
    <DashboardLayout pageName="Gerenciar Usuários" menuItems={getMenuItems()}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Usuários</h1>
            <p style={styles.subtitle}>Gerencie os usuários da sua clínica</p>
          </div>
          {canInviteUser && (
            <button onClick={handleOpenModal} style={styles.createButton}>
              + Convidar Usuário
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            onClick={() => setActiveTab('users')}
            style={{
              ...styles.tab,
              ...(activeTab === 'users' && styles.activeTab),
            }}
          >
            Usuários ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            style={{
              ...styles.tab,
              ...(activeTab === 'invitations' && styles.activeTab),
            }}
          >
            Convites Pendentes ({invitations.length})
          </button>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <>
            {users.length === 0 ? (
              <div style={styles.emptyState}>
                <p style={styles.emptyText}>Nenhum usuário cadastrado</p>
              </div>
            ) : (
              <div style={styles.table}>
                <div style={styles.tableHeader}>
                  <div style={styles.tableCell}>Email</div>
                  <div style={styles.tableCell}>Unidade</div>
                  <div style={styles.tableCell}>Role</div>
                  <div style={styles.tableCell}>Status</div>
                  <div style={styles.tableCell}>Ações</div>
                </div>
                {users.map((clinicUser) => (
                  <div key={clinicUser.id} style={styles.tableRow}>
                    <div style={styles.tableCell}>{clinicUser.user?.email || 'N/A'}</div>
                    <div style={styles.tableCell}>{getUnitName(clinicUser.unit_id)}</div>
                    <div style={styles.tableCell}>
                      <span
                        style={{
                          ...styles.roleBadge,
                          backgroundColor: getRoleColor(clinicUser.role),
                        }}
                      >
                        {getRoleDisplayName(clinicUser.role)}
                      </span>
                    </div>
                    <div style={styles.tableCell}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          backgroundColor:
                            clinicUser.status === 'active' ? '#10b981' : '#6b7280',
                        }}
                      >
                        {clinicUser.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div style={styles.tableCell}>
                      {canDeleteUser && (
                        <button
                          onClick={() => handleRemoveUser(clinicUser)}
                          style={styles.removeButton}
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Invitations Tab */}
        {activeTab === 'invitations' && (
          <>
            {invitations.length === 0 ? (
              <div style={styles.emptyState}>
                <p style={styles.emptyText}>Nenhum convite pendente</p>
              </div>
            ) : (
              <div style={styles.table}>
                <div style={styles.tableHeader}>
                  <div style={styles.tableCell}>Email</div>
                  <div style={styles.tableCell}>Unidade</div>
                  <div style={styles.tableCell}>Role</div>
                  <div style={styles.tableCell}>Expira em</div>
                  <div style={styles.tableCell}>Ações</div>
                </div>
                {invitations.map((invitation) => (
                  <div key={invitation.id} style={styles.tableRow}>
                    <div style={styles.tableCell}>{invitation.email}</div>
                    <div style={styles.tableCell}>{getUnitName(invitation.unit_id)}</div>
                    <div style={styles.tableCell}>
                      <span
                        style={{
                          ...styles.roleBadge,
                          backgroundColor: getRoleColor(invitation.role),
                        }}
                      >
                        {getRoleDisplayName(invitation.role)}
                      </span>
                    </div>
                    <div style={styles.tableCell}>
                      {new Date(invitation.expires_at).toLocaleDateString('pt-BR')}
                    </div>
                    <div style={styles.tableCell}>
                      <button
                        onClick={() => handleCancelInvitation(invitation)}
                        style={styles.removeButton}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Invite Modal */}
        {showModal && (
          <div style={styles.modalOverlay} onClick={handleCloseModal}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h2 style={styles.modalTitle}>Convidar Usuário</h2>
              <form onSubmit={handleInviteSubmit} style={styles.form}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Email *</label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, email: e.target.value })
                    }
                    style={styles.input}
                    required
                  />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Unidade *</label>
                  <select
                    value={inviteForm.unit_id}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, unit_id: e.target.value })
                    }
                    style={styles.input}
                    required
                  >
                    <option value="">Selecione uma unidade</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Role *</label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, role: e.target.value as Role })
                    }
                    style={styles.input}
                    required
                  >
                    <option value="CADMIN">Administrador da Clínica</option>
                    <option value="CMANAGER">Gestor de Unidade</option>
                    <option value="CASSISTANT">Assistente/Secretário</option>
                    <option value="CVET_INTERNAL">Veterinário Interno</option>
                  </select>
                </div>
                <div style={styles.modalActions}>
                  <button type="button" onClick={handleCloseModal} style={styles.cancelButton}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading} style={styles.submitButton}>
                    {loading ? 'Enviando...' : 'Enviar Convite'}
                  </button>
                </div>
              </form>
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
    marginBottom: '32px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    margin: 0,
  },
  subtitle: {
    fontSize: '16px',
    color: '#737373',
    marginTop: '8px',
  },
  createButton: {
    padding: '12px 24px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '1px solid #e5e5e5',
  },
  tab: {
    padding: '12px 24px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: '14px',
    fontWeight: '500',
    color: '#737373',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  activeTab: {
    borderBottomColor: '#7c3aed',
    color: '#7c3aed',
  },
  emptyState: {
    textAlign: 'center',
    padding: '64px 32px',
  },
  emptyText: {
    fontSize: '18px',
    color: '#737373',
  },
  table: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr',
    backgroundColor: '#f5f5f5',
    padding: '16px 24px',
    fontWeight: '600',
    fontSize: '14px',
    color: '#525252',
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 1fr',
    padding: '16px 24px',
    borderTop: '1px solid #e5e5e5',
    alignItems: 'center',
  },
  tableCell: {
    fontSize: '14px',
    color: '#262626',
  },
  roleBadge: {
    padding: '4px 12px',
    borderRadius: '16px',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '16px',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block',
  },
  removeButton: {
    padding: '6px 12px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
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
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: '600',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    marginBottom: '24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#525252',
  },
  input: {
    padding: '12px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    color: '#262626',
    outline: 'none',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  cancelButton: {
    flex: '1',
    padding: '12px',
    backgroundColor: '#f5f5f5',
    color: '#525252',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  submitButton: {
    flex: '1',
    padding: '12px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
};

export default UsersManagementPage;

