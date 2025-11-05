import React, { useState } from 'react';
import { clinicsApi } from '../services/clinicsApi';
import { API_BASE_URL } from '../services/api';
import { supabase } from '../services/supabase';
import ProgressBar from '../components/ProgressBar';
import PasswordInput from '../components/PasswordInput';
import HomeHeader from '../components/HomeHeader';
import {
  validateCNPJ,
  formatCNPJ,
  validateEmail,
  validatePassword,
} from '../utils/validators';
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
    password: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validação do step atual
  const isStepValid = (): boolean => {
    switch (step) {
      case 1:
        return formData.name.trim().length >= 3;
      case 2:
        return validateCNPJ(formData.cnpj) && !errors.cnpj;
      case 3:
        return formData.address.trim().length > 10;
      case 4:
        return validateEmail(formData.email) && !errors.email;
      case 5:
        return validatePassword(formData.password).valid;
      default:
        return false;
    }
  };

  // Atualiza campo e faz validações dinâmicas
  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));

    if (field === 'cnpj') {
      const formatted = formatCNPJ(value);
      setFormData((prev) => ({ ...prev, cnpj: formatted }));

      if (formatted.length === 18 && !validateCNPJ(formatted)) {
        setErrors((prev) => ({ ...prev, cnpj: 'CNPJ inválido' }));
      }
    }

    if (field === 'email' && value.length > 0) {
      if (!validateEmail(value)) {
        setErrors((prev) => ({ ...prev, email: 'Email inválido' }));
      }
    }
  };

  // Avança de etapa ou envia cadastro
  const handleNext = async () => {
    if (!isStepValid()) return;

    // Step 2 → verifica CNPJ duplicado
    if (step === 2) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/clinics/check-cnpj/${encodeURIComponent(formData.cnpj)}`
        );
        const data = await response.json();
        if (data.exists) {
          setErrors({ cnpj: 'CNPJ já cadastrado na plataforma' });
          return;
        }
      } catch (error) {
        console.error('Erro ao verificar CNPJ:', error);
      }
    }

    // Step 4 → verifica email duplicado
    if (step === 4) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/clinics/check-email/${encodeURIComponent(formData.email)}`
        );
        const data = await response.json();
        if (data.exists) {
          setErrors({ email: 'Email já cadastrado na plataforma' });
          return;
        }
      } catch (error) {
        console.error('Erro ao verificar email:', error);
      }
    }

    // Step 5 → cria conta
    if (step === 5) {
      await handleSignUp();
    } else {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // Submete cadastro da clínica
  const handleSignUp = async () => {
    try {
      setLoading(true);

      await clinicsApi.create({
        name: formData.name.trim(),
        cnpj: formData.cnpj.trim(),
        address: formData.address.trim(),
        email: formData.email.trim(),
        password: formData.password,
        //role: 'CADMIN',
      });

      setSignupComplete(true);
    } catch (err: any) {
      console.error('Erro ao cadastrar clínica:', err);
      alert('Erro ao cadastrar: ' + (err.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  // Reenvia e-mail de confirmação
  const handleResendEmail = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: formData.email,
      });
      if (!error) setEmailResent(true);
    } catch (err: any) {
      console.error('Erro ao reenviar e-mail:', err);
    } finally {
      setLoading(false);
    }
  };

  // Conteúdo dinâmico de cada etapa
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
                className={`input ${
                  errors.cnpj
                    ? 'border-red-500'
                    : validateCNPJ(formData.cnpj)
                    ? 'border-green-500'
                    : ''
                }`}
                maxLength={18}
                autoFocus
              />
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
              Dica: Inclua CEP para facilitar que veterinários encontrem sua
              clínica
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
                      opacity: loading ? 0.5 : 1,
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

          {/* Coluna Direita - Imagens */}
          <div className="signup-images-section">
            <h2 className="text-display">
              Conectando quem cuida, quem ama e quem precisa.
            </h2>
            <p>
              Junte-se ao PetiVet e faça parte da maior rede de clínicas e
              profissionais veterinários do Brasil. Publique oportunidades e
              encontre os melhores veterinários para sua equipe.
            </p>

            <div className="hero-images-right">
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: '320px',
                  height: '320px',
                }}
              >
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

                <div
                  className="hero-image-circle"
                  style={{
                    position: 'absolute',
                    top: '40px',
                    right: '30px',
                    width: '110px',
                    height: '110px',
                    zIndex: 4,
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

                <div
                  className="hero-image-circle animate-float"
                  style={{
                    position: 'absolute',
                    bottom: '60px',
                    right: '40px',
                    width: '140px',
                    height: '140px',
                    zIndex: 5,
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

                <div
                  className="hero-image-circle"
                  style={{
                    position: 'absolute',
                    bottom: '30px',
                    left: '0',
                    width: '95px',
                    height: '95px',
                    zIndex: 2,
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

                <div
                  className="hero-image-circle animate-float"
                  style={{
                    position: 'absolute',
                    bottom: '0',
                    right: '15px',
                    width: '85px',
                    height: '85px',
                    zIndex: 1,
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
