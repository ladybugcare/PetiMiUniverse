import React, { useState } from 'react';
import { vetsApi } from '../services/vetsApi';
import { API_BASE_URL } from '../services/api';
import ProgressBar from '../components/ProgressBar';
import PasswordInput from '../components/PasswordInput';
import HomeHeader from '../components/HomeHeader';
import { validateEmail, validatePassword, validateCRMV } from '../utils/validators';
import colors from '../styles/colors';
import { Info } from 'lucide-react';
import { supabase } from '../services/supabase';
import SignUpSuccessModal from '../components/SignUpSuccessModal';

const VetSignUpPage: React.FC = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [emailResent, setEmailResent] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    crmv: '',
    specialties: '',
    experience: '',
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validar step atual
  const isStepValid = (): boolean => {
    switch (step) {
      case 1:
        return formData.name.trim().length >= 3;
      case 2:
        return validateCRMV(formData.crmv) && !errors.crmv;
      case 3:
        return formData.specialties.trim().length >= 3;
      case 4:
        return formData.experience.trim().length > 0;
      case 5:
        return validateEmail(formData.email) && !errors.email;
      case 6:
        return validatePassword(formData.password).valid;
      default:
        return false;
    }
  };

  // Handle campo change
  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Limpa erro ao digitar novamente
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }

    // Validação dinâmica para CRMV
    if (field === 'crmv' && value.length > 0) {
      if (!validateCRMV(value)) {
        setErrors((prev) => ({ ...prev, crmv: 'Formato inválido. Exemplo: 12345-SP' }));
      }
    }

    // Validação dinâmica para email
    if (field === 'email' && value.length > 0) {
      if (!validateEmail(value)) {
        setErrors((prev) => ({ ...prev, email: 'Email inválido' }));
      }
    }
  };

  // Avançar para próximo step ou submit
  const handleNext = async () => {
    if (!isStepValid()) return;

    // Step 5 → Verificar email duplicado
    if (step === 5) {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/vets/check-email/${encodeURIComponent(formData.email)}`);
        const data = await response.json();

        if (data.exists) {
          setErrors({ email: 'Email já cadastrado na plataforma' });
          return;
        }
      } catch (error) {
        console.error('Erro ao verificar email:', error);
        setErrors({ email: 'Erro ao verificar email. Tente novamente.' });
      } finally {
        setLoading(false);
      }
    }

    // Step 6 → Criar conta
    if (step === 6) {
      await handleSignUp();
    } else {
      setStep(step + 1);
    }
  };

  // Voltar step
  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // Enviar cadastro
  const handleSignUp = async () => {
    try {
      setLoading(true);

      await vetsApi.create({
        name: formData.name.trim(),
        crmv: formData.crmv.trim(),
        specialties: formData.specialties.split(',').map((s) => s.trim()),
        experience: formData.experience.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: 'VET',
      });

      // Marcar cadastro como completo - mostrar modal ao invés de alert
      setSignupComplete(true);
    } catch (err: any) {
      console.error('Erro ao cadastrar:', err);
      alert('Erro ao cadastrar: ' + (err.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: formData.email,
      });
      if (!error) {
        setEmailResent(true);
      }
    } catch (err: any) {
      console.error('Erro ao reenviar e-mail:', err);
    } finally {
      setLoading(false);
    }
  };

  // Renderizar conteúdo do step atual
  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="step-content">
            <h2 className="text-display text-2xl font-bold mb-2 text-neutral-800">
              Qual é o seu nome completo?
            </h2>
            <p className="text-neutral-600 mb-6">
              Digite seu nome completo como veterinário
            </p>
            <input
              type="text"
              placeholder="Ex: Dr. João Silva"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              className="input"
              autoFocus
            />
          </div>
        );

      case 2:
        return (
          <div className="step-content">
            <h2 className="text-display text-2xl font-bold mb-2 text-neutral-800">
              Qual o seu número de CRMV?
            </h2>
            <p className="text-neutral-600 mb-6">
              Conselho Regional de Medicina Veterinária
            </p>
            <input
              type="text"
              placeholder="Ex: 12345-SP"
              value={formData.crmv}
              onChange={(e) => handleFieldChange('crmv', e.target.value)}
              className={`input ${
                errors.crmv
                  ? 'border-red-500'
                  : validateCRMV(formData.crmv)
                  ? 'border-green-500'
                  : ''
              }`}
              autoFocus
            />
            {errors.crmv && (
              <p className="text-red-500 text-sm mt-2">{errors.crmv}</p>
            )}

            <p
              className="text-sm text-neutral-500 mt-2"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              // @ts-ignore - Type incompatibility between React 18 and lucide-react
              <Info size={16} color={colors.primary} />
              Formato: número-UF (exemplo: 12345-SP)
            </p>
          </div>
        );

      case 3:
        return (
          <div className="step-content">
            <h2 className="text-display text-2xl font-bold mb-2 text-neutral-800">
              Quais são suas especialidades?
            </h2>
            <p className="text-neutral-600 mb-6">
              Liste suas áreas de atuação separadas por vírgula
            </p>
            <textarea
              placeholder="Ex: Cirurgia, Clínica Geral, Cardiologia"
              value={formData.specialties}
              onChange={(e) =>
                handleFieldChange('specialties', e.target.value)
              }
              className="input"
              rows={3}
              autoFocus
            />
            <p
              className="text-sm text-neutral-500 mt-2"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              // @ts-ignore - Type incompatibility between React 18 and lucide-react
              <Info size={16} color={colors.primary} />
              Separe múltiplas especialidades com vírgula
            </p>
          </div>
        );

      case 4:
        return (
          <div className="step-content">
            <h2 className="text-display text-2xl font-bold mb-2 text-neutral-800">
              Quantos anos de experiência você tem?
            </h2>
            <p className="text-neutral-600 mb-6">
              Conte-nos sobre sua trajetória profissional
            </p>
            <input
              type="text"
              placeholder="Ex: 5 anos"
              value={formData.experience}
              onChange={(e) =>
                handleFieldChange('experience', e.target.value)
              }
              className="input"
              autoFocus
            />
          </div>
        );

      case 5:
        return (
          <div className="step-content">
            <h2 className="text-display text-2xl font-bold mb-2 text-neutral-800">
              Qual o seu email profissional?
            </h2>
            <p className="text-neutral-600 mb-6">
              Usaremos este email para comunicações e login
            </p>
            <div className="relative">
              <input
                type="email"
                placeholder="dr.joao@email.com"
                value={formData.email}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                className={`input ${
                  errors.email
                    ? 'border-red-500'
                    : validateEmail(formData.email)
                    ? 'border-green-500'
                    : ''
                }`}
                autoFocus
              />
            </div>
            {errors.email && (
              <p className="text-red-500 text-sm mt-2">{errors.email}</p>
            )}
          </div>
        );

      case 6:
        return (
          <div className="step-content">
            <h2 className="text-display text-2xl font-bold mb-2 text-neutral-800">
              Crie uma senha segura
            </h2>
            <p className="text-neutral-600 mb-6">
              A senha deve ter no mínimo 8 caracteres
            </p>
            <PasswordInput
              value={formData.password}
              onChange={(value) =>
                handleFieldChange('password', value)
              }
              placeholder="Digite sua senha"
              showStrength={true}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <HomeHeader />
      <div className="clinic-signup-container">
        <div className="clinic-signup-content">
          {/* Coluna Esquerda - Formulário */}
          <div className="signup-form-section">
            <ProgressBar currentStep={step} totalSteps={6} />

            <p className="text-sm text-neutral-500 mb-6">
              Passo {step} de 6
            </p>

            <div className="mb-8">{renderStepContent()}</div>

            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                {step > 1 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      backgroundColor: colors.surface,
                      color: colors.textSecondary,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      opacity: loading ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!loading)
                        e.currentTarget.style.backgroundColor =
                          colors.neutral[50];
                    }}
                    onMouseLeave={(e) => {
                      if (!loading)
                        e.currentTarget.style.backgroundColor =
                          colors.surface;
                    }}
                  >
                    ← Voltar
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!isStepValid() || loading}
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    backgroundColor:
                      !isStepValid() || loading
                        ? colors.primaryLight
                        : colors.primary,
                    color: colors.surface,
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor:
                      !isStepValid() || loading
                        ? 'not-allowed'
                        : 'pointer',
                    transition: 'background-color 0.2s',
                    opacity: !isStepValid() || loading ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (isStepValid() && !loading) {
                      e.currentTarget.style.backgroundColor =
                        colors.primaryDark;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isStepValid() && !loading) {
                      e.currentTarget.style.backgroundColor =
                        colors.primary;
                    }
                  }}
                >
                  {loading
                    ? 'Cadastrando...'
                    : step === 6
                    ? 'Criar Conta'
                    : 'Próximo →'}
                </button>
              </div>
            </div>
          </div>

          {/* Coluna Direita - Imagens e Texto */}
          <div className="signup-images-section">
            <h2 className="text-display">
              Conectando quem cuida, quem ama e quem precisa.
            </h2>
            <p>
              Junte-se ao PetiVet e encontre as melhores oportunidades de
              trabalho em clínicas veterinárias. Candidate-se às demandas que
              mais combinam com seu perfil e construa uma carreira de sucesso.
            </p>

            {/* Colagem de imagens circulares */}
            <div className="hero-images-right">
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: '320px',
                  height: '320px',
                }}
              >
                {/* Imagem 1 */}
                <div
                  className="hero-image-circle animate-float"
                  style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    width: '120px',
                    height: '120px',
                    zIndex: 3,
                  }}
                >
                  <img
                    src="/img1.png"
                    alt="Veterinário cuidando de pet"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>

                {/* Imagem 2 */}
                <div
                  className="hero-image-circle"
                  style={{
                    position: 'absolute',
                    top: '40px',
                    right: '30px',
                    width: '110px',
                    height: '110px',
                    zIndex: 4,
                    animationDelay: '0.3s',
                  }}
                >
                  <img
                    src="/img2.jpg"
                    alt="Pet feliz"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>

                {/* Imagem 3 */}
                <div
                  className="hero-image-circle animate-float"
                  style={{
                    position: 'absolute',
                    bottom: '60px',
                    right: '40px',
                    width: '140px',
                    height: '140px',
                    zIndex: 5,
                    animationDelay: '0.15s',
                  }}
                >
                  <img
                    src="/im3.jpg"
                    alt="Clínica veterinária"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>

                {/* Imagem 4 */}
                <div
                  className="hero-image-circle"
                  style={{
                    position: 'absolute',
                    bottom: '30px',
                    left: '0',
                    width: '95px',
                    height: '95px',
                    zIndex: 2,
                    animationDelay: '0.5s',
                  }}
                >
                  <img
                    src="/img4.jpg"
                    alt="Profissional veterinário"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>

                {/* Imagem 5 */}
                <div
                  className="hero-image-circle animate-float"
                  style={{
                    position: 'absolute',
                    bottom: '0',
                    right: '15px',
                    width: '85px',
                    height: '85px',
                    zIndex: 1,
                    animationDelay: '0.7s',
                  }}
                >
                  <img
                    src="/img5.jpg"
                    alt="Cuidado animal"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mensagem de sucesso */}
      {signupComplete && (
        <SignUpSuccessModal
          email={formData.email}
          loading={loading}
          emailResent={emailResent}
          onResendEmail={handleResendEmail}
        />
      )}
    </>
  );
};

export default VetSignUpPage;
