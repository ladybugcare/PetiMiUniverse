import React, { useState } from 'react';
import { clinicsApi } from '../services/clinicsApi';
import { API_BASE_URL } from '../services/api';
import { supabase } from '../services/supabase';
import ProgressBar from '../components/ProgressBar';
import PasswordInput from '../components/PasswordInput';
import HomeHeader from '../components/HomeHeader';
import { validateCNPJ, formatCNPJ, validateEmail, validatePassword } from '../utils/validators';
import colors from '../styles/colors';
import { Info } from 'lucide-react';
import SignUpSuccessModal from '../components/SignUpSuccessModal';

const ClinicSignUpPage: React.FC = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [emailResent, setEmailResent] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    cnpj: '',
    address: '',
    email: '',
    password: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validar step atual
  const isStepValid = (): boolean => {
    switch (step) {
      case 1: return formData.name.trim().length >= 3;
      case 2: return validateCNPJ(formData.cnpj) && !errors.cnpj;
      case 3: return formData.address.trim().length > 10;
      case 4: return validateEmail(formData.email) && !errors.email;
      case 5: return validatePassword(formData.password).valid;
      default: return false;
    }
  };

  // Handle campo change
  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Limpar erro quando usuário digita
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Validação em tempo real para CNPJ
    if (field === 'cnpj') {
      const formatted = formatCNPJ(value);
      setFormData(prev => ({ ...prev, cnpj: formatted }));

      if (formatted.length === 18 && !validateCNPJ(formatted)) {
        setErrors(prev => ({ ...prev, cnpj: 'CNPJ inválido' }));
      }
    }

    // Validação em tempo real para email
    if (field === 'email' && value.length > 0) {
      if (!validateEmail(value)) {
        setErrors(prev => ({ ...prev, email: 'Email inválido' }));
      }
    }
  };

  // Avançar para próximo step ou submit
  const handleNext = async () => {
    if (!isStepValid()) return;

    // Step 2: Verificar se CNPJ já existe
    if (step === 2) {
      try {
        const response = await fetch(`${API_BASE_URL}/clinics/check-cnpj/${encodeURIComponent(formData.cnpj)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.exists) {
            setErrors({ cnpj: 'CNPJ já cadastrado na plataforma' });
            return;
          }
        }
      } catch (error) {
        console.error('Erro ao verificar CNPJ:', error);
      }
    }

    // Step 4: Verificar se email já existe
    if (step === 4) {
      try {
        const response = await fetch(`${API_BASE_URL}/clinics/check-email/${encodeURIComponent(formData.email)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.exists) {
            setErrors({ email: 'Email já cadastrado na plataforma' });
            return;
          }
        }
      } catch (error) {
        console.error('Erro ao verificar email:', error);
      }
    }

    // Step 5: Submit final
    if (step === 5) {
      await handleSignUp();
    } else {
      setStep(step + 1);
    }
  };

  // Voltar step
  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  // Enviar cadastro
  const handleSignUp = async () => {
    try {
      setLoading(true);

      await clinicsApi.create({
        name: formData.name,
        cnpj: formData.cnpj,
        address: formData.address,
        email: formData.email,
        password: formData.password,
      });

      // NÃO salvar flag isFirstAccess nem token ainda
      // Usuário só acessa após confirmar email

      // Marcar cadastro como completo
      setSignupComplete(true);
    } catch (err: any) {
      alert('Erro ao cadastrar: ' + (err.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  // Reenviar email de confirmação
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
              Qual o nome da sua clínica?
            </h2>
            <p className="text-neutral-600 mb-6">
              Digite o nome completo da clínica veterinária
            </p>
            <input
              type="text"
              placeholder="Ex: Clínica Veterinária PetCare"
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
              Qual o CNPJ da clínica?
            </h2>
            <p className="text-neutral-600 mb-6">
              Informe o CNPJ para validar o cadastro
            </p>
            <div className="relative">
              <input
                type="text"
                placeholder="00.000.000/0000-00"
                value={formData.cnpj}
                onChange={(e) => handleFieldChange('cnpj', e.target.value)}
                className={`input ${errors.cnpj ? 'border-red-500' : validateCNPJ(formData.cnpj) ? 'border-green-500' : ''}`}
                maxLength={18}
                autoFocus
              />
              {validateCNPJ(formData.cnpj) && !errors.cnpj && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" />
              )}
            </div>
            {errors.cnpj && (
              <p className="text-red-500 text-sm mt-2">{errors.cnpj}</p>
            )}
          </div>
        );

      case 3:
        return (
          <div className="step-content">
            <h2 className="text-display text-2xl font-bold mb-2 text-neutral-800">
              Onde sua clínica está localizada?
            </h2>
            <p className="text-neutral-600 mb-6">
              Endereço completo com rua, número, bairro e cidade
            </p>
            <textarea
              placeholder="Ex: Rua das Flores, 123 - Centro - São Paulo/SP - CEP 01234-567"
              value={formData.address}
              onChange={(e) => handleFieldChange('address', e.target.value)}
              className="input"
              rows={3}
              autoFocus
            />
            <p
              className="text-sm text-neutral-500 mt-2"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Info size={16} color={colors.primary} />
              Dica: Inclua CEP para facilitar que veterinários encontrem sua clínica
            </p>
          </div>
        );

      case 4:
        return (
          <div className="step-content">
            <h2 className="text-display text-2xl font-bold mb-2 text-neutral-800">
              Qual o email da clínica?
            </h2>
            <p className="text-neutral-600 mb-6">
              Usaremos este email para comunicações e login
            </p>
            <div className="relative">
              <input
                type="email"
                placeholder="contato@clinica.com"
                value={formData.email}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                className={`input ${errors.email ? 'border-red-500' : validateEmail(formData.email) ? 'border-green-500' : ''}`}
                autoFocus
              />
              {validateEmail(formData.email) && !errors.email && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" />
              )}
            </div>
            {errors.email && (
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
              onChange={(value) => handleFieldChange('password', value)}
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

            <div className="mb-8">
              {renderStepContent()}
            </div>

            <div style={{ marginTop: '24px' }}>
              {/* Botões principais */}
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
                      if (!loading) e.currentTarget.style.backgroundColor = colors.neutral[50];
                    }}
                    onMouseLeave={(e) => {
                      if (!loading) e.currentTarget.style.backgroundColor = colors.surface;
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
                      (!isStepValid() || loading) ? colors.primaryLight : colors.primary,
                    color: colors.surface,
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: (!isStepValid() || loading) ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s',
                    opacity: (!isStepValid() || loading) ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (isStepValid() && !loading) {
                      e.currentTarget.style.backgroundColor = colors.primaryDark;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isStepValid() && !loading) {
                      e.currentTarget.style.backgroundColor = colors.primary;
                    }
                  }}
                >
                  {loading ? 'Cadastrando...' : step === 5 ? 'Criar Conta' : 'Próximo →'}
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
              Junte-se ao PetiVet e faça parte da maior rede de clínicas e profissionais
              veterinários do Brasil. Publique oportunidades e encontre os melhores
              veterinários para sua equipe.
            </p>

            {/* Colagem de imagens circulares - reutilizando do Hero */}
            <div className="hero-images-right">
              <div style={{ position: 'relative', width: '100%', maxWidth: '320px', height: '320px' }}>
                {/* Imagem 1 */}
                <div
                  className="hero-image-circle animate-float"
                  style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    width: '120px',
                    height: '120px',
                    zIndex: 3
                  }}
                >
                  <img
                    src="/img1.png"
                    alt="Veterinário cuidando de pet"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
                    animationDelay: '0.3s'
                  }}
                >
                  <img
                    src="/img2.jpg"
                    alt="Pet feliz"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
                    animationDelay: '0.15s'
                  }}
                >
                  <img
                    src="/im3.jpg"
                    alt="Clínica veterinária"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
                    animationDelay: '0.5s'
                  }}
                >
                  <img
                    src="/img4.jpg"
                    alt="Profissional veterinário"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
                    animationDelay: '0.7s'
                  }}
                >
                  <img
                    src="/img5.jpg"
                    alt="Cuidado animal"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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

export default ClinicSignUpPage;
