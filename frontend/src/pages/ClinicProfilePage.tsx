import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import ProfilePhotoUploader from '../components/ProfilePhotoUploader';
import { clinicsApi, Clinic } from '../services/clinicsApi';
import { useAlert } from '../hooks/useAlert';
import { BarChart2, ClipboardList, ShoppingCart, User, LogOut, Edit } from 'lucide-react';
import colors from '../styles/colors';
import { supabase } from '../services/supabase';

const ClinicProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError, showConfirm } = useAlert();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    cnpj: '',
  });

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/clinic-dashboard',
    },
    {
      id: 'demandas',
      label: 'Demandas',
<<<<<<< HEAD
      icon: <ClipboardList size={20} color={colors.primary} />,
=======
            icon: <ClipboardList size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
<<<<<<< HEAD
      icon: <ShoppingCart size={20} color={colors.primary} />,
=======
            icon: <ShoppingCart size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'perfil',
      label: 'Meu Perfil',
<<<<<<< HEAD
      icon: <User size={20} color={colors.primary} />,
=======
            icon: <User size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      action: 'navigate',
      path: '/clinic-profile',
    },
    // {
    //   id: 'logout',
    //   label: 'Sair',
<<<<<<< HEAD
    //   icon: <LogOut size={20} color={colors.primary} />,
=======
        //   icon: <LogOut size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
    //   action: 'logout',
    // },
  ];

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '');
      if (!user || !user.id) {
        navigate('/login');
        return;
      }

      const { clinic: clinicData } = await clinicsApi.getById(user.id);
      setClinic(clinicData);
      setFormData({
        name: clinicData.name,
        address: clinicData.address,
        cnpj: clinicData.cnpj,
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
      <DashboardLayout pageName="Meu Perfil" menuItems={menuItems}>
        <div style={styles.loading}>Carregando...</div>
      </DashboardLayout>
    );
  }

  if (!clinic) {
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
<<<<<<< HEAD
                <Edit size={16} />
=======
                                <Edit size={16} />
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
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
              currentPhotoUrl={clinic.photo_url}
              onPhotoSelect={handlePhotoSelect}
              isUploading={uploadingPhoto}
            />
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
                ...(deactivating ? styles.dangerButtonDisabled : ),
              }}
              disabled={deactivating}
            >
              {deactivating ? 'Inativando...' : 'Inativar clínica'}
            </button>
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
};

export default ClinicProfilePage;
