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
import { Edit, ArrowLeft, MapPin, Phone, User, Calendar, FileText, CheckCircle, XCircle, Clock, Users, MessageCircle, Plus, ClipboardList } from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';
import UnitProfileVetView from '../components/UnitProfileVetView';
import UnitProfileAdminView from '../components/UnitProfileAdminView';
import AddressAutocomplete from '../components/AddressAutocomplete';

const UnitProfilePage: React.FC = () => {
  const { unitId } = useParams<{ unitId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError } = useAlert();
  
  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'CADMIN';
  const { menuItems } = useSidebarMenu(userRole);
  
  // Detectar contexto do visualizador
  const viewerRole = user ? getUserRole(user) : null;
  const isPublicView = !!unitId;
  
  // Função para obter clinic_id do usuário
  const getUserClinicId = (): string | null => {
    if (!user) return null;
    const userRole = getUserRole(user);
    
    // Se for clinic owner, clinic_id é o próprio user.id
    if (userRole === 'CADMIN' || (user as any)?.user_metadata?.role === 'clinic') {
      return user.id;
    }
    
    // Caso contrário, tentar obter do clinic_user
    const clinicUserStr = localStorage.getItem('clinic_user');
    if (clinicUserStr) {
      try {
        const clinicUser = JSON.parse(clinicUserStr);
        return clinicUser?.clinic_id || null;
      } catch (error) {
        console.warn('Failed to parse clinic_user:', error);
      }
    }
    
    return null;
  };
  
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

  const isCADMIN = userRole === 'CADMIN';
  
  // Detectar se é própria unidade
  const userClinicId = getUserClinicId();
  const isOwnUnit = !isPublicView || (unit && userClinicId === unit.clinic_id);
  const isVetView = isPublicView && viewerRole === 'VET';
  const isAdminView = isPublicView && viewerRole === 'ADMIN';
  const isClinicView = isOwnUnit && !isPublicView;
  
  // Layout de duas colunas apenas para próprio perfil da clínica
  const useTwoColumnLayout = isClinicView;

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

      // Load statistics (apenas se não for vet)
      // Vets não têm acesso a estatísticas, então não tentar carregar
      if (viewerRole !== 'VET') {
        try {
          const { stats: unitStats } = await unitsApi.getUnitStats(unitId);
          setStats(unitStats);
        } catch (statsError: any) {
          // Erro ao carregar estatísticas - não mostrar popup se for 403 (acesso negado)
          // Isso é esperado para usuários sem permissão
          if (statsError.message?.includes('Acesso negado a estatísticas') || 
              statsError.message?.includes('Acesso negado') ||
              statsError.message?.includes('403') ||
              statsError.status === 403) {
            console.log('Estatísticas não disponíveis para este usuário (esperado)');
          } else {
            console.error('Error loading statistics:', statsError);
            // Só mostrar erro se não for erro de permissão
          }
        }
      }

      // Load demands
      const { demands: unitDemands } = await demandsApi.getDemandsByUnit(unitId);
      setDemands(unitDemands);

      // Load users (apenas se for própria unidade)
      // Verificar se é própria unidade após carregar unitData
      const isUnitOwner = !isPublicView || (unitData && userClinicId === unitData.clinic_id);
      if (isUnitOwner && unitData.clinic_id) {
        try {
          const { clinic_users } = await clinicUsersApi.getClinicUsers(unitData.clinic_id, unitId);
          setUnitUsers(clinic_users || []);
        } catch (usersError: any) {
          // Erro ao carregar usuários - não mostrar popup se for 403
          if (usersError.message?.includes('Acesso negado') || 
              usersError.message?.includes('403') ||
              usersError.status === 403) {
            console.log('Lista de usuários não disponível para este usuário (esperado)');
          } else {
            console.error('Error loading users:', usersError);
          }
        }
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

    // Proteção: só permitir edição se for própria unidade
    if (!isOwnUnit || isPublicView) {
      showError('Você não tem permissão para editar esta unidade.');
      setIsEditing(false);
      return;
    }

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

  // Função para mascarar telefone quando não é própria unidade
  const maskPhone = (phone?: string): string => {
    if (!phone) return 'Não informado';
    if (isOwnUnit) return phone;
    // Mostrar apenas indicativo de que existe telefone
    return 'Telefone disponível (contato via mensagem)';
  };

  // Função para mostrar apenas cidade/estado do endereço quando não é própria unidade
  const getLocationDisplay = (): string => {
    if (isOwnUnit) {
      return unit?.address || 'Não informado';
    }
    if (unit?.city && unit?.state) {
      return `${unit.city}/${unit.state}`;
    }
    return unit?.address ? 'Endereço disponível' : 'Não informado';
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

  // Renderizar visão específica baseada no contexto
  return (
    <DashboardLayout pageName={`Unidade: ${unit.name}`} menuItems={menuItems}>
      {isVetView ? (
        <UnitProfileVetView unit={unit} />
      ) : isAdminView ? (
        <UnitProfileAdminView unit={unit} />
      ) : useTwoColumnLayout ? (
        // Layout de duas colunas para próprio perfil da clínica
        <div style={styles.twoColumnContainer}>
          {/* Lado Esquerdo Fixo */}
          <aside style={styles.leftSidebar}>
            {/* Nome e Status */}
            <div style={styles.profileHeader}>
              <h2 style={styles.profileName}>
                {unit.name}
                {unit.is_main && <span style={styles.mainBadgeInline}>⭐ Principal</span>}
              </h2>
              {unit.nickname && <p style={styles.profileSubtitle}>{unit.nickname}</p>}
              <div style={{ marginTop: '8px' }}>
                <div style={{ ...styles.statusBadge, backgroundColor: statusBadge.bg, color: statusBadge.color }}>
                  {statusBadge.label}
                </div>
              </div>
            </div>
            {/* Estatísticas - Só mostrar quando é própria unidade */}
            {isOwnUnit && (
              <div style={styles.statsSection}>
                <h3 style={styles.statsTitle}>Estatísticas</h3>
                <div style={styles.statsGrid}>
                  <div style={styles.statCardTwoColumn}>
                    <FileText size={20} color={colors.brand.primary[500]} />
                    <div style={styles.statContentTwoColumn}>
                      <h4 style={styles.statValueTwoColumn}>{stats.totalDemands}</h4>
                      <p style={styles.statLabelTwoColumn}>Total Demandas</p>
                    </div>
                  </div>
                  <div style={styles.statCardTwoColumn}>
                    <Clock size={20} color="#0ea5e9" />
                    <div style={styles.statContentTwoColumn}>
                      <h4 style={styles.statValueTwoColumn}>{stats.openDemands}</h4>
                      <p style={styles.statLabelTwoColumn}>Abertas</p>
                    </div>
                  </div>
                  <div style={styles.statCardTwoColumn}>
                    <ClipboardList size={20} color="#f59e0b" />
                    <div style={styles.statContentTwoColumn}>
                      <h4 style={styles.statValueTwoColumn}>{stats.totalApplications}</h4>
                      <p style={styles.statLabelTwoColumn}>Candidaturas</p>
                    </div>
                  </div>
                  <div style={styles.statCardTwoColumn}>
                    <CheckCircle size={20} color="#22c55e" />
                    <div style={styles.statContentTwoColumn}>
                      <h4 style={styles.statValueTwoColumn}>{stats.pendingApplications}</h4>
                      <p style={styles.statLabelTwoColumn}>Pendentes</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Ações Rápidas - Só mostrar quando é própria unidade */}
            {isOwnUnit && (
            <div style={styles.quickActionsSection}>
              <h3 style={styles.quickActionsTitle}>Ações Rápidas</h3>
              <div style={styles.quickActionsList}>
                <button
                  onClick={() => navigate('/create-demand')}
                  style={styles.quickActionButton}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = colors.brand.primary[500];
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <Plus size={18} />
                  <span>Criar Demanda</span>
                </button>
                <button
                  onClick={() => navigate('/clinic-demands')}
                  style={styles.quickActionButton}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = colors.brand.primary[500];
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <FileText size={18} />
                  <span>Ver Demandas</span>
                </button>
                <button
                  onClick={() => navigate('/clinic-applications')}
                  style={styles.quickActionButton}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = colors.brand.primary[500];
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <ClipboardList size={18} />
                  <span>Ver Candidaturas</span>
                </button>
                <button
                  onClick={() => navigate('/messages')}
                  style={styles.quickActionButton}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = colors.brand.primary[500];
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <MessageCircle size={18} />
                  <span>Mensagens</span>
                </button>
              </div>
            </div>
            )}
          </aside>
          {/* Lado Direito Scrollável */}
          <main style={styles.rightContent}>
            {/* Header com botão editar */}
            <div style={styles.contentHeader}>
              <h1 style={styles.title}>Perfil da Unidade</h1>
              {isOwnUnit && !isPublicView && (
                <>
                  {!isEditing ? (
                    <button onClick={() => setIsEditing(true)} style={styles.editButton}>
                      <Edit size={16} />
                      <span>Editar Unidade</span>
                    </button>
                  ) : (
                    <div style={styles.buttonGroup}>
                      <button onClick={handleCancel} style={styles.cancelButton} disabled={saving}>
                        Cancelar
                      </button>
                      <button onClick={handleSave} style={styles.saveButton} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Form */}
            <div style={styles.form}>
              {/* Nome */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Nome</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={styles.input}
                  />
                ) : (
                  <p style={styles.value}>{unit.name}</p>
                )}
              </div>
              {/* Apelido */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Apelido</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.nickname}
                    onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                    placeholder="Opcional"
                    style={styles.input}
                  />
                ) : (
                  <p style={styles.value}>{unit.nickname || 'N/A'}</p>
                )}
              </div>
              {/* CNPJ */}
              <div style={styles.formGroup}>
                <label style={styles.label}>CNPJ</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.cnpj}
                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                    placeholder="Opcional"
                    style={styles.input}
                  />
                ) : (
                  <p style={styles.value}>{formatCNPJ(unit.cnpj)}</p>
                )}
              </div>
              {/* Endereço */}
              <div style={styles.formGroup}>
                <label style={styles.label}>
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
                  <p style={styles.value}>{getLocationDisplay()}</p>
                )}
              </div>
              {/* Cidade */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Cidade</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    style={styles.input}
                  />
                ) : (
                  <p style={styles.value}>{unit.city}</p>
                )}
              </div>
              {/* Estado */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Estado</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    maxLength={2}
                    placeholder="Ex: SP"
                    style={styles.input}
                  />
                ) : (
                  <p style={styles.value}>{unit.state}</p>
                )}
              </div>
              {/* Telefone */}
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  <Phone size={16} style={{ display: 'inline', marginRight: '4px' }} />
                  Telefone
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Opcional"
                    style={styles.input}
                  />
                ) : (
                  <p style={styles.value}>{maskPhone(unit.phone)}</p>
                )}
              </div>
              {/* Responsável Técnico */}
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  <User size={16} style={{ display: 'inline', marginRight: '4px' }} />
                  Responsável Técnico
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.technical_manager}
                    onChange={(e) => setFormData({ ...formData, technical_manager: e.target.value })}
                    placeholder="Opcional"
                    style={styles.input}
                  />
                ) : (
                  <p style={styles.value}>{unit.technical_manager || 'N/A'}</p>
                )}
              </div>
              {/* Data de Criação */}
              {/* Data de Criação - Só mostrar quando é própria unidade */}
              {isOwnUnit && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>
                    <Calendar size={16} style={{ display: 'inline', marginRight: '4px' }} />
                    Data de Criação
                  </label>
                  <p style={styles.valueReadOnly}>{formatDate(unit.created_at)}</p>
                </div>
              )}
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
            {/* Usuários - Só mostrar quando é própria unidade */}
            {isOwnUnit && (
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
            )}
          </main>
        </div>
      ) : (
        // Layout simples de coluna única (fallback)
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
                <AddressAutocomplete
                  value={formData.address || ''}
                  onChange={(address) => setFormData({ ...formData, address })}
                  placeholder="Ex: Rua das Flores, 123 - Centro - São Paulo/SP"
                  className="input"
                />
              ) : (
                <p style={styles.infoValue}>{getLocationDisplay()}</p>
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
                <p style={styles.infoValue}>{maskPhone(unit.phone)}</p>
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

            {/* Data de Criação - Só mostrar quando é própria unidade */}
            {isOwnUnit && (
              <div style={styles.infoItem}>
                <label style={styles.infoLabel}>
                  <Calendar size={16} style={{ display: 'inline', marginRight: '4px' }} />
                  Data de Criação
                </label>
                <p style={styles.infoValue}>{formatDate(unit.created_at)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Estatísticas */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Estatísticas</h2>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statIcon}><FileText size={24} color={colors.brand.primary[500]} /></div>
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
      )}
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
    backgroundColor: colors.brand.primary[500],
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
    backgroundColor: colors.brand.primary[500],
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
  // Estilos para layout de duas colunas
  twoColumnContainer: {
    display: 'flex',
    gap: '32px',
    padding: '24px',
    fontFamily: 'Inter, sans-serif',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  leftSidebar: {
    width: '320px',
    flexShrink: 0,
    position: 'sticky' as const,
    top: '24px',
    height: 'fit-content',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb',
  },
  profileHeader: {
    marginBottom: '24px',
    paddingBottom: '24px',
    borderBottom: '1px solid #e5e7eb',
  },
  profileName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '22px',
    fontWeight: '700',
    color: '#262626',
    margin: '0 0 8px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  profileSubtitle: {
    fontSize: '14px',
    color: '#737373',
    margin: '0 0 8px 0',
    fontStyle: 'italic',
  },
  mainBadgeInline: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#92400e',
    backgroundColor: '#fef3c7',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  statsSection: {
    marginBottom: '24px',
    paddingBottom: '24px',
    borderBottom: '1px solid #e5e7eb',
  },
  statsTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  statCardTwoColumn: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  statContentTwoColumn: {
    flex: 1,
  },
  statValueTwoColumn: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '20px',
    fontWeight: '700',
    color: '#262626',
    margin: '0 0 2px 0',
  },
  statLabelTwoColumn: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#737373',
    margin: 0,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  quickActionsSection: {
    marginTop: '24px',
  },
  quickActionsTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  quickActionsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  quickActionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    backgroundColor: '#ffffff',
    color: '#262626',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'Inter, sans-serif',
    width: '100%',
    textAlign: 'left' as const,
  },
  rightContent: {
    flex: 1,
    minWidth: 0,
  },
  contentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    marginBottom: '32px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
  },
  value: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    margin: 0,
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  },
  valueReadOnly: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: 0,
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
  },
};

export default UnitProfilePage;

