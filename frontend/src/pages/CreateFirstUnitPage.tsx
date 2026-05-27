import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAZILIAN_STATES } from '../utils/locationData';
import { clinicsApi } from '../services/clinicsApi';
import { useUnit } from '../contexts/UnitContext';
import WelcomeModal from '../components/WelcomeModal';
import PetMiVetDropdown from '../components/PetMiVetDropdown';
import { SuccessModal } from '../components/SuccessModal';
import LogoutConfirmModal from '../components/LogoutConfirmModal';
import colors from '../styles/colors';
import {
  Heart,
  Info,
  Lightbulb,
  Building2,
  CheckCircle,
  AlertTriangle,
  ClipboardList,
  LogOut,
} from 'lucide-react';
import IconWrapper from '../components/IconWrapper';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { getStoredClinicId } from '../utils/authHelpers';
import { CLINIC_STORAGE_UPDATED_EVENT } from '../constants/appEvents';
import { useAuth } from '../AuthContext';

type Step = 'welcome' | 'clinic' | 'unit';

const CLINIC_FIRST_UNIT_TOTAL_STEPS = 3;
const CREATE_FIRST_UNIT_PROGRESS_KEY = 'createFirstUnitProgress';

const CreateFirstUnitPage: React.FC = () => {
  const navigate = useNavigate();
  const { logout, isLoggingOut } = useAuth();
  const { units, loadUnits, loading: unitsLoading } = useUnit();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasClinic, setHasClinic] = useState(false);
  const [checkingClinic, setCheckingClinic] = useState(true);
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showLogoutModal, setShowLogoutModal] = useState(false);

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

  const getClinicOnboardingStepNumber = (): number => {
    if (currentStep === 'welcome') return 1;
    if (currentStep === 'clinic') return 2;
    return 3;
  };

  const saveClinicFirstUnitProgress = useCallback(() => {
    try {
      localStorage.setItem(
        CREATE_FIRST_UNIT_PROGRESS_KEY,
        JSON.stringify({
          currentStep,
          showWelcomeModal,
          clinicData,
          formData,
          dontShowAgain,
          savedAt: new Date().toISOString(),
        })
      );
    } catch {
      /* ignore */
    }
  }, [currentStep, showWelcomeModal, clinicData, formData, dontShowAgain]);

  const clearClinicFirstUnitProgress = useCallback(() => {
    localStorage.removeItem(CREATE_FIRST_UNIT_PROGRESS_KEY);
  }, []);

  const handleLogoutClick = useCallback(() => {
    if (showSuccessModal) {
      void logout();
      return;
    }
    setShowLogoutModal(true);
  }, [showSuccessModal, logout]);

  const handleSaveAndExitClinic = useCallback(async () => {
    saveClinicFirstUnitProgress();
    setShowLogoutModal(false);
    await logout();
  }, [saveClinicFirstUnitProgress, logout]);

  const handleExitWithoutSavingClinic = useCallback(async () => {
    clearClinicFirstUnitProgress();
    setShowLogoutModal(false);
    await logout();
  }, [clearClinicFirstUnitProgress, logout]);

  const renderTopHeader = () => (
    <div style={styles.topHeader}>
      <div style={styles.headerContent}>
        <div style={styles.logoSection}>
          <img src="/logo_texto_lado.png" alt="PetMi Vet" style={styles.logoImage} />
        </div>
        <button
          type="button"
          onClick={handleLogoutClick}
          disabled={isLoggingOut || loading}
          style={{
            ...styles.logoutButton,
            ...(isLoggingOut || loading ? styles.buttonDisabled : {}),
          }}
          title="Sair"
        >
          <LogOut size={18} aria-hidden />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );

  /** ID real da clínica (localStorage); nunca o UUID do Auth. */
  const clinicId = getStoredClinicId();

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

  // Já existe unidade cadastrada (qualquer status) — não exibir fluxo de primeira unidade
  useEffect(() => {
    if (unitsLoading) return;
    if (units.length > 0) {
      navigate('/clinic-dashboard', { replace: true });
    }
  }, [units, unitsLoading, navigate]);

  // Se o login/onboarding já indicou unidades mas a API falhou (ex.: 403 antigo), não ficar preso em "Carregando..."
  useEffect(() => {
    if (unitsLoading) return;
    if (units.length > 0) return;
    try {
      const raw = localStorage.getItem('clinicOnboarding');
      if (!raw) return;
      const o = JSON.parse(raw) as { hasUnits?: boolean };
      if (o?.hasUnits === true) {
        navigate('/clinic-dashboard', { replace: true });
      }
    } catch {
      /* ignore */
    }
  }, [unitsLoading, units.length, navigate]);

  // Check if clinic already exists and manage initial step
  useEffect(() => {
    if (!clinicId) {
      setCheckingClinic(false);
      return;
    }
    const resolvedClinicId: string = clinicId;

    const checkClinic = async () => {
      try {
        const hideModal = localStorage.getItem('hideWelcomeModal');
        const isFirstAccess = localStorage.getItem('isFirstAccess');
        
        const { clinic } = await clinicsApi.getById(resolvedClinicId);
        
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

    checkClinic();
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
    const sid = getStoredClinicId();
    let onboard: { hasUnits?: boolean; clinicId?: string } | null = null;
    try {
      const raw = localStorage.getItem('clinicOnboarding');
      onboard = raw ? JSON.parse(raw) : null;
    } catch {
      onboard = null;
    }
    const hasClinicContext =
      Boolean(sid) ||
      Boolean(onboard?.clinicId) ||
      onboard?.hasUnits === true;
    if (hasClinicContext) {
      navigate('/clinic-dashboard');
      return;
    }
    setShowWelcomeModal(false);
    setCurrentStep('clinic');
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
          ...formData,
          ...(clinicId ? { clinic_id: clinicId } : {}),
        },
      });

      const clinicIdResolved = data.clinic?.id ?? data.unit?.clinic_id;
      if (clinicIdResolved) {
        try {
          const rawCu = localStorage.getItem('clinic_user');
          if (rawCu) {
            const cu = JSON.parse(rawCu);
            localStorage.setItem(
              'clinic_user',
              JSON.stringify({
                ...cu,
                clinic_id: clinicIdResolved,
                unit_id: data.unit?.id ?? cu.unit_id,
                status: 'active',
              })
            );
          }
          localStorage.setItem(
            'clinicOnboarding',
            JSON.stringify({
              clinicId: clinicIdResolved,
              clinicStatus: data.clinic?.status ?? 'pending_approval',
              hasUnits: true,
              needsOnboarding: false,
              shouldCompleteFirstUnit: false,
              isFirstLogin: false,
            })
          );
        } catch (persistErr) {
          console.warn('[CreateFirstUnitPage] Falha ao atualizar sessão local pós-cadastro:', persistErr);
        }
        window.dispatchEvent(new Event(CLINIC_STORAGE_UPDATED_EVENT));
      }

      // Clear onboarding flags
      localStorage.removeItem('isFirstAccess');
      localStorage.removeItem('hideWelcomeModal');

      try {
        await loadUnits();
      } catch (loadErr) {
        console.warn('[CreateFirstUnitPage] loadUnits após cadastro:', loadErr);
      }

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

  if (unitsLoading || units.length > 0) {
    return (
      <>
        {renderTopHeader()}
        <div style={styles.containerWithHeader}>
          <div style={styles.card}>
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p>{unitsLoading ? 'Carregando...' : 'Redirecionando...'}</p>
            </div>
          </div>
        </div>
        <LogoutConfirmModal
          isOpen={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          onSaveAndExit={handleSaveAndExitClinic}
          onExitWithoutSaving={handleExitWithoutSavingClinic}
          currentStep={getClinicOnboardingStepNumber()}
          totalSteps={CLINIC_FIRST_UNIT_TOTAL_STEPS}
        />
      </>
    );
  }

  // Loading state
  if (checkingClinic) {
    return (
      <>
        {renderTopHeader()}
        <div style={styles.containerWithHeader}>
          <div style={styles.card}>
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p>Carregando...</p>
            </div>
          </div>
        </div>
        <LogoutConfirmModal
          isOpen={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          onSaveAndExit={handleSaveAndExitClinic}
          onExitWithoutSaving={handleExitWithoutSavingClinic}
          currentStep={getClinicOnboardingStepNumber()}
          totalSteps={CLINIC_FIRST_UNIT_TOTAL_STEPS}
        />
      </>
    );
  }

  // Step 1: Welcome Modal
  if (currentStep === 'welcome') {
    return (
      <>
        {renderTopHeader()}
        <WelcomeModal
          isOpen={showWelcomeModal}
          onStart={handleWelcomeStart}
          onLater={handleWelcomeLater}
          onDontShowAgainChange={setDontShowAgain}
          backdropTopPaddingPx={100}
        />
        <LogoutConfirmModal
          isOpen={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          onSaveAndExit={handleSaveAndExitClinic}
          onExitWithoutSaving={handleExitWithoutSavingClinic}
          currentStep={getClinicOnboardingStepNumber()}
          totalSteps={CLINIC_FIRST_UNIT_TOTAL_STEPS}
        />
      </>
    );
  }

  // Step 2: Clinic Data
  if (currentStep === 'clinic') {
    return (
      <>
        {renderTopHeader()}
        <div style={styles.containerWithHeader}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <span>Boas-vindas à PetMi Vet!
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
              <AlertTriangle size={20} color="#b45309" aria-hidden style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form style={styles.form}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>
                <ClipboardList size={22} color={colors.brand.primary[600]} aria-hidden />
                <span>Dados da Clínica</span>
              </h2>
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
                  e.currentTarget.style.backgroundColor = colors.brand.primary[600];
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = colors.brand.primary[500];
                }}
              >
                Criar Primeira Unidade
              </button>
            </div>
          </form>
        </div>
      </div>
        <LogoutConfirmModal
          isOpen={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          onSaveAndExit={handleSaveAndExitClinic}
          onExitWithoutSaving={handleExitWithoutSavingClinic}
          currentStep={getClinicOnboardingStepNumber()}
          totalSteps={CLINIC_FIRST_UNIT_TOTAL_STEPS}
        />
      </>
    );
  }

  // Step 3: Unit Data
  return (
    <>
      {renderTopHeader()}
      {/* Success Modal */}
      {showSuccessModal && (
        <SuccessModal
          isOpen={showSuccessModal}
          message={successMessage}
          onClose={handleSuccessModalClose}
        />
      )}
    <div style={styles.containerWithHeader}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Building2 size={32} color={colors.brand.primary[500]} />
              <span>Primeira Unidade</span>
            </div>
          </h1>
          <p style={styles.subtitle}>
            Cadastre a primeira unidade da sua clínica
          </p>
        </div>

        {error && (
          <div style={styles.errorBanner}>
            <AlertTriangle size={20} color="#b45309" aria-hidden style={{ flexShrink: 0 }} />
            <span>{error}</span>
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
            <div style={styles.hintCallout}>
              <div style={styles.hintIconBadge} aria-hidden>
                <IconWrapper icon={Lightbulb} size={18} color={colors.accent.sage[500]} />
              </div>
              <p style={styles.hintText}>
                <span style={styles.hintLabel}>Dica</span>
                Use o nome do bairro ou um ponto de referência para diferenciar unidades (ex.: Cotia – Granja
                Viana).
              </p>
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
              <PetMiVetDropdown
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
            <div style={styles.infoIconBadge} aria-hidden>
              <IconWrapper icon={Info} size={20} color={colors.info[500]} />
            </div>
            <div>
              <p style={styles.infoTitle}>E depois?</p>
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
                e.currentTarget.style.backgroundColor = colors.brand.primary[600];
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colors.brand.primary[500];
              }}
            >
              {loading ? 'Enviando...' : 'Enviar para Aprovação'}
            </button>
          </div>
        </form>
      </div>
    </div>
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onSaveAndExit={handleSaveAndExitClinic}
        onExitWithoutSaving={handleExitWithoutSavingClinic}
        currentStep={getClinicOnboardingStepNumber()}
        totalSteps={CLINIC_FIRST_UNIT_TOTAL_STEPS}
      />
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
  containerWithHeader: {
    minHeight: '100vh',
    backgroundColor: colors.background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    paddingTop: '88px',
  },
  topHeader: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    padding: '12px 20px',
    zIndex: 10050,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  headerContent: {
    maxWidth: '700px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoImage: {
    height: '36px',
    width: 'auto',
    objectFit: 'contain',
    display: 'block',
  },
  logoutButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
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
    backgroundColor: colors.error[100],
    borderLeft: `4px solid ${colors.error[500]}`,
    padding: '16px',
    marginBottom: '24px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '14px',
    color: '#991b1b',
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
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
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
    color: colors.error[500],
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
  hintCallout: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    marginTop: '8px',
    padding: '12px 14px',
    backgroundColor: colors.accent.sage[100],
    border: `1px solid ${colors.accent.sage[300]}`,
    borderLeft: `4px solid ${colors.accent.sage[500]}`,
    borderRadius: '10px',
    boxShadow: '0 1px 2px rgba(42, 39, 38, 0.04)',
  },
  hintIconBadge: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.accent.sage[300]}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  hintText: {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.55,
    color: colors.neutral[800],
  },
  hintLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: colors.accent.sage[500],
    marginBottom: '4px',
  },
  autoSuggestion: {
    fontSize: '12px',
    color: colors.accent.sage[500],
    fontStyle: 'italic',
    marginTop: '4px',
    display: 'block',
  },
  infoBox: {
    backgroundColor: colors.info[100],
    border: `1px solid ${colors.info[200]}`,
    borderLeft: `4px solid ${colors.info[500]}`,
    padding: '16px 18px',
    borderRadius: '12px',
    display: 'flex',
    gap: '14px',
    alignItems: 'flex-start',
    marginTop: '8px',
    boxShadow: '0 1px 2px rgba(42, 39, 38, 0.04)',
  },
  infoIconBadge: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.info[300]}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoTitle: {
    margin: '0 0 10px 0',
    fontSize: '15px',
    fontWeight: 700,
    color: colors.text,
    letterSpacing: '-0.01em',
  },
  infoList: {
    margin: 0,
    paddingLeft: '18px',
    fontSize: '13px',
    lineHeight: 1.55,
    color: colors.textSecondary,
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
    backgroundColor: colors.brand.primary[500],
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
