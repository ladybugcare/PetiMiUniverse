import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import ProfilePhotoUploader from '../components/ProfilePhotoUploader';
import { useAlert } from '../hooks/useAlert';
import { BarChart2, Building2, Stethoscope, ClipboardList, User, LogOut, MessageCircle, Edit, Crown } from 'lucide-react';
import colors from '../styles/colors';

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
  const { showSuccess, showError } = useAlert();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
  });

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin-dashboard',
    },
    {
      id: 'clinicas',
      label: 'Clínicas',
      icon: <Building2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/clinics',
    },
    {
      id: 'veterinarios',
      label: 'Veterinários',
            icon: <Stethoscope size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/vets',
    },
    {
      id: 'demandas',
      label: 'Demandas',
            icon: <ClipboardList size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/demands',
    },
    {
      id: 'support',
      label: 'Tickets de Suporte',
            icon: <MessageCircle size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/support-tickets',
    },
    {
      id: 'perfil',
      label: 'Meu Perfil',
            icon: <User size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin-profile',
    },
    // {
    //   id: 'logout',
    //   label: 'Sair',
        //   icon: <LogOut size={20} color={colors.primary} />,
    //   action: 'logout',
    // },
  ];

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
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
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

