import React, { useState } from 'react';
import { freelancersApi } from '../services/freelancersApi';
import { API_BASE_URL } from '../services/api';
import ProgressBar from '../components/ProgressBar';
import PasswordInput from '../components/PasswordInput';
import HomeHeader from '../components/HomeHeader';
import { validateEmail, validatePassword, validateCPF, validateCNPJ, formatCPF, formatCNPJ } from '../utils/validators';
import colors from '../styles/colors';
import { Info } from 'lucide-react';
import IconWrapper from '../components/IconWrapper';
import { supabase } from '../services/supabase';
import SignUpSuccessModal from '../components/SignUpSuccessModal';
import AddressAutocomplete from '../components/AddressAutocomplete';

// Componente customizado de ícone Info sem fundo preto
const InfoIconNoBg: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = colors.primary }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ backgroundColor: 'transparent' }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M12 16v-4M12 8h.01"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
};

const FreelancerSignUpPage: React.FC = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [emailResent, setEmailResent] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    document_type: '' as 'CPF' | 'CNPJ' | '',
    document_number: '',
    address: '',
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validar step atual (5 steps ao invés de 6, sem CRMV)
  const isStepValid = (): boolean => {
    switch (step) {
      case 1:
        return formData.name.trim().length >= 3;
      case 2:
        // Validar tipo de documento e número se tipo estiver selecionado
        if (!formData.document_type) return false;
        if (formData.document_type === 'CPF') {
          return validateCPF(formData.document_number) && !errors?.document_number;
        } else if (formData.document_type === 'CNPJ') {
          return validateCNPJ(formData.document_number) && !errors?.document_number;
        }
        return false;
      case 3:
        return formData.address.trim().length > 0;
      case 4:
        return validateEmail(formData.email) && !errors?.email;
      case 5:
        return validatePassword(formData.password).valid;
      default:
        return false;
    }
  };

  // Handle campo change
  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    // Se mudar o tipo de documento, limpa o número do documento
    if (field === 'document_type') {
      setFormData((prev) => ({ ...prev, document_type: value as 'CPF' | 'CNPJ', document_number: '' }));
      setErrors((prev) => ({ ...prev, document_number: '' }));
      return;
    }

    // Aplicar máscara para número do documento
    if (field === 'document_number') {
      let formattedValue = value;
      if (formData.document_type === 'CPF') {
        formattedValue = formatCPF(value);
      } else if (formData.document_type === 'CNPJ') {
        formattedValue = formatCNPJ(value);
      }
      setFormData((prev) => ({ ...prev, [field]: formattedValue }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }

    // Limpa erro ao digitar novamente
    if (errors?.[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }

    // Validação dinâmica para documento
    if (field === 'document_number' && value.length > 0) {
      if (formData.document_type === 'CPF') {
        if (!validateCPF(value)) {
          setErrors((prev) => ({ ...prev, document_number: 'CPF inválido' }));
        }
      } else if (formData.document_type === 'CNPJ') {
        if (!validateCNPJ(value)) {
          setErrors((prev) => ({ ...prev, document_number: 'CNPJ inválido' }));
        }
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

    // Step 2 → Verificar documento duplicado
    if (step === 2) {
      try {
        setLoading(true);
        // Normalizar documento (remover formatação)
        const normalizedDocument = formData.document_number.replace(/[^\d]/g, '');
        
        const response = await fetch(`${API_BASE_URL}/freelancers/check-document/${normalizedDocument}`);
        
        if (!response.ok) {
          throw new Error('Erro ao verificar documento');
        }

        const text = await response.text();
        if (!text) {
          // Resposta vazia, assumir que documento não existe
          setStep(step + 1);
          return;
        }

        const data = JSON.parse(text);

        if (data.exists) {
          setErrors({ document_number: 'Este documento já está cadastrado na plataforma' });
          return;
        }
      } catch (error) {
        console.error('Erro ao verificar documento:', error);
        setErrors({ document_number: 'Erro ao verificar documento. Tente novamente.' });
        return;
      } finally {
        setLoading(false);
      }
    }

    // Step 4 → Verificar email duplicado
    if (step === 4) {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/freelancers/check-email/${encodeURIComponent(formData.email)}`);
        
        if (!response.ok) {
          throw new Error('Erro ao verificar email');
        }

        const text = await response.text();
        if (!text) {
          // Resposta vazia, assumir que email não existe
          return;
        }

        const data = JSON.parse(text);

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

    // Step 5 → Criar conta
    if (step === 5) {
      await handleSignUp();
    } else {
      setStep(step + 1);
    }
  };

  // Voltar step
  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // Handler para teclado Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Se Enter foi pressionado e botão está habilitado
    if (e.key === 'Enter' && isStepValid() && !loading) {
      // Para textarea (step 3 - endereço), Shift+Enter permite quebra de linha
      if (step === 3 && e.currentTarget.tagName === 'TEXTAREA') {
        if (e.shiftKey) {
          // Shift+Enter: permite quebra de linha (comportamento padrão)
          return;
        }
        // Enter sem Shift: aciona botão
        e.preventDefault();
        handleNext();
      } else {
        // Para inputs normais, Enter sempre aciona botão
        e.preventDefault();
        handleNext();
      }
    }
  };

  // Enviar cadastro
  const handleSignUp = async () => {
    try {
      setLoading(true);

      await freelancersApi.create({
        name: formData.name.trim(),
        document_type: formData.document_type as 'CPF' | 'CNPJ',
        document_number: formData.document_number,
        address: formData.address.trim(),
        email: formData.email.trim(),
        password: formData.password,
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
              Digite seu nome completo como freelancer
            </p>
            <input
              type="text"
              placeholder="Ex: João Silva"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              onKeyDown={handleKeyDown}
              className="input"
              autoFocus
            />
          </div>
        );

      case 2:
        return (
          <div className="step-content">
            <h2 className="text-display text-2xl font-bold mb-2 text-neutral-800">
              Qual o tipo do seu documento?
            </h2>
            <p className="text-neutral-600 mb-6">
              Selecione se você possui CPF ou CNPJ
            </p>
            
            {/* Botões de seleção (Combobox) */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: formData.document_type ? '24px' : '0' }}>
              <button
                type="button"
                onClick={() => handleFieldChange('document_type', 'CPF')}
                style={{
                  flex: 1,
                  padding: '16px 24px',
                  borderRadius: '8px',
                  border: `2px solid ${formData.document_type === 'CPF' ? colors.primary : colors.border}`,
                  backgroundColor: formData.document_type === 'CPF' ? colors.primary : colors.surface,
                  color: formData.document_type === 'CPF' ? colors.surface : colors.textSecondary,
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (formData.document_type !== 'CPF') {
                    e.currentTarget.style.borderColor = colors.primary;
                    e.currentTarget.style.backgroundColor = colors.neutral[50];
                  }
                }}
                onMouseLeave={(e) => {
                  if (formData.document_type !== 'CPF') {
                    e.currentTarget.style.borderColor = colors.border;
                    e.currentTarget.style.backgroundColor = colors.surface;
                  }
                }}
              >
                CPF
              </button>
              <button
                type="button"
                onClick={() => handleFieldChange('document_type', 'CNPJ')}
                style={{
                  flex: 1,
                  padding: '16px 24px',
                  borderRadius: '8px',
                  border: `2px solid ${formData.document_type === 'CNPJ' ? colors.primary : colors.border}`,
                  backgroundColor: formData.document_type === 'CNPJ' ? colors.primary : colors.surface,
                  color: formData.document_type === 'CNPJ' ? colors.surface : colors.textSecondary,
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (formData.document_type !== 'CNPJ') {
                    e.currentTarget.style.borderColor = colors.primary;
                    e.currentTarget.style.backgroundColor = colors.neutral[50];
                  }
                }}
                onMouseLeave={(e) => {
                  if (formData.document_type !== 'CNPJ') {
                    e.currentTarget.style.borderColor = colors.border;
                    e.currentTarget.style.backgroundColor = colors.surface;
                  }
                }}
              >
                CNPJ
              </button>
            </div>

            {/* Campo de número do documento aparece quando tipo é selecionado */}
            {formData.document_type && (
              <div style={{ marginTop: '24px' }}>
                <h3 className="text-display text-lg font-semibold mb-2 text-neutral-800">
                  Qual o número do seu {formData.document_type}?
                </h3>
                <p className="text-neutral-600 mb-4">
                  Digite o número do seu {formData.document_type}
                </p>
                <input
                  type="text"
                  placeholder={formData.document_type === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                  value={formData.document_number}
                  onChange={(e) => handleFieldChange('document_number', e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={`input ${
                    errors?.document_number
                      ? 'border-red-500'
                      : (formData.document_type === 'CPF' && validateCPF(formData.document_number)) ||
                        (formData.document_type === 'CNPJ' && validateCNPJ(formData.document_number))
                      ? 'border-green-500'
                      : ''
                  }`}
                  maxLength={formData.document_type === 'CPF' ? 14 : 18}
                  autoFocus
                />
                {errors?.document_number && (
                  <p className="text-red-500 text-sm mt-2">{errors.document_number}</p>
                )}
            <p
              className="text-sm text-neutral-500 mt-2"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
                  <span style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: 'transparent' }}>
                    <IconWrapper 
                      icon={Info} 
                      size={16} 
                      color={colors.primary}
                      style={{ backgroundColor: 'transparent' }}
                    />
              </span>
                  {formData.document_type === 'CPF' 
                    ? 'Formato: 000.000.000-00'
                    : 'Formato: 00.000.000/0000-00'}
            </p>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="step-content">
            <h2 className="text-display text-2xl font-bold mb-2 text-neutral-800">
              Qual o seu endereço?
            </h2>
            <p className="text-neutral-600 mb-6">
              Digite o endereço e selecione uma sugestão do Google
            </p>
            <AddressAutocomplete
              value={formData.address}
              onChange={(address) => handleFieldChange('address', address)}
              onKeyDown={handleKeyDown}
              className="input"
              placeholder="Ex: Rua das Flores, 123 - Centro - São Paulo/SP"
              autoFocus
            />
            <p
              className="text-sm text-neutral-500 mt-2"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: 'transparent' }}>
                <InfoIconNoBg size={16} color={colors.primary} />
              </span>
              Digite o endereço e selecione uma sugestão do Google para preenchimento automático
            </p>
          </div>
        );

      case 4:
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
                placeholder="joao@email.com"
                value={formData.email}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                onKeyDown={handleKeyDown}
                className={`input ${
                  errors?.email
                    ? 'border-red-500'
                    : validateEmail(formData.email)
                    ? 'border-green-500'
                    : ''
                }`}
                autoFocus
              />
            </div>
            {errors?.email && (
              <p className="text-red-500 text-sm mt-2">{errors.email}</p>
            )}
          </div>
        );

      case 5:
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
              onKeyDown={handleKeyDown}
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
            <ProgressBar currentStep={step} totalSteps={5} />

            <p className="text-sm text-neutral-500 mb-6">
              Passo {step} de 5
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
                    : step === 5
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
              Junte-se ao PetiVet como freelancer e encontre as melhores oportunidades de
              trabalho. Candidate-se às demandas que mais combinam com seu perfil e construa uma carreira de sucesso.
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
                    alt="Freelancer cuidando de pet"
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
                    alt="Serviços para pets"
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
                    alt="Profissional freelancer"
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

export default FreelancerSignUpPage;

