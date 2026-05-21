import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import ProfilePhotoUploader from '../components/ProfilePhotoUploader';
import { vetsApi, Vet } from '../services/vetsApi';
import { useAlert } from '../hooks/useAlert';
import {
  Edit,
  FileText,
  Clock,
  CheckCircle,
  ClipboardList,
  MessageCircle,
  ShoppingCart,
  Calendar,
} from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { vetOrFreelancerRecordCanAccessDemandsFlow, canVetFreelancerAccessDemandsAndApplications } from '../utils/vetFreelancerDemandAccess';
import { useAuth } from '../AuthContext';
import { statisticsApi, VetStats } from '../services/statisticsApi';
import { specialtiesApi, Specialty } from '../services/specialtiesApi';
import VetProfileClinicView from '../components/VetProfileClinicView';
import VetProfileAdminView from '../components/VetProfileAdminView';
import AddressAutocomplete from '../components/AddressAutocomplete';

// Função para verificar se uma string é um UUID
const isUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

type VetOwnProfileEditSection =
  | 'info'
  | 'specialties'
  | 'certificates'
  | 'bio'
  | 'experience'
  | null;

const VetProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useAlert();
  
  // Se há um ID na URL, é visualização pública (não edição)
  const isPublicView = !!id;
  const isOwnProfile = !isPublicView || (user?.id === id);
  
  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'VET';
  const { menuItems: baseMenuFromSidebar } = useSidebarMenu(userRole);

  // Detectar contexto do visualizador
  const viewerRole = user ? getUserRole(user) : null;
  const isClinicView = isPublicView && (viewerRole === 'CADMIN' || viewerRole === 'CMANAGER');
  const isAdminView = isPublicView && viewerRole === 'ADMIN';
  const [vet, setVet] = useState<Vet | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  /** Edição por secção (perfil próprio, layout em cartões). */
  const [editingSection, setEditingSection] = useState<VetOwnProfileEditSection>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    bio: '',
    specialties: [] as string[],
    certificates: [] as string[],
    experience: '',
  });

  const [specialtyInput, setSpecialtyInput] = useState('');
  const [certificateInput, setCertificateInput] = useState('');
  const [stats, setStats] = useState<VetStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [specialtiesMap, setSpecialtiesMap] = useState<Map<string, string>>(new Map());
  const [loadingSpecialties, setLoadingSpecialties] = useState(false);

  const menuItems = useMemo(() => {
    const demandFlowOk = vet
      ? vetOrFreelancerRecordCanAccessDemandsFlow(vet)
      : canVetFreelancerAccessDemandsAndApplications(user);
    if (userRole !== 'VET' || demandFlowOk) {
      return baseMenuFromSidebar;
    }
    const pendingTooltip = 'Disponível após aprovação do seu cadastro pela equipe PetMi.';
    return baseMenuFromSidebar.map((item) => {
      if (item.id === 'demands' && item.subItems?.length) {
        return {
          ...item,
          subItems: item.subItems.map((sub) =>
            sub.id === 'demands-available' || sub.id === 'demands-applications'
              ? { ...sub, disabled: true, tooltip: pendingTooltip }
              : sub
          ),
        };
      }
      return item;
    });
  }, [userRole, vet, user, baseMenuFromSidebar]);

  const loadStats = useCallback(async (vetId: string) => {
    try {
      setLoadingStats(true);
      const { stats: vetStats } = await statisticsApi.getVetStats(vetId);
      setStats(vetStats);
    } catch (error: any) {
      console.error('Erro ao carregar estatísticas:', error);
      // Não mostrar erro ao usuário, apenas logar
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Carregar nomes das especialidades quando necessário
  const loadSpecialtiesNames = useCallback(async (specialtyIds: string[]) => {
    // Verificar se há UUIDs que precisam ser resolvidos
    const uuidsToResolve = specialtyIds.filter(id => isUUID(id));
    
    if (uuidsToResolve.length === 0) {
      // Se não há UUIDs, criar um mapa vazio (já são nomes)
      return;
    }

    try {
      setLoadingSpecialties(true);
      // Buscar todas as especialidades
      const { specialties } = await specialtiesApi.getAll();
      
      // Criar mapa de ID para nome
      const map = new Map<string, string>();
      specialties.forEach((spec: Specialty) => {
        map.set(spec.id, spec.name);
      });
      
      setSpecialtiesMap(map);
    } catch (error: any) {
      console.error('Erro ao carregar nomes das especialidades:', error);
      // Não mostrar erro ao usuário, apenas logar
    } finally {
      setLoadingSpecialties(false);
    }
  }, []);

  // Função para obter o nome da especialidade (resolve UUID se necessário)
  const getSpecialtyName = (spec: string): string => {
    if (isUUID(spec)) {
      return specialtiesMap.get(spec) || spec; // Retorna o nome se encontrado, senão retorna o UUID
    }
    return spec; // Já é um nome
  };

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      
      // Se há um ID na URL, carrega aquele perfil (visualização pública)
      // Caso contrário, carrega o perfil do usuário logado
      let vetId = id;
      
      if (!vetId) {
        const userStr = localStorage.getItem('user');
        if (!userStr || userStr.trim() === '') {
          if (!isPublicView) {
            navigate('/login');
            return;
          } else {
            showError('Veterinário não encontrado');
            navigate('/demands');
            return;
          }
        }

        const user = JSON.parse(userStr);
        if (!user || !user.id) {
          if (!isPublicView) {
            navigate('/login');
            return;
          } else {
            showError('Veterinário não encontrado');
            navigate('/demands');
            return;
          }
        }
        
        vetId = user.id;
      }

      if (!vetId) {
        showError('ID do veterinário não encontrado');
        return;
      }

      const response = await vetsApi.getById(vetId);
      // Extrair o objeto Vet corretamente (response sempre retorna { vet: Vet })
      const vetData: Vet = response.vet;
      setVet(vetData);
      setFormData({
        name: vetData.name,
        phone: vetData.phone || '',
        address: vetData.address || '',
        bio: vetData.bio || '',
        specialties: vetData.specialties || [],
        certificates: vetData.certificates || [],
        experience: vetData.experience || '', // ✅ fallback seguro
      });

      // Carregar estatísticas apenas se for o próprio perfil
      if (isOwnProfile && !isPublicView) {
        loadStats(vetId);
      }

      // Carregar nomes das especialidades se necessário
      if (vetData.specialties && vetData.specialties.length > 0) {
        loadSpecialtiesNames(vetData.specialties);
      }
    } catch (error: any) {
      console.error('Erro ao carregar perfil:', error);
      showError('Erro ao carregar perfil: ' + (error.message || 'Erro desconhecido'));
      if (isPublicView) {
        navigate('/demands');
      }
    } finally {
      setLoading(false);
    }
  }, [id, isPublicView, navigate, showError, isOwnProfile, loadStats, loadSpecialtiesNames]);

  useEffect(() => {
    loadProfile();
  }, [id, loadProfile]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const { vet: updatedVet } = await vetsApi.update(vet!.id, formData);
      setVet(updatedVet);
      setIsEditing(false);
      setEditingSection(null);
      showSuccess('Perfil atualizado com sucesso!');
    } catch (error: any) {
      showError('Erro ao atualizar perfil: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: vet!.name,
      phone: vet!.phone || '',
      address: vet!.address || '',
      bio: vet!.bio || '',
      specialties: vet!.specialties || [],
      certificates: vet!.certificates || [],
      experience: vet!.experience || '', // ✅ fallback seguro
    });
    setIsEditing(false);
    setEditingSection(null);
  };

  const handleCancelSection = (section: NonNullable<VetOwnProfileEditSection>) => {
    if (!vet) return;
    if (section === 'info') {
      setFormData((f) => ({
        ...f,
        name: vet.name,
        phone: vet.phone || '',
        address: vet.address || '',
      }));
    } else if (section === 'specialties') {
      setFormData((f) => ({ ...f, specialties: vet.specialties || [] }));
      setSpecialtyInput('');
    } else if (section === 'certificates') {
      setFormData((f) => ({ ...f, certificates: vet.certificates || [] }));
      setCertificateInput('');
    } else if (section === 'bio') {
      setFormData((f) => ({ ...f, bio: vet.bio || '' }));
    } else if (section === 'experience') {
      setFormData((f) => ({ ...f, experience: vet.experience || '' }));
    }
    setEditingSection(null);
  };

  const maskDocument = (doc: string | undefined): string => {
    if (!doc) return 'Não informado';
    if (doc.length === 11) {
      // CPF: 000.000.000-00
      return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (doc.length === 14) {
      // CNPJ: 00.000.000/0000-00
      return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return doc;
  };

  const getStatusBadge = () => {
    const a = vet?.approval_status;
    let label: string;
    let color: string;
    let bg: string;

    if (a === 'approved') {
      label = 'Aprovado';
      color = '#22c55e';
      bg = '#dcfce7';
    } else if (a === 'rejected') {
      label = 'Rejeitado';
      color = '#ef4444';
      bg = '#fee2e2';
    } else if (a === 'pending_review') {
      label = 'Em revisão';
      color = '#f59e0b';
      bg = '#fef3c7';
    } else if (a === 'pending_approval') {
      label = 'Pendente';
      color = '#f59e0b';
      bg = '#fef3c7';
    } else if (a === 'pending') {
      label = 'Aguardando onboarding';
      color = '#f59e0b';
      bg = '#fef3c7';
    } else {
      const legacy = vet?.status || 'pending';
      const map: Record<string, { label: string; color: string; bg: string }> = {
        active: { label: 'Aprovado', color: '#22c55e', bg: '#dcfce7' },
        pending: { label: 'Pendente', color: '#f59e0b', bg: '#fef3c7' },
        rejected: { label: 'Rejeitado', color: '#ef4444', bg: '#fee2e2' },
        inactive: { label: 'Inativo', color: '#6b7280', bg: '#f3f4f6' },
      };
      const c = map[legacy] || map.pending;
      label = c.label;
      color = c.color;
      bg = c.bg;
    }

    return (
      <span style={{
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '13px',
        fontWeight: '600',
        color,
        backgroundColor: bg,
        fontFamily: 'Inter, sans-serif',
      }}>
        {label}
      </span>
    );
  };

  const handlePhotoSelect = async (file: File) => {
    try {
      setUploadingPhoto(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const photo_url = reader.result as string;
        const { vet: updatedVet } = await vetsApi.uploadPhoto(vet!.id, photo_url);
        setVet(updatedVet);
        showSuccess('Foto atualizada com sucesso!');
        setUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      showError('Erro ao atualizar foto: ' + error.message);
      setUploadingPhoto(false);
    }
  };

  const addSpecialty = () => {
    if (specialtyInput.trim() && !formData.specialties.includes(specialtyInput.trim())) {
      setFormData({
        ...formData,
        specialties: [...formData.specialties, specialtyInput.trim()],
      });
      setSpecialtyInput('');
    }
  };

  const removeSpecialty = (specialty: string) => {
    setFormData({
      ...formData,
      specialties: formData.specialties.filter((s) => s !== specialty),
    });
  };

  const addCertificate = () => {
    if (certificateInput.trim() && !formData.certificates.includes(certificateInput.trim())) {
      setFormData({
        ...formData,
        certificates: [...formData.certificates, certificateInput.trim()],
      });
      setCertificateInput('');
    }
  };

  const removeCertificate = (certificate: string) => {
    setFormData({
      ...formData,
      certificates: formData.certificates.filter((c) => c !== certificate),
    });
  };

  /** Admin/clínica a ver ficha de outro vet: não usar "Meu Perfil". */
  const viewerIsStaffSeeingOtherVet =
    isPublicView && !isOwnProfile && (isAdminView || isClinicView);
  const layoutPageName =
    vet && viewerIsStaffSeeingOtherVet
      ? `Perfil: ${vet.name}`
      : viewerIsStaffSeeingOtherVet && !vet
        ? 'Perfil do veterinário'
        : 'Meu Perfil';

  if (loading) {
    return (
      <DashboardLayout pageName={layoutPageName} menuItems={menuItems}>
        <div style={styles.loading}>Carregando...</div>
      </DashboardLayout>
    );
  }

  if (!vet) {
    return (
      <DashboardLayout pageName={layoutPageName} menuItems={menuItems}>
        <div style={styles.error}>Erro ao carregar perfil</div>
      </DashboardLayout>
    );
  }

  // Layout de duas colunas apenas para próprio perfil, visualização pública mantém layout simples
  const useTwoColumnLayout = isOwnProfile && !isPublicView;

  /** Mesma regra do login: só demandas/candidaturas após aprovação + conta ativa. */
  const canDemandQuickActions = vetOrFreelancerRecordCanAccessDemandsFlow(vet);

  const pendingDemandActionsMsg =
    'Disponível após aprovação do seu cadastro pela equipe PetMi.';

  // Handlers para ações de admin
  const handleApproveVet = async (vetId: string) => {
    await vetsApi.approve(vetId);
    // Recarregar perfil
    await loadProfile();
  };

  const handleRejectVet = async (vetId: string, reason: string) => {
    await vetsApi.reject(vetId, reason);
    // Recarregar perfil
    await loadProfile();
  };

  return (
    <DashboardLayout pageName={layoutPageName} menuItems={menuItems}>
      {/* Renderizar visão específica baseada no contexto */}
      {isClinicView ? (
        <VetProfileClinicView vet={vet} clinicId={user?.id} />
      ) : isAdminView ? (
        <VetProfileAdminView
          vet={vet}
          getSpecialtyName={getSpecialtyName}
          onApprove={handleApproveVet}
          onReject={handleRejectVet}
        />
      ) : useTwoColumnLayout ? (
        // Layout de duas colunas para próprio perfil
        <div style={styles.twoColumnContainer}>
          {/* Lado Esquerdo Fixo */}
          <aside style={styles.leftSidebar}>
            {/* Foto de Perfil */}
            <div style={styles.photoSection}>
              <ProfilePhotoUploader
                currentPhotoUrl={vet.photo_url}
                onPhotoSelect={handlePhotoSelect}
                isUploading={uploadingPhoto}
              />
            </div>

            {/* Nome e Status */}
            <div style={styles.profileHeader}>
              <h2 style={styles.profileName}>{vet.name}</h2>
              <div style={{ marginTop: '8px' }}>
                {getStatusBadge()}
              </div>
            </div>

            {/* Estatísticas */}
            <div style={styles.statsSection}>
              <h3 style={styles.statsTitle}>Estatísticas Profissionais</h3>
              {loadingStats ? (
                <p style={styles.loadingText}>Carregando...</p>
              ) : stats ? (
                <div style={styles.statsGrid}>
                  <div style={styles.statCard}>
                    <FileText size={20} color={colors.brand.primary[500]} />
                    <div style={styles.statContent}>
                      <h4 style={styles.statValue}>{stats.totalApplications}</h4>
                      <p style={styles.statLabel}>Candidaturas</p>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <Clock size={20} color="#0ea5e9" />
                    <div style={styles.statContent}>
                      <h4 style={styles.statValue}>{stats.activeJobs}</h4>
                      <p style={styles.statLabel}>Ativos</p>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <CheckCircle size={20} color="#22c55e" />
                    <div style={styles.statContent}>
                      <h4 style={styles.statValue}>{stats.completedJobs}</h4>
                      <p style={styles.statLabel}>Concluídos</p>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <ClipboardList size={20} color="#f59e0b" />
                    <div style={styles.statContent}>
                      <h4 style={styles.statValue}>{stats.pendingApplications}</h4>
                      <p style={styles.statLabel}>Pendentes</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Ações Rápidas */}
            <div style={styles.quickActionsSection}>
              <h3 style={styles.quickActionsTitle}>Ações Rápidas</h3>
              <div style={styles.quickActionsList}>
                <button
                  type="button"
                  title={!canDemandQuickActions ? pendingDemandActionsMsg : undefined}
                  onClick={() => {
                    if (!canDemandQuickActions) {
                      showWarning(pendingDemandActionsMsg);
                      return;
                    }
                    navigate('/my-applications');
                  }}
                  style={{
                    ...styles.quickActionButton,
                    ...(!canDemandQuickActions ? styles.quickActionButtonDisabled : {}),
                  }}
                  onMouseEnter={(e) => {
                    if (!canDemandQuickActions) return;
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = colors.brand.primary[500];
                  }}
                  onMouseLeave={(e) => {
                    if (!canDemandQuickActions) return;
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <ClipboardList size={18} />
                  <span>Minhas Candidaturas</span>
                </button>
                <button
                  type="button"
                  title={!canDemandQuickActions ? pendingDemandActionsMsg : undefined}
                  onClick={() => {
                    if (!canDemandQuickActions) {
                      showWarning(pendingDemandActionsMsg);
                      return;
                    }
                    navigate('/demands');
                  }}
                  style={{
                    ...styles.quickActionButton,
                    ...(!canDemandQuickActions ? styles.quickActionButtonDisabled : {}),
                  }}
                  onMouseEnter={(e) => {
                    if (!canDemandQuickActions) return;
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = colors.brand.primary[500];
                  }}
                  onMouseLeave={(e) => {
                    if (!canDemandQuickActions) return;
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <FileText size={18} />
                  <span>Demandas Disponíveis</span>
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
                <button
                  onClick={() => navigate('/marketplace')}
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
                  <ShoppingCart size={18} />
                  <span>Marketplace</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Lado Direito — mesmo estilo de cartões que o admin (VetProfileAdminView) */}
          <main style={styles.rightContent}>
            {/* Informações Completas */}
            <div style={styles.vetMainSection}>
              <div style={styles.vetMainSectionHeader}>
                <h2 style={styles.vetMainSectionTitle}>Informações Completas</h2>
                {editingSection === 'info' ? (
                  <div style={styles.sectionButtonGroup}>
                    <button
                      type="button"
                      onClick={() => handleCancelSection('info')}
                      style={styles.cancelButton}
                      disabled={saving}
                    >
                      Cancelar
                    </button>
                    <button type="button" onClick={handleSave} style={styles.saveButton} disabled={saving}>
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                ) : (
                  editingSection === null && (
                    <button
                      type="button"
                      onClick={() => setEditingSection('info')}
                      style={styles.sectionEditButton}
                    >
                      <Edit size={16} />
                      <span>Editar</span>
                    </button>
                  )
                )}
              </div>
              {editingSection === 'info' ? (
                <div style={styles.vetInfoGrid}>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>Nome Completo</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>Email</label>
                    <p style={styles.vetFieldValueMuted}>{vet.email}</p>
                  </div>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>Telefone</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>CRMV</label>
                    <p style={styles.vetFieldValueMuted}>{vet.crmv}</p>
                  </div>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>Tipo de Documento</label>
                    <p style={styles.vetFieldValueMuted}>{vet.document_type || 'Não informado'}</p>
                  </div>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>Número do Documento</label>
                    <p style={styles.vetFieldValueMuted}>
                      {vet.document_number ? maskDocument(vet.document_number) : 'Não informado'}
                    </p>
                  </div>
                  <div style={styles.vetInfoItemFull}>
                    <label style={styles.vetFieldLabel}>Endereço Completo</label>
                    <AddressAutocomplete
                      value={formData.address}
                      onChange={(address) => setFormData({ ...formData, address })}
                      placeholder="Ex: Rua das Flores, 123 - Centro - São Paulo/SP"
                      className="input"
                    />
                  </div>
                </div>
              ) : (
                <div style={styles.vetInfoGrid}>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>Nome Completo</label>
                    <p style={styles.vetFieldValue}>{vet.name}</p>
                  </div>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>Email</label>
                    <p style={styles.vetFieldValue}>{vet.email}</p>
                  </div>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>Telefone</label>
                    <p style={styles.vetFieldValue}>{vet.phone || 'Não informado'}</p>
                  </div>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>CRMV</label>
                    <p style={styles.vetFieldValue}>{vet.crmv || 'Não informado'}</p>
                  </div>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>Tipo de Documento</label>
                    <p style={styles.vetFieldValue}>{vet.document_type || 'Não informado'}</p>
                  </div>
                  <div style={styles.vetInfoItem}>
                    <label style={styles.vetFieldLabel}>Número do Documento</label>
                    <p style={styles.vetFieldValue}>
                      {vet.document_number ? maskDocument(vet.document_number) : 'Não informado'}
                    </p>
                  </div>
                  <div style={styles.vetInfoItemFull}>
                    <label style={styles.vetFieldLabel}>Endereço Completo</label>
                    <p style={styles.vetFieldValue}>{vet.address || 'Não informado'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Especialidades */}
            <div style={styles.vetMainSection}>
              <div style={styles.vetMainSectionHeader}>
                <h2 style={styles.vetMainSectionTitle}>Especialidades</h2>
                {editingSection === 'specialties' ? (
                  <div style={styles.sectionButtonGroup}>
                    <button
                      type="button"
                      onClick={() => handleCancelSection('specialties')}
                      style={styles.cancelButton}
                      disabled={saving}
                    >
                      Cancelar
                    </button>
                    <button type="button" onClick={handleSave} style={styles.saveButton} disabled={saving}>
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                ) : (
                  editingSection === null && (
                    <button
                      type="button"
                      onClick={() => setEditingSection('specialties')}
                      style={styles.sectionEditButton}
                    >
                      <Edit size={16} />
                      <span>Editar</span>
                    </button>
                  )
                )}
              </div>
              {editingSection === 'specialties' ? (
                <>
                  <div style={styles.inputWithButton}>
                    <input
                      type="text"
                      value={specialtyInput}
                      onChange={(e) => setSpecialtyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSpecialty();
                        }
                      }}
                      placeholder="Adicionar especialidade"
                      style={styles.input}
                    />
                    <button type="button" onClick={addSpecialty} style={styles.addButton}>
                      + Adicionar
                    </button>
                  </div>
                  <div style={styles.tagContainer}>
                    {formData.specialties.map((spec) => (
                      <span key={spec} style={styles.tag}>
                        {getSpecialtyName(spec)}
                        <button
                          type="button"
                          onClick={() => removeSpecialty(spec)}
                          style={styles.removeTagButton}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </>
              ) : loadingSpecialties ? (
                <p style={styles.emptyText}>Carregando especialidades...</p>
              ) : vet.specialties && vet.specialties.length > 0 ? (
                <div style={styles.tagContainer}>
                  {vet.specialties.map((spec: string) => (
                    <span key={spec} style={styles.tagReadOnly}>
                      {getSpecialtyName(spec)}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={styles.emptyText}>Nenhuma especialidade cadastrada</p>
              )}
            </div>

            {/* Certificados */}
            <div style={styles.vetMainSection}>
              <div style={styles.vetMainSectionHeader}>
                <h2 style={styles.vetMainSectionTitle}>Certificados</h2>
                {editingSection === 'certificates' ? (
                  <div style={styles.sectionButtonGroup}>
                    <button
                      type="button"
                      onClick={() => handleCancelSection('certificates')}
                      style={styles.cancelButton}
                      disabled={saving}
                    >
                      Cancelar
                    </button>
                    <button type="button" onClick={handleSave} style={styles.saveButton} disabled={saving}>
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                ) : (
                  editingSection === null && (
                    <button
                      type="button"
                      onClick={() => setEditingSection('certificates')}
                      style={styles.sectionEditButton}
                    >
                      <Edit size={16} />
                      <span>Editar</span>
                    </button>
                  )
                )}
              </div>
              {editingSection === 'certificates' ? (
                <>
                  <div style={styles.inputWithButton}>
                    <input
                      type="text"
                      value={certificateInput}
                      onChange={(e) => setCertificateInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCertificate();
                        }
                      }}
                      placeholder="Adicionar certificado"
                      style={styles.input}
                    />
                    <button type="button" onClick={addCertificate} style={styles.addButton}>
                      + Adicionar
                    </button>
                  </div>
                  <div style={styles.tagContainer}>
                    {formData.certificates.map((cert) => (
                      <span key={cert} style={styles.tag}>
                        {cert}
                        <button
                          type="button"
                          onClick={() => removeCertificate(cert)}
                          style={styles.removeTagButton}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </>
              ) : vet.certificates && vet.certificates.length > 0 ? (
                <div style={styles.tagContainer}>
                  {vet.certificates.map((cert: string) => (
                    <span key={cert} style={styles.certTagReadOnly}>
                      {cert}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={styles.emptyText}>Nenhum certificado cadastrado</p>
              )}
            </div>

            {/* Biografia */}
            <div style={styles.vetMainSection}>
              <div style={styles.vetMainSectionHeader}>
                <h2 style={styles.vetMainSectionTitle}>Biografia</h2>
                {editingSection === 'bio' ? (
                  <div style={styles.sectionButtonGroup}>
                    <button
                      type="button"
                      onClick={() => handleCancelSection('bio')}
                      style={styles.cancelButton}
                      disabled={saving}
                    >
                      Cancelar
                    </button>
                    <button type="button" onClick={handleSave} style={styles.saveButton} disabled={saving}>
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                ) : (
                  editingSection === null && (
                    <button
                      type="button"
                      onClick={() => setEditingSection('bio')}
                      style={styles.sectionEditButton}
                    >
                      <Edit size={16} />
                      <span>Editar</span>
                    </button>
                  )
                )}
              </div>
              {editingSection === 'bio' ? (
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  placeholder="Conte um pouco sobre você..."
                  style={styles.textarea}
                  rows={4}
                />
              ) : (
                <p style={styles.vetFieldValue}>{vet.bio || 'Não informado'}</p>
              )}
            </div>

            {/* Experiência */}
            <div style={styles.vetMainSection}>
              <div style={styles.vetMainSectionHeader}>
                <h2 style={styles.vetMainSectionTitle}>Experiência</h2>
                {editingSection === 'experience' ? (
                  <div style={styles.sectionButtonGroup}>
                    <button
                      type="button"
                      onClick={() => handleCancelSection('experience')}
                      style={styles.cancelButton}
                      disabled={saving}
                    >
                      Cancelar
                    </button>
                    <button type="button" onClick={handleSave} style={styles.saveButton} disabled={saving}>
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                ) : (
                  editingSection === null && (
                    <button
                      type="button"
                      onClick={() => setEditingSection('experience')}
                      style={styles.sectionEditButton}
                    >
                      <Edit size={16} />
                      <span>Editar</span>
                    </button>
                  )
                )}
              </div>
              {editingSection === 'experience' ? (
                <textarea
                  value={formData.experience}
                  onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                  style={styles.textarea}
                  rows={4}
                />
              ) : (
                <p style={styles.vetFieldValue}>{vet.experience || 'Não informado'}</p>
              )}
            </div>

            {/* Informações da Conta (somente leitura) */}
            {(vet.created_at || vet.updated_at) && (
              <div style={styles.vetMainSection}>
                <h2 style={{ ...styles.vetMainSectionTitle, marginBottom: '20px' }}>Informações da Conta</h2>
                <div style={styles.vetInfoGrid}>
                  {vet.created_at && (
                    <div style={styles.vetInfoItem}>
                      <label style={styles.vetFieldLabel}>
                        <Calendar size={16} style={{ marginRight: '8px' }} />
                        Conta criada em
                      </label>
                      <p style={styles.vetFieldValue}>
                        {new Date(vet.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  )}
                  {vet.updated_at && (
                    <div style={styles.vetInfoItem}>
                      <label style={styles.vetFieldLabel}>
                        <Calendar size={16} style={{ marginRight: '8px' }} />
                        Última atualização
                      </label>
                      <p style={styles.vetFieldValue}>
                        {new Date(vet.updated_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      ) : (
        // Layout simples de coluna única para visualização pública
        <div style={styles.container}>
          <div style={styles.card}>
            {/* Header */}
            <div style={styles.header}>
              <h1 style={styles.title}>{isOwnProfile ? 'Meu Perfil' : `Perfil de ${vet.name}`}</h1>
              {isOwnProfile && (
                !isEditing ? (
                  <button onClick={() => setIsEditing(true)} style={styles.editButton}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Edit size={16} />
                      <span>Editar Perfil</span>
                    </div>
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
                )
              )}
            </div>

            {/* Photo */}
            <div style={styles.photoSection}>
              <ProfilePhotoUploader
                currentPhotoUrl={vet.photo_url}
                onPhotoSelect={isOwnProfile ? handlePhotoSelect : () => {}}
                isUploading={uploadingPhoto}
              />
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
                  <p style={styles.value}>{vet.name}</p>
                )}
              </div>

              {/* Email */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Email</label>
                <p style={styles.valueReadOnly}>{vet.email}</p>
              </div>

              {/* CRMV */}
              <div style={styles.formGroup}>
                <label style={styles.label}>CRMV</label>
                <p style={styles.valueReadOnly}>{vet.crmv}</p>
              </div>

              {/* Especialidades */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Especialidades</label>
                {isEditing ? (
                  <>
                    <div style={styles.inputWithButton}>
                      <input
                        type="text"
                        value={specialtyInput}
                        onChange={(e) => setSpecialtyInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSpecialty())}
                        placeholder="Adicionar especialidade"
                        style={styles.input}
                      />
                      <button onClick={addSpecialty} style={styles.addButton}>
                        + Adicionar
                      </button>
                    </div>
                    <div style={styles.tagContainer}>
                      {formData.specialties.map((spec) => (
                        <span key={spec} style={styles.tag}>
                          {spec}
                          <button
                            onClick={() => removeSpecialty(spec)}
                            style={styles.removeTagButton}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={styles.tagContainer}>
                    {loadingSpecialties ? (
                      <p style={styles.emptyText}>Carregando especialidades...</p>
                    ) : vet.specialties && vet.specialties.length > 0 ? (
                      vet.specialties.map((spec: string) => (
                        <span key={spec} style={styles.tagReadOnly}>
                          {getSpecialtyName(spec)}
                        </span>
                      ))
                    ) : (
                      <p style={styles.emptyText}>Nenhuma especialidade cadastrada</p>
                    )}
                  </div>
                )}
              </div>

              {/* Certificados */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Certificados</label>
                {isEditing ? (
                  <>
                    <div style={styles.inputWithButton}>
                      <input
                        type="text"
                        value={certificateInput}
                        onChange={(e) => setCertificateInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCertificate())}
                        placeholder="Adicionar certificado"
                        style={styles.input}
                      />
                      <button onClick={addCertificate} style={styles.addButton}>
                        + Adicionar
                      </button>
                    </div>
                    <div style={styles.tagContainer}>
                      {formData.certificates.map((cert) => (
                        <span key={cert} style={styles.tag}>
                          {cert}
                          <button
                            onClick={() => removeCertificate(cert)}
                            style={styles.removeTagButton}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={styles.tagContainer}>
                    {vet.certificates && vet.certificates.length > 0 ? (
                      vet.certificates.map((cert: string) => (
                        <span key={cert} style={styles.tagReadOnly}>
                          {cert}
                        </span>
                      ))
                    ) : (
                      <p style={styles.emptyText}>Nenhum certificado cadastrado</p>
                    )}
                  </div>
                )}
              </div>

              {/* Experiência */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Experiência</label>
                {isEditing ? (
                  <textarea
                    value={formData.experience}
                    onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                    style={styles.textarea}
                    rows={4}
                  />
                ) : (
                  <p style={styles.value}>{vet.experience || ''}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

// Estilos
const styles: { [key: string]: React.CSSProperties } = {
  // Layout de duas colunas
  twoColumnContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '24px',
    padding: '24px',
    minHeight: 'calc(100vh - 120px)',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  leftSidebar: {
    width: '33%',
    minWidth: '300px',
    maxWidth: '400px',
    position: 'sticky',
    top: '24px',
    height: 'fit-content',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    flex: '0 0 auto',
  },
  rightContent: {
    flex: 1,
    minWidth: '400px',
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    padding: '32px',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 120px)',
  },
  vetMainSection: {
    marginBottom: '24px',
    padding: '24px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  vetMainSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  vetMainSectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  sectionEditButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#ffffff',
    color: colors.brand.primary[500],
    border: `1px solid ${colors.brand.primary[500]}`,
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    flexShrink: 0,
  },
  sectionButtonGroup: {
    display: 'flex',
    gap: '12px',
    flexShrink: 0,
  },
  vetInfoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '20px',
  },
  vetInfoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  vetInfoItemFull: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  vetFieldLabel: {
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
  },
  vetFieldValue: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    margin: 0,
    lineHeight: 1.6,
  },
  vetFieldValueMuted: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: 0,
    lineHeight: 1.6,
  },
  certTagReadOnly: {
    padding: '8px 14px',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '6px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '500',
    border: '1px solid #fbbf24',
  },
  profileHeader: {
    textAlign: 'center',
  },
  profileName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  statsTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: '0 0 16px 0',
  },
  quickActionsTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: '0 0 16px 0',
  },
  quickActionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  contentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e5e7eb',
  },
  container: {
    padding: '24px',
    maxWidth: '800px',
    margin: '0 auto',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '32px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '28px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
  },
  editButton: {
    padding: '10px 20px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#ffffff',
    color: '#737373',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
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
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  photoSection: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: '#262626',
  },
  input: {
    padding: '12px',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
  },
  textarea: {
    padding: '12px',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    resize: 'vertical',
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
  inputWithButton: {
    display: 'flex',
    gap: '8px',
  },
  addButton: {
    padding: '12px 20px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '8px',
  },
  tag: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    borderRadius: '6px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '500',
  },
  tagReadOnly: {
    padding: '6px 12px',
    backgroundColor: '#e5e7eb',
    color: '#262626',
    borderRadius: '6px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    fontWeight: '500',
  },
  removeTagButton: {
    background: 'none',
    border: 'none',
    color: '#ffffff',
    fontSize: '18px',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  emptyText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#9ca3af',
    fontStyle: 'italic',
    margin: 0,
  },
  loading: {
    textAlign: 'center',
    padding: '48px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#737373',
  },
  error: {
    textAlign: 'center',
    padding: '48px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#dc2626',
  },
  statsSection: {
    marginBottom: '0',
  },
  sectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  statCard: {
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    border: '1px solid #e5e7eb',
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '700',
    color: '#262626',
    margin: 0,
    marginBottom: '2px',
  },
  statLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '11px',
    color: '#737373',
    margin: 0,
  },
  loadingText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    textAlign: 'center',
    padding: '20px',
  },
  quickActionsSection: {
    marginTop: 'auto',
  },
  quickActionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
  },
  quickActionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#262626',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
    textAlign: 'left',
  },
  quickActionButtonDisabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
  },
  accountInfoSection: {
    marginTop: '32px',
    padding: '24px',
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
  },
  accountInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  accountInfoItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
  },
  accountInfoLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    fontWeight: '500',
  },
  accountInfoValue: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#262626',
    fontWeight: '600',
  },
};

export default VetProfilePage;
