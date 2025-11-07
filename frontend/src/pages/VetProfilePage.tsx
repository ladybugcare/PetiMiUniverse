import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import ProfilePhotoUploader from '../components/ProfilePhotoUploader';
import { vetsApi, Vet } from '../services/vetsApi';
import { useAlert } from '../hooks/useAlert';
import { BarChart2, ClipboardList, FileText, ShoppingCart, User, Edit } from 'lucide-react';
import colors from '../styles/colors';

const VetProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useAlert();
  const [vet, setVet] = useState<Vet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    specialties: [] as string[],
    certificates: [] as string[],
    experience: '',
  });

  const [specialtyInput, setSpecialtyInput] = useState('');
  const [certificateInput, setCertificateInput] = useState('');

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/vet-dashboard',
    },
    {
      id: 'demandas',
      label: 'Demandas',
      // @ts-ignore - Type incompatibility between React 18 and lucide-react
      icon: <ClipboardList size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'candidaturas',
      label: 'Minhas Candidaturas',
      // @ts-ignore - Type incompatibility between React 18 and lucide-react
      icon: <FileText size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/my-applications',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      // @ts-ignore - Type incompatibility between React 18 and lucide-react
      icon: <ShoppingCart size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'perfil',
      label: 'Meu Perfil',
      // @ts-ignore - Type incompatibility between React 18 and lucide-react
      icon: <User size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/vet-profile',
    },
  ];

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user || !user.id) {
        navigate('/login');
        return;
      }

      const { vet: vetData } = await vetsApi.getById(user.id);
      setVet(vetData);
      setFormData({
        name: vetData.name,
        specialties: vetData.specialties || [],
        certificates: vetData.certificates || [],
        experience: vetData.experience || '', // ✅ fallback seguro
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
      const { vet: updatedVet } = await vetsApi.update(vet!.id, formData);
      setVet(updatedVet);
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
      name: vet!.name,
      specialties: vet!.specialties || [],
      certificates: vet!.certificates || [],
      experience: vet!.experience || '', // ✅ fallback seguro
    });
    setIsEditing(false);
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

  if (loading) {
    return (
      <DashboardLayout pageName="Meu Perfil" menuItems={menuItems}>
        <div style={styles.loading}>Carregando...</div>
      </DashboardLayout>
    );
  }

  if (!vet) {
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
                  // @ts-ignore - Type incompatibility between React 18 and lucide-react
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
              currentPhotoUrl={vet.photo_url}
              onPhotoSelect={handlePhotoSelect}
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
                  {vet.specialties && vet.specialties.length > 0 ? (
                    vet.specialties.map((spec: string) => (
                      <span key={spec} style={styles.tagReadOnly}>
                        {spec}
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
    </DashboardLayout>
  );
};

// Estilos
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
  inputWithButton: {
    display: 'flex',
    gap: '8px',
  },
  addButton: {
    padding: '12px 20px',
    backgroundColor: '#7c3aed',
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
    backgroundColor: '#7c3aed',
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
};

export default VetProfilePage;
