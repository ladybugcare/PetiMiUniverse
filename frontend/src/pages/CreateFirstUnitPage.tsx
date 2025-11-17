import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAZILIAN_STATES } from '../utils/locationData';
import { clinicsApi } from '../services/clinicsApi';
import { useUnit } from '../contexts/UnitContext';
import WelcomeModal from '../components/WelcomeModal';
import PetiVetDropdown from '../components/PetiVetDropdown';
import { SuccessModal } from '../components/SuccessModal';
import colors from '../styles/colors';
import { Heart, Info, Lightbulb, Building2, CheckCircle } from 'lucide-react';
import IconWrapper from '../components/IconWrapper';
import AddressAutocomplete from '../components/AddressAutocomplete';

type Step = 'welcome' | 'clinic' | 'unit';

const CreateFirstUnitPage: React.FC = () => {
  const navigate = useNavigate();
  const { units, loadUnits } = useUnit();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasClinic, setHasClinic] = useState(false);
  const [checkingClinic, setCheckingClinic] = useState(true);
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const [clinicData, setClinicData] = useState({
    name: '',
    cnpj: '',
    description: '',
  });
  
  const [formData, setFormData] = useState({
    name: '',
    nickname: '',
    cnpj: '',
    address: '',
    city: '',
    state: 'SP',
    phone: '',
    technical_manager: '',
  });

  const userStr = localStorage.getItem('user');
  
  const user = userStr ? JSON.parse(userStr) : null;
  const clinicId = user?.id;

  // Load units and redirect if user already has units
  useEffect(() => {
    const checkUnits = async () => {
      try {
        await loadUnits();
      } catch (error) {
        console.error('Error loading units:', error);
      }
    };
    
    checkUnits();
  }, [loadUnits]);

  // Redirect to /units/create if user already has units
  useEffect(() => {
    if (units.length > 0) {
      navigate('/units/create', { replace: true });
    }
  }, [units, navigate]);

  // Check if clinic already exists and manage initial step
  useEffect(() => {
    const checkClinic = async () => {
      try {
        const hideModal = localStorage.getItem('hideWelcomeModal');
        const isFirstAccess = localStorage.getItem('isFirstAccess');
        
        const { clinic } = await clinicsApi.getById(clinicId);
        
          setHasClinic(true);
          setClinicData({
          name: clinic.name || '',
          cnpj: clinic.cnpj || '',
          description: clinic.description || '',
          });
          
          // Se o usuário já viu o modal antes e não é primeiro acesso, pula direto para o formulário da clínica
          if (hideModal === 'true' && isFirstAccess !== 'true') {
            setShowWelcomeModal(false);
            setCurrentStep('clinic');
          }
      } catch (err: any) {
        // Clínica ainda não existe ou erro ao buscar
        console.log('No clinic found, will create new one');
        const hideModal = localStorage.getItem('hideWelcomeModal');
        const isFirstAccess = localStorage.getItem('isFirstAccess');
          if (hideModal === 'true' && isFirstAccess !== 'true') {
            setShowWelcomeModal(false);
            setCurrentStep('clinic');
          }
      } finally {
        setCheckingClinic(false);
      }
    };
    
    if (clinicId) {
      checkClinic();
    } else {
      setCheckingClinic(false);
    }
  }, [clinicId]);

  const handleClinicChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setClinicData({
      ...clinicData,
      [e.target.name]: e.target.value,
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const city = e.target.value;
    setFormData({
      ...formData,
      city,
    });
  };

  const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nickname = e.target.value;
    
    setFormData(prev => ({
      ...prev,
      nickname,
      // Auto-concatenar: Nome da Clinica + espaco + Apelido
      name: clinicData.name.trim() + (nickname ? ' ' + nickname : '')
    }));
  };

  const handleWelcomeStart = () => {
    setShowWelcomeModal(false);
    // SEMPRE mostra o formulário de dados da clínica após o modal
    setCurrentStep('clinic');
  };

  const handleWelcomeLater = () => {
    if (dontShowAgain) {
      localStorage.setItem('hideWelcomeModal', 'true');
    }
    navigate('/clinic-dashboard');
  };

  const handleSaveClinicAndContinue = async () => {
    setError(null);
    
    // Validate clinic data
    if (!clinicData.name.trim()) {
      setError('Nome da clínica é obrigatório.');
      return;
    }

    if (!clinicData.cnpj || !clinicData.cnpj.trim()) {
      setError('CNPJ é obrigatório.');
      return;
    }

    // Inicializar nome da unidade com nome da clinica
    setFormData(prev => ({
      ...prev,
      name: clinicData.name.trim()
    }));

    setCurrentStep('unit');
  };

  const handleSaveClinicAndLater = async () => {
    // Save partial clinic data if provided
    if (clinicData.name.trim()) {
      try {
        await clinicsApi.registerWithUnit({
            clinic: clinicData,
          unit: null as any,
        });
      } catch (err) {
        console.error('Error saving clinic data:', err);
      }
    }
    
    navigate('/clinic-dashboard');
  };

  const handleSubmitUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validations
    if (!formData.name || !formData.nickname || !formData.cnpj || !formData.address || !formData.city || !formData.state) {
      setError('Preencha todos os campos obrigatórios da unidade.');
      return;
    }
    
    if (formData.nickname.length > 100) {
      setError('O apelido deve ter no máximo 100 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const data = await clinicsApi.registerWithUnit({
        clinic: !hasClinic && clinicData.name ? clinicData : null,
        unit: {
          clinic_id: clinicId,
          ...formData,
        },
      });

      // Clear onboarding flags
      localStorage.removeItem('isFirstAccess');
      localStorage.removeItem('hideWelcomeModal');

      // Show success modal
      setSuccessMessage(data.message || 'Clínica e unidade cadastradas! Aguarde aprovação do administrador.');
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error('Error creating first unit:', err);
      setError(err.message || 'Erro ao cadastrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelUnit = () => {
    navigate('/clinic-dashboard');
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    navigate('/clinic-dashboard');
  };

  // Loading state
  if (checkingClinic) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p>Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Welcome Modal
  if (currentStep === 'welcome') {
    return (
      <WelcomeModal
        isOpen={showWelcomeModal}
        onStart={handleWelcomeStart}
        onLater={handleWelcomeLater}
        onDontShowAgainChange={setDontShowAgain}
      />
    );
  }

  // Step 2: Clinic Data
  if (currentStep === 'clinic') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <span>Boas-vindas à PetiVet!
                   Vamos cadastrar sua Clínica</span>
              
              </div>
            </h1>
            <p style={styles.subtitle}>
              Conte pra gente o nome da sua clínica e crie a primeira unidade. 
              Depois da aprovação, você poderá cadastrar novas unidades e sua equipe.
            </p>
          </div>

          {error && (
            <div style={styles.errorBanner}>
              <span style={styles.errorIcon}>⚠️</span>
              {error}
            </div>
          )}

          <form style={styles.form}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>📋 Dados da Clínica</h2>
              <p style={styles.sectionSubtitle}>Preencha as informações básicas da sua clínica</p>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                Nome da Clínica <span style={styles.required}>*</span>
              </label>
              <input
                type="text"
                name="name"
                value={clinicData.name}
                onChange={handleClinicChange}
                placeholder="Ex: Clínica VetCare"
                style={styles.input}
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                CNPJ <span style={styles.required}>*</span>
              </label>
              <input
                type="text"
                name="cnpj"
                value={clinicData.cnpj}
                onChange={handleClinicChange}
                placeholder="00.000.000/0000-00"
                style={styles.input}
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Descrição</label>
              <textarea
                name="description"
                value={clinicData.description}
                onChange={handleClinicChange}
                placeholder="Breve descrição da clínica..."
                style={styles.textarea}
                rows={3}
              />
            </div>

            <div style={styles.buttonGroup}>
              <button
                type="button"
                onClick={handleSaveClinicAndLater}
                style={styles.laterButton}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.neutral[50];
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = colors.surface;
                }}
              >
                Depois
              </button>
              <button
                type="button"
                onClick={handleSaveClinicAndContinue}
                style={styles.submitButton}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.primaryDark;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = colors.primary;
                }}
              >
                Criar Primeira Unidade
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Step 3: Unit Data
  return (
    <>
      {/* Success Modal */}
      {showSuccessModal && (
        <SuccessModal
          isOpen={showSuccessModal}
          message={successMessage}
          onClose={handleSuccessModalClose}
        />
      )}
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Building2 size={32} color={colors.primary} />
              <span>Primeira Unidade</span>
            </div>
          </h1>
          <p style={styles.subtitle}>
            Cadastre a primeira unidade da sua clínica
          </p>
        </div>

        {error && (
          <div style={styles.errorBanner}>
            <span style={styles.errorIcon}>⚠️</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmitUnit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Nome da Unidade <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              readOnly
              placeholder="Ex: Clínica VetCare Cotia"
              style={{...styles.input, backgroundColor: '#f9fafb', cursor: 'not-allowed'}}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              Apelido da Unidade <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              name="nickname"
              value={formData.nickname}
              onChange={handleNicknameChange}
              placeholder="Ex: Cotia, Granja Viana"
              style={styles.input}
              required
              maxLength={100}
            />
            <div style={styles.tooltip}>
              <span style={styles.tooltipIcon}>
                <IconWrapper icon={Lightbulb} size={18} color={colors.primary} />
              </span>
              <span style={styles.tooltipText}>
                Use o nome do bairro ou ponto de referência para diferenciar unidades (ex: Cotia – Granja Viana)
              </span>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              CNPJ <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              name="cnpj"
              value={formData.cnpj}
              onChange={handleChange}
              placeholder="00.000.000/0000-00"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              Endereço <span style={styles.required}>*</span>
            </label>
            <AddressAutocomplete
              value={formData.address}
              onChange={(address) => setFormData({ ...formData, address })}
              placeholder="Ex: Rua das Flores, 123 - Centro - São Paulo/SP"
              className="input"
            />
          </div>

          <div style={styles.formRow}>
            <div style={{ ...styles.formGroup, flex: 2 }}>
              <label style={styles.label}>
                Cidade <span style={styles.required}>*</span>
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleCityChange}
                placeholder="Ex: São Paulo"
                style={styles.input}
                required
              />
            </div>

            <div style={{ ...styles.formGroup, flex: 1 }}>
              <label style={styles.label}>
                Estado <span style={styles.required}>*</span>
              </label>
              <PetiVetDropdown
                options={BRAZILIAN_STATES}
                value={formData.state}
                onChange={(value) => setFormData({ ...formData, state: value })}
                placeholder="Selecione o estado"
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Telefone</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="(00) 00000-0000"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Responsável Técnico</label>
            <input
              type="text"
              name="technical_manager"
              value={formData.technical_manager}
              onChange={handleChange}
              placeholder="Nome do médico veterinário responsável"
              style={styles.input}
            />
          </div>

          <div style={styles.infoBox}>
            <span style={styles.infoIcon}>
              <IconWrapper icon={Info} size={20} color={colors.primary} />
            </span>
            <div>
              <strong>E depois?</strong>
              <ul style={styles.infoList}>
                <li>Nossa equipe vai revisar as informações da sua unidade.
                </li>
                <li>Assim que for aprovada, te avisamos por aqui!
                </li>
                <li>Depois disso, você já poderá criar demandas, anúncios e adicionar sua equipe.</li>
              </ul>
            </div>
          </div>

          <div style={styles.buttonGroup}>
            <button
              type="button"
              onClick={handleCancelUnit}
              style={styles.cancelButton}
              disabled={loading}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.neutral[50];
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colors.surface;
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={styles.submitButton}
              disabled={loading}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.primaryDark;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colors.primary;
              }}
            >
              {loading ? 'Enviando...' : 'Enviar para Aprovação'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: colors.background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    maxWidth: '700px',
    width: '100%',
    padding: '40px',
  },
  header: {
    marginBottom: '32px',
    textAlign: 'center',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: colors.text,
    marginBottom: '12px',
  },
  subtitle: {
    fontSize: '14px',
    color: colors.textSecondary,
    lineHeight: '1.6',
  },
  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderLeft: `4px solid ${colors.danger}`,
    padding: '16px',
    marginBottom: '24px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '14px',
    color: '#991b1b',
  },
  errorIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  sectionHeader: {
    marginBottom: '16px',
    marginTop: '8px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '4px',
  },
  sectionSubtitle: {
    fontSize: '13px',
    color: colors.textSecondary,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: colors.neutral[700],
  },
  required: {
    color: colors.danger,
  },
  input: {
    padding: '12px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  select: {
    padding: '12px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: colors.surface,
    cursor: 'pointer',
  },
  textarea: {
    padding: '12px',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  tooltip: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginTop: '6px',
    padding: '8px',
    backgroundColor: colors.primaryBg,
    borderLeft: `3px solid ${colors.primary}`,
    borderRadius: '4px',
    fontSize: '12px',
    color: colors.primaryDark,
  },
  tooltipIcon: {
    fontSize: '14px',
    flexShrink: 0,
    marginTop: '1px',
  },
  tooltipText: {
    lineHeight: '1.5',
  },
  autoSuggestion: {
    fontSize: '12px',
    color: colors.primary,
    fontStyle: 'italic',
    marginTop: '4px',
    display: 'block',
  },
  infoBox: {
    backgroundColor: colors.primaryBg,
    borderLeft: `3px solid ${colors.primary}`,
    padding: '16px',
    borderRadius: '8px',
    display: 'flex',
    gap: '12px',
    fontSize: '13px',
    color: colors.primaryDark,
    marginTop: '8px',
  },
  infoIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  infoList: {
    margin: '8px 0 0 0',
    paddingLeft: '20px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  laterButton: {
    padding: '12px 24px',
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  cancelButton: {
    padding: '12px 24px',
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  submitButton: {
    padding: '12px 24px',
    backgroundColor: colors.primary,
    color: colors.surface,
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};

export default CreateFirstUnitPage;
