import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import ProfilePhotoUploader from '../components/ProfilePhotoUploader';
import { useAlert } from '../hooks/useAlert';
import { Edit, Crown, Users, FileText, ClipboardList, Shield, Settings, MessageCircle } from 'lucide-react';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';

interface AdminUser {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
    photo_url?: string;
  };
}

const AdminProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { showSuccess, showError } = useAlert();
  
  // Get menu items using hook
  const userRole = authUser ? getUserRole(authUser) : 'ADMIN';
  const { menuItems } = useSidebarMenu(userRole);
  
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Layout de duas colunas para admin
  const useTwoColumnLayout = true;

  const [formData, setFormData] = useState({
    name: '',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '');
      if (!userData || !userData.id) {
        navigate('/login');
        return;
      }

      setUser(userData);
      setFormData({
        name: userData.user_metadata?.name || '',
      });
    } catch (error: any) {
      showError('Erro ao carregar perfil: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Update user metadata in localStorage
      const updatedUser: AdminUser = {
        id: user!.id,
        email: user!.email,
        user_metadata: {
          ...user?.user_metadata,
          name: formData.name,
        },
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
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
      name: user?.user_metadata?.name || '',
    });
    setIsEditing(false);
  };

  const handlePhotoSelect = async (file: File) => {
    try {
      setUploadingPhoto(true);
      // For now, we'll use a simple data URL
      // In production, you would upload to Supabase Storage and get the URL
      const reader = new FileReader();
      reader.onloadend = async () => {
        const photo_url = reader.result as string;
        const updatedUser: AdminUser = {
          id: user!.id,
          email: user!.email,
          user_metadata: {
            ...user?.user_metadata,
            photo_url,
          },
        };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
        showSuccess('Foto atualizada com sucesso!');
        setUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      showError('Erro ao atualizar foto: ' + error.message);
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout pageName="Meu Perfil" menuItems={menuItems}>
        <div style={styles.loading}>Carregando...</div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout pageName="Meu Perfil" menuItems={menuItems}>
        <div style={styles.error}>Erro ao carregar perfil</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageName="Meu Perfil" menuItems={menuItems}>
      {useTwoColumnLayout ? (
        // Layout de duas colunas para admin
        <div style={styles.twoColumnContainer}>
          {/* Lado Esquerdo Fixo */}
          <aside style={styles.leftSidebar}>
            {/* Foto de Perfil */}
            <div style={styles.photoSection}>
              <ProfilePhotoUploader
                currentPhotoUrl={user.user_metadata?.photo_url}
                onPhotoSelect={handlePhotoSelect}
                isUploading={uploadingPhoto}
              />
            </div>

            {/* Nome */}
            <div style={styles.profileHeader}>
              <h2 style={styles.profileName}>{user.user_metadata?.name || 'Administrador'}</h2>
              <div style={{ marginTop: '8px' }}>
                <div style={styles.badge}>
                  <Crown size={16} color="#92400e" />
                  <span style={styles.badgeText}>Administrador</span>
                </div>
              </div>
            </div>

            {/* Ações Rápidas */}
            <div style={styles.quickActionsSection}>
              <h3 style={styles.quickActionsTitle}>Ações Rápidas</h3>
              <div style={styles.quickActionsList}>
                <button
                  onClick={() => navigate('/admin/dashboard')}
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
                  <Shield size={18} />
                  <span>Dashboard</span>
                </button>
                <button
                  onClick={() => navigate('/admin/pending-all')}
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
                  <span>Pendências</span>
                </button>
                <button
                  onClick={() => navigate('/admin/users')}
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
                  <Users size={18} />
                  <span>Usuários</span>
                </button>
                <button
                  onClick={() => navigate('/admin/support-tickets')}
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
                  <span>Suporte</span>
                </button>
                <button
                  onClick={() => navigate('/admin/settings')}
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
                  <Settings size={18} />
                  <span>Configurações</span>
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
                <label style={styles.label}>Nome</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={styles.input}
                  />
                ) : (
                  <p style={styles.value}>{user.user_metadata?.name || 'Não definido'}</p>
                )}
              </div>

              {/* Email (read-only) */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Email</label>
                <p style={styles.valueReadOnly}>{user.email}</p>
              </div>

              {/* Role badge */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Permissão</label>
                <div style={styles.badge}>
                  <Crown size={16} color="#92400e" />
                  <span style={styles.badgeText}>Administrador do Sistema</span>
                </div>
              </div>
            </div>
          </main>
        </div>
      ) : (
        // Layout simples de coluna única (fallback)
      <div style={styles.container}>
        <div style={styles.card}>
          {/* Header */}
          <div style={styles.header}>
            <h1 style={styles.title}>Meu Perfil</h1>
            {!isEditing ? (
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
            )}
          </div>

          {/* Photo */}
          <div style={styles.photoSection}>
            <ProfilePhotoUploader
              currentPhotoUrl={user.user_metadata?.photo_url}
              onPhotoSelect={handlePhotoSelect}
              isUploading={uploadingPhoto}
            />
          </div>

          {/* Form */}
          <div style={styles.form}>
            {/* Name */}
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
                <p style={styles.value}>{user.user_metadata?.name || 'Não definido'}</p>
              )}
            </div>

            {/* Email (read-only) */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Email</label>
              <p style={styles.valueReadOnly}>{user.email}</p>
            </div>

            {/* Role badge */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Permissão</label>
              <div style={styles.badge}>
                <Crown size={16} color="#92400e" />
                <span style={styles.badgeText}>Administrador do Sistema</span>
              </div>
            </div>
          </div>
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
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#fef3c7',
    borderRadius: '8px',
    border: '1px solid #fbbf24',
    width: 'fit-content',
  },
  badgeText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    color: '#92400e',
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
};

export default AdminProfilePage;

