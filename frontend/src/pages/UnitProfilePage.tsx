import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import { unitsApi } from '../services/unitsApi';
import { demandsApi } from '../services/demandsApi';
import { clinicUsersApi } from '../services/clinicUsersApi';
import { useAlert } from '../hooks/useAlert';
import { Unit, UpdateUnitData } from '../types/units';
import { Demand } from '../services/demandsApi';
import { ClinicUser } from '../types/units';
import { BarChart2, ClipboardList, ShoppingCart, Building2, Users, LogOut, Edit, ArrowLeft, MapPin, Phone, User, Calendar, FileText, CheckCircle, XCircle, Clock } from 'lucide-react';
import colors from '../styles/colors';

const UnitProfilePage: React.FC = () => {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useAlert();
  
  const [unit, setUnit] = useState<Unit | null>(null);
  const [stats, setStats] = useState({
    totalDemands: 0,
    openDemands: 0,
    totalApplications: 0,
    pendingApplications: 0,
  });
  const [demands, setDemands] = useState<Demand[]>([]);
  const [unitUsers, setUnitUsers] = useState<ClinicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<UpdateUnitData>({
    name: '',
    nickname: '',
    cnpj: '',
    address: '',
    city: '',
    state: '',
    phone: '',
    technical_manager: '',
  });

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = user?.user_metadata?.role || user?.role;
  const isCADMIN = userRole === 'CADMIN';

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={20} color={colors.primary} />, action: 'navigate', path: '/clinic-dashboard' },
    { id: 'demands', label: 'Demandas', icon: <ClipboardList size={20} color={colors.primary} />, action: 'navigate', path: '/demands' },
    { id: 'marketplace', label: 'Marketplace', icon: <ShoppingCart size={20} color={colors.primary} />, action: 'navigate', path: '/marketplace' },
    { id: 'units', label: 'Gerenciar Unidades', icon: <Building2 size={20} color={colors.primary} />, action: 'navigate', path: '/units' },
    { id: 'users', label: 'Gerenciar Usuários', icon: <Users size={20} color={colors.primary} />, action: 'navigate', path: '/users' },
    { id: 'logout', label: 'Sair', icon: <LogOut size={20} color={colors.primary} />, action: 'logout' },
  ];

  useEffect(() => {
    if (unitId) {
      loadUnitData();
    }
  }, [unitId]);

  const loadUnitData = async () => {
    if (!unitId) return;
    
    try {
      setLoading(true);
      
      // Load unit data
      const { unit: unitData } = await unitsApi.getById(unitId);
      setUnit(unitData);
      setFormData({
        name: unitData.name,
        nickname: unitData.nickname || '',
        cnpj: unitData.cnpj || '',
        address: unitData.address,
        city: unitData.city,
        state: unitData.state,
        phone: unitData.phone || '',
        technical_manager: unitData.technical_manager || '',
      });

      // Load statistics
      const { stats: unitStats } = await unitsApi.getUnitStats(unitId);
      setStats(unitStats);

      // Load demands
      const { demands: unitDemands } = await demandsApi.getDemandsByUnit(unitId);
      setDemands(unitDemands);

      // Load users
      if (unitData.clinic_id) {
        const { clinic_users } = await clinicUsersApi.getClinicUsers(unitData.clinic_id, unitId);
        setUnitUsers(clinic_users || []);
      }
    } catch (error: any) {
      console.error('Error loading unit data:', error);
      showError('Erro ao carregar dados da unidade: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!unitId) return;

    try {
      setSaving(true);
      const { unit: updatedUnit } = await unitsApi.update(unitId, formData);
      setUnit(updatedUnit);
      setIsEditing(false);
      showSuccess('Unidade atualizada com sucesso!');
    } catch (error: any) {
      showError('Erro ao atualizar unidade: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (unit) {
      setFormData({
        name: unit.name,
        nickname: unit.nickname || '',
        cnpj: unit.cnpj || '',
        address: unit.address,
        city: unit.city,
        state: unit.state,
        phone: unit.phone || '',
        technical_manager: unit.technical_manager || '',
      });
    }
    setIsEditing(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatCNPJ = (cnpj?: string) => {
    if (!cnpj) return 'N/A';
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  const formatPhone = (phone?: string) => {
    if (!phone) return 'N/A';
    return phone.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
      case 'active':
        return { label: 'Aprovada', color: '#10b981', bg: '#d1fae5' };
      case 'pending_review':
        return { label: 'Pendente', color: '#f59e0b', bg: '#fef3c7' };
      case 'rejected':
        return { label: 'Rejeitada', color: '#ef4444', bg: '#fee2e2' };
      case 'inactive':
        return { label: 'Inativa', color: '#6b7280', bg: '#f3f4f6' };
      default:
        return { label: status, color: '#6b7280', bg: '#f3f4f6' };
    }
  };

  const getDemandStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return { label: 'Aberta', icon: <Clock size={14} color="#3b82f6" />, color: '#3b82f6', bg: '#dbeafe' };
      case 'in_progress':
        return { label: 'Em Andamento', icon: <Clock size={14} color="#f59e0b" />, color: '#f59e0b', bg: '#fef3c7' };
      case 'closed':
        return { label: 'Fechada', icon: <CheckCircle size={14} color="#10b981" />, color: '#10b981', bg: '#d1fae5' };
      case 'cancelled':
        return { label: 'Cancelada', icon: <XCircle size={14} color="#ef4444" />, color: '#ef4444', bg: '#fee2e2' };
      default:
        return { label: status, icon: null, color: '#6b7280', bg: '#f3f4f6' };
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: { [key: string]: string } = {
      CADMIN: 'Administrador',
      CMANAGER: 'Gerente',
      CASSISTANT: 'Assistente',
      CVET_INTERNAL: 'Veterinário Interno',
    };
    return labels[role] || role;
  };

  if (loading) {
    return (
      <DashboardLayout pageName="Carregando..." menuItems={menuItems}>
        <div style={styles.loadingContainer}>
          <p>Carregando informações da unidade...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!unit) {
    return (
      <DashboardLayout pageName="Unidade não encontrada" menuItems={menuItems}>
        <div style={styles.errorContainer}>
          <p>Unidade não encontrada.</p>
          <button onClick={() => navigate('/clinic-dashboard')} style={styles.backButton}>
            Voltar ao Dashboard
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const statusBadge = getStatusBadge(unit.status);

  return (
    <DashboardLayout pageName={`Unidade: ${unit.name}`} menuItems={menuItems}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={() => navigate('/clinic-dashboard')} style={styles.backButton}>
            <ArrowLeft size={20} />
            Voltar
          </button>
          <div style={styles.headerContent}>
            <div>
              <h1 style={styles.title}>
                {unit.name}
                {unit.is_main && <span style={styles.mainBadge}>⭐ Principal</span>}
              </h1>
              {unit.nickname && <p style={styles.subtitle}>{unit.nickname}</p>}
            </div>
            {isCADMIN && (
              <div style={styles.headerActions}>
                {!isEditing ? (
                  <button onClick={() => setIsEditing(true)} style={styles.editButton}>
                    <Edit size={16} />
                    Editar
                  </button>
                ) : (
                  <div style={styles.editActions}>
                    <button onClick={handleCancel} style={styles.cancelButton}>
                      Cancelar
                    </button>
                    <button onClick={handleSave} style={styles.saveButton} disabled={saving}>
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <div style={{ ...styles.statusBadge, backgroundColor: statusBadge.bg, color: statusBadge.color }}>
          {statusBadge.label}
        </div>

        {/* Informações Gerais */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Informações Gerais</h2>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>Nome</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={styles.input}
                />
              ) : (
                <p style={styles.infoValue}>{unit.name}</p>
              )}
            </div>

            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>Apelido</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  style={styles.input}
                  placeholder="Opcional"
                />
              ) : (
                <p style={styles.infoValue}>{unit.nickname || 'N/A'}</p>
              )}
            </div>

            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>CNPJ</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  style={styles.input}
                  placeholder="Opcional"
                />
              ) : (
                <p style={styles.infoValue}>{formatCNPJ(unit.cnpj)}</p>
              )}
            </div>

            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>
                <MapPin size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Endereço
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={styles.input}
                />
              ) : (
                <p style={styles.infoValue}>{unit.address}</p>
              )}
            </div>

            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>Cidade</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  style={styles.input}
                />
              ) : (
                <p style={styles.infoValue}>{unit.city}</p>
              )}
            </div>

            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>Estado</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  style={styles.input}
                  maxLength={2}
                  placeholder="Ex: SP"
                />
              ) : (
                <p style={styles.infoValue}>{unit.state}</p>
              )}
            </div>

            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>
                <Phone size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Telefone
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={styles.input}
                  placeholder="Opcional"
                />
              ) : (
                <p style={styles.infoValue}>{formatPhone(unit.phone)}</p>
              )}
            </div>

            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>
                <User size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Responsável Técnico
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.technical_manager}
                  onChange={(e) => setFormData({ ...formData, technical_manager: e.target.value })}
                  style={styles.input}
                  placeholder="Opcional"
                />
              ) : (
                <p style={styles.infoValue}>{unit.technical_manager || 'N/A'}</p>
              )}
            </div>

            <div style={styles.infoItem}>
              <label style={styles.infoLabel}>
                <Calendar size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Data de Criação
              </label>
              <p style={styles.infoValue}>{formatDate(unit.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Estatísticas */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Estatísticas</h2>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statIcon}><FileText size={24} color={colors.primary} /></div>
              <div style={styles.statContent}>
                <p style={styles.statLabel}>Total de Demandas</p>
                <p style={styles.statValue}>{stats.totalDemands}</p>
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon}><Clock size={24} color="#3b82f6" /></div>
              <div style={styles.statContent}>
                <p style={styles.statLabel}>Demandas Abertas</p>
                <p style={styles.statValue}>{stats.openDemands}</p>
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon}><Users size={24} color="#10b981" /></div>
              <div style={styles.statContent}>
                <p style={styles.statLabel}>Total de Candidaturas</p>
                <p style={styles.statValue}>{stats.totalApplications}</p>
              </div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon}><Clock size={24} color="#f59e0b" /></div>
              <div style={styles.statContent}>
                <p style={styles.statLabel}>Candidaturas Pendentes</p>
                <p style={styles.statValue}>{stats.pendingApplications}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Demandas */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Demandas</h2>
          {demands.length === 0 ? (
            <p style={styles.emptyMessage}>Nenhuma demanda encontrada para esta unidade.</p>
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.tableHeader}>Título</th>
                    <th style={styles.tableHeader}>Status</th>
                    <th style={styles.tableHeader}>Data de Criação</th>
                    <th style={styles.tableHeader}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {demands.map((demand) => {
                    const demandStatus = getDemandStatusBadge(demand.status);
                    return (
                      <tr key={demand.id} style={styles.tableRow}>
                        <td style={styles.tableCell}>{demand.title}</td>
                        <td style={styles.tableCell}>
                          <span style={{ ...styles.demandStatusBadge, backgroundColor: demandStatus.bg, color: demandStatus.color }}>
                            {demandStatus.icon}
                            {demandStatus.label}
                          </span>
                        </td>
                        <td style={styles.tableCell}>{formatDate(demand.created_at)}</td>
                        <td style={styles.tableCell}>
                          <button
                            onClick={() => navigate(`/demands/${demand.id}`)}
                            style={styles.viewButton}
                          >
                            Ver Detalhes
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Usuários */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Usuários</h2>
          {unitUsers.length === 0 ? (
            <p style={styles.emptyMessage}>Nenhum usuário associado a esta unidade.</p>
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.tableHeader}>Email</th>
                    <th style={styles.tableHeader}>Role</th>
                    <th style={styles.tableHeader}>Status</th>
                    <th style={styles.tableHeader}>Data de Convite</th>
                  </tr>
                </thead>
                <tbody>
                  {unitUsers.map((clinicUser) => (
                    <tr key={clinicUser.id} style={styles.tableRow}>
                      <td style={styles.tableCell}>{clinicUser.user?.email || 'N/A'}</td>
                      <td style={styles.tableCell}>
                        <span style={styles.roleBadge}>{getRoleLabel(clinicUser.role)}</span>
                      </td>
                      <td style={styles.tableCell}>
                        <span style={{
                          ...styles.statusBadgeSmall,
                          backgroundColor: clinicUser.status === 'active' ? '#d1fae5' : '#fef3c7',
                          color: clinicUser.status === 'active' ? '#10b981' : '#f59e0b',
                        }}>
                          {clinicUser.status === 'active' ? 'Ativo' : clinicUser.status === 'pending' ? 'Pendente' : 'Inativo'}
                        </span>
                      </td>
                      <td style={styles.tableCell}>
                        {clinicUser.invited_at ? formatDate(clinicUser.invited_at) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '32px',
    fontFamily: 'Inter, sans-serif',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '400px',
    fontSize: '16px',
    color: '#737373',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '16px',
  },
  header: {
    marginBottom: '24px',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#262626',
    marginBottom: '16px',
    transition: 'all 0.2s',
  },
  headerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#737373',
    margin: '4px 0 0 0',
    fontStyle: 'italic',
  },
  mainBadge: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#92400e',
    backgroundColor: '#fef3c7',
    padding: '4px 12px',
    borderRadius: '12px',
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
  },
  editButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  editActions: {
    display: 'flex',
    gap: '12px',
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
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '6px 16px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '24px',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    border: '1px solid #e5e5e5',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    margin: '0 0 20px 0',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  infoLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#737373',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  infoValue: {
    fontSize: '16px',
    color: '#262626',
    margin: 0,
  },
  input: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  statCard: {
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    border: '1px solid #e5e5e5',
  },
  statIcon: {
    flexShrink: 0,
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    fontSize: '12px',
    color: '#737373',
    margin: '0 0 4px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeaderRow: {
    backgroundColor: '#f9fafb',
  },
  tableHeader: {
    padding: '12px 16px',
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
    padding: '12px 16px',
    fontSize: '14px',
    color: '#262626',
  },
  demandStatusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
  },
  roleBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: '#e0e7ff',
    color: '#4338ca',
  },
  statusBadgeSmall: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
  },
  viewButton: {
    padding: '6px 12px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  emptyMessage: {
    textAlign: 'center',
    padding: '40px',
    color: '#737373',
    fontSize: '14px',
  },
};

export default UnitProfilePage;

