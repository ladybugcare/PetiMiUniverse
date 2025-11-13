import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import ProfilePhotoUploader from '../components/ProfilePhotoUploader';
import { clinicsApi, Clinic } from '../services/clinicsApi';
import { useAlert } from '../hooks/useAlert';
import { Edit, ArrowLeft, Building2, MessageCircle, FileText, Clock, CheckCircle, ClipboardList, Users, ShoppingCart, Settings } from 'lucide-react';
import colors from '../styles/colors';
import { supabase } from '../services/supabase';
import { useAuth } from '../AuthContext';
import { messagesApi } from '../services/messagesApi';
import { getUserRole } from '../utils/authHelpers';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { statisticsApi, ClinicStats } from '../services/statisticsApi';

const ClinicProfilePage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError, showConfirm } = useAlert();
  const { user } = useAuth();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [stats, setStats] = useState<ClinicStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  
  // Se há um ID na URL, é visualização pública (não edição)
  const isPublicView = !!id;
  const isOwnProfile = !isPublicView || (user?.id === id);

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'CADMIN';
  const { menuItems } = useSidebarMenu(userRole);

  // Layout de duas colunas apenas para próprio perfil
  const useTwoColumnLayout = isOwnProfile && !isPublicView;

  const loadStats = useCallback(async (clinicId: string) => {
    try {
      setLoadingStats(true);
      const { stats: clinicStats } = await statisticsApi.getClinicStats(clinicId);
      setStats(clinicStats);
    } catch (error: any) {
      console.error('Erro ao carregar estatísticas:', error);
      // Não mostrar erro ao usuário, apenas logar
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    cnpj: '',
  });

  useEffect(() => {
    loadProfile();
  }, [id]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      
      // Se há um ID na URL, carrega aquele perfil (visualização pública)
      // Caso contrário, carrega o perfil do usuário logado
      const clinicId = id || user?.id;
      
      if (!clinicId) {
        if (!isPublicView) {
        navigate('/login');
        return;
        } else {
          showError('Clínica não encontrada');
          navigate('/demands');
          return;
        }
      }

      const { clinic: clinicData } = await clinicsApi.getById(clinicId);
      setClinic(clinicData);
      setFormData({
        name: clinicData.name,
        address: clinicData.address,
        cnpj: clinicData.cnpj,
      });

      // Carregar estatísticas apenas se for o próprio perfil
      if (isOwnProfile && !isPublicView) {
        loadStats(clinicId);
      }
    } catch (error: any) {
      showError('Erro ao carregar perfil: ' + error.message);
      if (isPublicView) {
        navigate('/demands');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { clinic: updatedClinic } = await clinicsApi.update(clinic!.id, formData);
      setClinic(updatedClinic);
      setIsEditing(false);
      showSuccess('Perfil atualizado com sucesso!');
    } catch (error: any) {
      showError('Erro ao atualizar perfil: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: clinic!.name,
      address: clinic!.address,
      cnpj: clinic!.cnpj,
    });
    setIsEditing(false);
  };

  const handleSendMessage = async () => {
    if (!user?.id || !clinic?.id) {
      showError('Erro ao identificar usuário ou clínica');
      return;
    }

    const userRole = getUserRole(user);
    if (userRole !== 'VET') {
      showError('Apenas veterinários podem enviar mensagens para clínicas');
      return;
    }

    try {
      const result = await messagesApi.createConversation({
        participant1_id: user.id,
        participant1_type: 'vet',
        participant2_id: clinic.id,
        participant2_type: 'clinic',
      });

      navigate(`/messages?conversation=${result.conversation.id}`);
    } catch (error: any) {
      showError('Erro ao criar conversa: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const handlePhotoSelect = async (file: File) => {
    try {
      setUploadingPhoto(true);
      // For now, we'll use a simple data URL
      // In production, you would upload to Supabase Storage and get the URL
      const reader = new FileReader();
      reader.onloadend = async () => {
        const photo_url = reader.result as string;
        const { clinic: updatedClinic } = await clinicsApi.uploadPhoto(clinic!.id, photo_url);
        setClinic(updatedClinic);
        showSuccess('Foto atualizada com sucesso!');
        setUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      showError('Erro ao atualizar foto: ' + error.message);
      setUploadingPhoto(false);
    }
  };

  const handleDeactivateAccount = () => {
    if (!clinic) return;

    showConfirm(
      'Tem certeza que deseja inativar a conta da clínica? O acesso será bloqueado imediatamente.',
      async () => {
        try {
          setDeactivating(true);
          await clinicsApi.deactivate(clinic.id);
          showSuccess('Conta da clínica inativada com sucesso!');
          localStorage.removeItem('user');
          localStorage.removeItem('session');
          try {
            await supabase.auth.signOut();
          } catch (signOutError) {
            console.warn('Erro ao encerrar sessão local após inativação:', signOutError);
          }
          navigate('/login');
        } catch (error: any) {
          showError('Erro ao inativar clínica: ' + error.message);
          setDeactivating(false);
        }
      },
      'Confirmar Inativação'
    );
  };

  if (loading) {
    return (
      <DashboardLayout pageName={isPublicView ? "Perfil da Clínica" : "Meu Perfil"} menuItems={isPublicView ? [] : menuItems}>
        <div style={styles.loading}>Carregando...</div>
      </DashboardLayout>
    );
  }

  if (!clinic) {
    return (
      <DashboardLayout pageName={isPublicView ? "Perfil da Clínica" : "Meu Perfil"} menuItems={isPublicView ? [] : menuItems}>
        <div style={styles.error}>Erro ao carregar perfil</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageName={isPublicView ? "Perfil da Clínica" : "Meu Perfil"} menuItems={isPublicView ? [] : menuItems}>
      {useTwoColumnLayout ? (
        // Layout de duas colunas para próprio perfil
        <div style={styles.twoColumnContainer}>
          {/* Lado Esquerdo Fixo */}
          <aside style={styles.leftSidebar}>
            {/* Foto de Perfil */}
            <div style={styles.photoSection}>
              <ProfilePhotoUploader
                currentPhotoUrl={clinic.photo_url}
                onPhotoSelect={handlePhotoSelect}
                isUploading={uploadingPhoto}
              />
            </div>

            {/* Nome */}
            <div style={styles.profileHeader}>
              <h2 style={styles.profileName}>{clinic.name}</h2>
            </div>

            {/* Estatísticas */}
            <div style={styles.statsSection}>
              <h3 style={styles.statsTitle}>Estatísticas</h3>
              {loadingStats ? (
                <p style={styles.loadingText}>Carregando...</p>
              ) : stats ? (
                <div style={styles.statsGrid}>
                  <div style={styles.statCard}>
                    <FileText size={20} color="#7c3aed" />
                    <div style={styles.statContent}>
                      <h4 style={styles.statValue}>{stats.totalDemands}</h4>
                      <p style={styles.statLabel}>Total Demandas</p>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <Clock size={20} color="#0ea5e9" />
                    <div style={styles.statContent}>
                      <h4 style={styles.statValue}>{stats.openDemands}</h4>
                      <p style={styles.statLabel}>Abertas</p>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <ClipboardList size={20} color="#f59e0b" />
                    <div style={styles.statContent}>
                      <h4 style={styles.statValue}>{stats.totalApplications}</h4>
                      <p style={styles.statLabel}>Candidaturas</p>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <CheckCircle size={20} color="#22c55e" />
                    <div style={styles.statContent}>
                      <h4 style={styles.statValue}>{stats.pendingApplications}</h4>
                      <p style={styles.statLabel}>Pendentes</p>
                    </div>
                  </div>
                  <div style={styles.statCard}>
                    <Users size={20} color="#8b5cf6" />
                    <div style={styles.statContent}>
                      <h4 style={styles.statValue}>{stats.totalUsers}</h4>
                      <p style={styles.statLabel}>Usuários</p>
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
                  onClick={() => navigate('/clinic-demands')}
                  style={styles.quickActionButton}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = '#7c3aed';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <FileText size={18} />
                  <span>Minhas Demandas</span>
                </button>
                <button
                  onClick={() => navigate('/clinic-applications')}
                  style={styles.quickActionButton}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = '#7c3aed';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <ClipboardList size={18} />
                  <span>Candidaturas</span>
                </button>
                <button
                  onClick={() => navigate('/messages')}
                  style={styles.quickActionButton}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = '#7c3aed';
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
                  onClick={() => navigate('/clinic-reports')}
                  style={styles.quickActionButton}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = '#7c3aed';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <FileText size={18} />
                  <span>Relatórios</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Lado Direito Scrollável */}
          <main style={styles.rightContent}>
            {/* Header com botão editar */}
            <div style={styles.contentHeader}>
              <h1 style={styles.title}>Meu Perfil</h1>
              {!isEditing ? (
                <button onClick={() => setIsEditing(true)} style={styles.editButton}>
                  <Edit size={16} />
                  <span>Editar Perfil</span>
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
            </div>

            {/* Form */}
            <div style={styles.form}>
              {/* Name */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Nome da Clínica</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={styles.input}
                  />
                ) : (
                  <p style={styles.value}>{clinic.name}</p>
                )}
              </div>

              {/* Email (read-only) */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Email</label>
                <p style={styles.valueReadOnly}>{clinic.email}</p>
              </div>

              {/* CNPJ */}
              <div style={styles.formGroup}>
                <label style={styles.label}>CNPJ</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.cnpj}
                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                    style={styles.input}
                  />
                ) : (
                  <p style={styles.value}>{clinic.cnpj}</p>
                )}
              </div>

              {/* Address */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Endereço</label>
                {isEditing ? (
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    style={styles.textarea}
                    rows={3}
                  />
                ) : (
                  <p style={styles.value}>{clinic.address}</p>
                )}
              </div>
            </div>

            {/* Danger Section */}
            <div style={styles.dangerSection}>
              <h2 style={styles.dangerTitle}>Inativar conta da clínica</h2>
              <p style={styles.dangerDescription}>
                Inativar a conta encerra imediatamente o acesso de todos os usuários da clínica. Um
                administrador do sistema deve reativar a conta para restabelecer o acesso.
              </p>
              <button
                onClick={handleDeactivateAccount}
                style={{
                  ...styles.dangerButton,
                  ...(deactivating ? styles.dangerButtonDisabled : {}),
                }}
                disabled={deactivating}
              >
                {deactivating ? 'Inativando...' : 'Inativar clínica'}
              </button>
            </div>
          </main>
        </div>
      ) : (
        // Layout simples de coluna única para visualização pública
      <div style={styles.container}>
        {isPublicView && (
          <button onClick={() => navigate('/demands')} style={styles.backButton}>
            <ArrowLeft size={20} />
            Voltar
          </button>
        )}
        <div style={styles.card}>
          {/* Header */}
          <div style={styles.header}>
            <h1 style={styles.title}>{isPublicView ? clinic.name : 'Meu Perfil'}</h1>
            {!isPublicView && !isEditing && (
              <button onClick={() => setIsEditing(true)} style={styles.editButton}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit size={16} />
                <span>Editar Perfil</span>
              </div>
              </button>
            )}
            {!isPublicView && isEditing && (
              <div style={styles.buttonGroup}>
                <button onClick={handleCancel} style={styles.cancelButton} disabled={saving}>
                  Cancelar
                </button>
                <button onClick={handleSave} style={styles.saveButton} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            )}
          </div>

          {/* Photo */}
          <div style={styles.photoSection}>
            {isPublicView ? (
              <div style={styles.photoDisplay}>
                {clinic.photo_url ? (
                  <img src={clinic.photo_url} alt={clinic.name} style={styles.photoImage} />
                ) : (
                  <div style={styles.photoPlaceholder}>
                    <Building2 size={48} color="#9ca3af" />
                  </div>
                )}
              </div>
            ) : (
            <ProfilePhotoUploader
              currentPhotoUrl={clinic.photo_url}
              onPhotoSelect={handlePhotoSelect}
              isUploading={uploadingPhoto}
            />
            )}
          </div>

          {/* Form */}
          <div style={styles.form}>
            {/* Name */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Nome da Clínica</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={styles.input}
                />
              ) : (
                <p style={styles.value}>{clinic.name}</p>
              )}
            </div>

            {/* Email (read-only) */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Email</label>
              <p style={styles.valueReadOnly}>{clinic.email}</p>
            </div>

            {/* CNPJ */}
            <div style={styles.formGroup}>
              <label style={styles.label}>CNPJ</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.cnpj}
                  onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  style={styles.input}
                />
              ) : (
                <p style={styles.value}>{clinic.cnpj}</p>
              )}
            </div>

            {/* Address */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Endereço</label>
              {isEditing ? (
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={styles.textarea}
                  rows={3}
                />
              ) : (
                <p style={styles.value}>{clinic.address}</p>
              )}
            </div>
          </div>
          
          {/* Botão de mensagem para veterinários (apenas em visualização pública) */}
          {isPublicView && !isOwnProfile && user && getUserRole(user) === 'VET' && (
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={handleSendMessage}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  backgroundColor: colors.primary,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <MessageCircle size={18} />
                Enviar mensagem
              </button>
            </div>
          )}
          
          {/* Danger Section - Apenas para o próprio perfil */}
          {!isPublicView && (
          <div style={styles.dangerSection}>
            <h2 style={styles.dangerTitle}>Inativar conta da clínica</h2>
            <p style={styles.dangerDescription}>
              Inativar a conta encerra imediatamente o acesso de todos os usuários da clínica. Um
              administrador do sistema deve reativar a conta para restabelecer o acesso.
            </p>
            <button
              onClick={handleDeactivateAccount}
              style={{
                ...styles.dangerButton,
                ...(deactivating ? styles.dangerButtonDisabled : {}),
              }}
              disabled={deactivating}
            >
              {deactivating ? 'Inativando...' : 'Inativar clínica'}
            </button>
          </div>
          )}
        </div>
      </div>
      )}
    </DashboardLayout>
  );
};

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
  statsSection: {
    marginBottom: '0',
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
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
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
    backgroundColor: '#7c3aed',
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
  dangerSection: {
    marginTop: '40px',
    padding: '24px',
    border: '1px solid #fee2e2',
    backgroundColor: '#fef2f2',
    borderRadius: '12px',
  },
  dangerTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: 600,
    color: '#b91c1c',
    margin: '0 0 8px 0',
  },
  dangerDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#7f1d1d',
    margin: '0 0 16px 0',
  },
  dangerButton: {
    padding: '12px 20px',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  dangerButtonDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
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
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: '#f3f4f6',
    color: '#262626',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginBottom: '24px',
  },
  photoDisplay: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoImage: {
    width: '150px',
    height: '150px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '4px solid #e5e5e5',
  },
  photoPlaceholder: {
    width: '150px',
    height: '150px',
    borderRadius: '50%',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '4px solid #e5e5e5',
  },
};

export default ClinicProfilePage;
