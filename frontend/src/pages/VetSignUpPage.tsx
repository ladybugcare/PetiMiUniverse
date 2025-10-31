import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { vetsApi } from '../services/vetsApi';
import { API_BASE_URL } from '../services/api';
import ProgressBar from '../components/ProgressBar';
import PasswordInput from '../components/PasswordInput';
import HomeHeader from '../components/HomeHeader';
import { validateEmail, validatePassword } from '../utils/validators';
import colors from '../styles/colors';
import { Info, CheckCircle, Heart, Mail } from 'lucide-react';

const VetSignUpPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    crmv: '',
    specialties: '',
    experience: '',
    email: '',
    password: ''
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validar step atual
  const isStepValid = (): boolean => {
    switch(step) {
      case 1: return formData.name.trim().length >= 3;
      case 2: return formData.crmv.trim().length >= 5;
      case 3: return formData.specialties.trim().length >= 3;
      case 4: return formData.experience.trim().length > 0;
      case 5: return validateEmail(formData.email) && !errors.email;
      case 6: return validatePassword(formData.password).valid;
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
    
    // Step 5: Verificar se email já existe
    if (step === 5) {
      try {
        const response = await fetch(`${API_BASE_URL}/vets/check-email/${encodeURIComponent(formData.email)}`);
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
    
    // Step 6: Submit final
    if (step === 6) {
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

      await vetsApi.create({
        name: formData.name,
        crmv: formData.crmv,
        specialties: formData.specialties.split(',').map(s => s.trim()),
        experience: formData.experience,
        email: formData.email,
        password: formData.password,
      });

      // Marcar cadastro como completo - mostrar modal ao invés de alert
      setSignupComplete(true);
    } catch (err: any) {
      alert('Erro ao cadastrar: ' + (err.message || 'Tente novamente.'));
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
              className="input"
              autoFocus
            />
            <p className="text-sm text-neutral-500 mt-2" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
              onChange={(e) => handleFieldChange('specialties', e.target.value)}
              className="input"
              rows={3}
              autoFocus
            />
            <p className="text-sm text-neutral-500 mt-2" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
              onChange={(e) => handleFieldChange('experience', e.target.value)}
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
                className={`input ${errors.email ? 'border-red-500' : validateEmail(formData.email) ? 'border-green-500' : ''}`}
                autoFocus
              />
              {validateEmail(formData.email) && !errors.email && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                  <CheckCircle size={20} />
                </span>
              )}
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
          <ProgressBar currentStep={step} totalSteps={6} />
          
          <p className="text-sm text-neutral-500 mb-6">
            Passo {step} de 6
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
                  backgroundColor: (!isStepValid() || loading) ? colors.primaryLight : colors.primary,
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
                  if (isStepValid() && !loading) e.currentTarget.style.backgroundColor = colors.primaryDark;
                }}
                onMouseLeave={(e) => {
                  if (isStepValid() && !loading) e.currentTarget.style.backgroundColor = colors.primary;
                }}
              >
                {loading ? 'Cadastrando...' : step === 6 ? 'Criar Conta' : 'Próximo →'}
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
            Junte-se ao PetiVet e encontre as melhores oportunidades de trabalho 
            em clínicas veterinárias. Candidate-se às demandas que mais combinam 
            com seu perfil e construa uma carreira de sucesso.
          </p>
          
          {/* Colagem de imagens circulares */}
          <div className="hero-images-right">
            <div style={{position: 'relative', width: '100%', maxWidth: '320px', height: '320px'}}>
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
                  style={{width: '100%', height: '100%', objectFit: 'cover'}}
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
                  style={{width: '100%', height: '100%', objectFit: 'cover'}}
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
                  style={{width: '100%', height: '100%', objectFit: 'cover'}}
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
                  style={{width: '100%', height: '100%', objectFit: 'cover'}}
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
                  style={{width: '100%', height: '100%', objectFit: 'cover'}}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Mensagem de sucesso após cadastro */}
    {signupComplete && (
      <div style={styles.successOverlay}>
        <div style={styles.successCard}>
          <h2 style={styles.successTitle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <Heart size={32} color={colors.primary} fill={colors.primary} />
              <span>Tudo pronto!</span>
            </div>
          </h2>
          <p style={styles.successMessage}>
            Enviamos um e-mail de confirmação para o endereço que você cadastrou.
          </p>
          <p style={styles.successMessage}>
            É só abrir sua caixa de entrada e seguir as instruções para ativar sua conta PetiVet.
          </p>
          <p style={styles.successMessage}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Você pode fechar esta aba — o restante do processo é feito por e-mail.
              <Mail size={18} color={colors.primary} />
            </span>
          </p>
          <button 
            onClick={() => navigate('/login')} 
            style={styles.closeButton}
          >
            Fechar
          </button>
        </div>
      </div>
    )}
    </>
  );
};

const styles = {
  successOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  successCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '500px',
    width: '90%',
    textAlign: 'center' as const,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
  },
  successTitle: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '20px',
  },
  successMessage: {
    fontSize: '16px',
    color: '#6b7280',
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  closeButton: {
    marginTop: '24px',
    padding: '12px 32px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease-in-out',
  },
};

export default VetSignUpPage;
