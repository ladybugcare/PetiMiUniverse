import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login, resendConfirmationEmail, API_BASE_URL } from '../services/api';
import HomeHeader from '../components/HomeHeader';
import PasswordInput from '../components/PasswordInput';
import EmailNotConfirmedModal from '../components/EmailNotConfirmedModal';
import { useAlert } from '../hooks/useAlert';
import colors from '../styles/colors';
import { Mail, Lock } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { getUserRole, getDashboardPathForRole } from '../utils/authHelpers';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmailNotConfirmedModal, setShowEmailNotConfirmedModal] = useState(false);
  const [emailForResend, setEmailForResend] = useState('');
  const navigate = useNavigate();
  const { showError, showWarning, showSuccess } = useAlert();
  const { setAuthFromLogin } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      showWarning('Por favor, preencha todos os campos.');
      return;
    }

    try {
      setLoading(true);
      const result = await login({ email, password });

      if (!result?.user) {
        setLoading(false);
        setTimeout(() => {
          showError('Falha ao obter informações do usuário.', 'Erro no login');
        }, 100);
        return;
      }

      console.log('Login result:', result);

      // Centraliza persistência de auth (user/session/onboarding/etc)
      setAuthFromLogin(result);

      // Usar getUserRole() para detecção robusta e consistente
      const userRole = getUserRole(result.user);
      const onboardingInfo = result.onboarding;
      const vetOnboardingInfo = result.vetOnboarding;
      const freelancerOnboardingInfo = result.freelancerOnboarding;

      // Regras de redirecionamento pós-login baseadas na role
      if (userRole === 'ADMIN') {
        navigate('/admin-dashboard', { replace: true });
        return;
      }

      // VET: Verificar onboarding e aprovação
      if (userRole === 'VET') {
        // REGRA CRÍTICA: Se onboarding já foi completado (onboardingCompleted === true),
        // NUNCA redirecionar para onboarding, mesmo se needsOnboarding for true
        if (vetOnboardingInfo?.onboardingCompleted === true) {
          // Onboarding já foi completado, ir para dashboard
          if (!vetOnboardingInfo?.isApproved) {
            navigate('/vet-dashboard', { replace: true });
            return;
          }
          navigate('/vet-dashboard', { replace: true });
          return;
        }
        
        // Se não tem dados de onboarding OU precisa completar onboarding, redirecionar
        // (email já está confirmado, verificado no backend)
        if (!vetOnboardingInfo || vetOnboardingInfo?.needsOnboarding) {
          navigate('/vet-onboarding', { replace: true });
          return;
        }

        // Se não está aprovado, mostrar mensagem e redirecionar para página de aguardo
        if (!vetOnboardingInfo?.isApproved) {
          // Pode redirecionar para uma página de "aguardando aprovação" ou mostrar mensagem
          // Por enquanto, vamos para o dashboard que vai verificar e mostrar mensagem
          navigate('/vet-dashboard', { replace: true });
          return;
        }

        // Aprovado e onboarding completo: ir para dashboard
        navigate('/vet-dashboard', { replace: true });
        return;
      }

      // FREELANCER: Verificar onboarding e aprovação
      if (userRole === 'FREELANCER') {
        // REGRA CRÍTICA: Se onboarding já foi completado (onboardingCompleted === true),
        // NUNCA redirecionar para onboarding, mesmo se needsOnboarding for true
        if (freelancerOnboardingInfo?.onboardingCompleted === true) {
          // Onboarding já foi completado, ir para dashboard
          navigate('/freelancer-dashboard', { replace: true });
          return;
        }
        
        // Se não tem dados de onboarding OU precisa completar onboarding
        if (!freelancerOnboardingInfo || freelancerOnboardingInfo?.needsOnboarding) {
          // Redirecionar para onboarding
          navigate('/freelancer-onboarding', { replace: true });
          return;
        }

        // Se não está aprovado, mostrar mensagem e redirecionar para página de aguardo
        if (!freelancerOnboardingInfo?.isApproved) {
          // Pode redirecionar para uma página de "aguardando aprovação" ou mostrar mensagem
          // Por enquanto, vamos para o dashboard que vai verificar e mostrar mensagem
          navigate('/freelancer-dashboard', { replace: true });
          return;
        }

        // Aprovado e onboarding completo: ir para dashboard
        navigate('/freelancer-dashboard', { replace: true });
        return;
      }

      // Clínicas (CADMIN ou CMANAGER) têm lógica especial de onboarding
      if (userRole === 'CADMIN' || userRole === 'CMANAGER') {
        // Onboarding de clínica - verificar se precisa criar primeira unidade
        if (onboardingInfo?.shouldCompleteFirstUnit) {
          navigate('/units/create-first', { replace: true });
          return;
        }

        // Verificar status da clínica para determinar se precisa criar unidade
        try {
          const response = await fetch(`${API_BASE_URL}/clinics/${result.user.id}`, {
            headers: {
              Authorization: `Bearer ${result.session.access_token}`,
            },
          });

          if (response.ok) {
            const { clinic } = await response.json();
            if (clinic.status === 'pending_unit') {
              navigate('/units/create-first', { replace: true });
            } else {
              navigate('/clinic-dashboard', { replace: true });
            }
          } else {
            // Se não conseguir verificar, vai para dashboard (pode ser primeira vez)
            navigate('/clinic-dashboard', { replace: true });
          }
        } catch (error) {
          console.error('Erro ao verificar status da clínica:', error);
          // Em caso de erro, vai para dashboard
          navigate('/clinic-dashboard', { replace: true });
        }
        return;
      }

      // Fallback para roles desconhecidas - usar getDashboardPathForRole
      const fallback = getDashboardPathForRole(userRole);
      console.warn('[LoginPage] Role desconhecida, redirecionando para:', fallback);
      navigate(fallback, { replace: true });
    } catch (error: any) {
      console.error('Erro no login:', error);
      
      // Verificar se é erro de email não confirmado
      // O erro pode vir como string na mensagem ou como propriedade error
      const errorMessage = error?.message || error?.error || '';
      if (errorMessage.includes('EMAIL_NOT_CONFIRMED') || errorMessage === 'EMAIL_NOT_CONFIRMED') {
        setEmailForResend(email);
        setShowEmailNotConfirmedModal(true);
        setLoading(false);
        return;
      }
      
      // Melhorar mensagens de erro para credenciais inválidas
      let userFriendlyMessage = '';
      const lowerErrorMessage = errorMessage.toLowerCase();
      
      if (lowerErrorMessage.includes('invalid') || 
          lowerErrorMessage.includes('credencial') ||
          lowerErrorMessage.includes('senha') ||
          lowerErrorMessage.includes('password') ||
          lowerErrorMessage.includes('email') ||
          lowerErrorMessage.includes('user not found') ||
          lowerErrorMessage.includes('incorrect') ||
          lowerErrorMessage.includes('wrong')) {
        userFriendlyMessage = 'Email ou senha incorretos. Verifique suas credenciais e tente novamente.';
      } else if (errorMessage) {
        userFriendlyMessage = errorMessage;
      } else {
        userFriendlyMessage = 'Erro ao fazer login. Tente novamente em instantes.';
      }
      
      // Garantir que o loading seja false antes de mostrar o erro
      setLoading(false);
      
      // Usar setTimeout para garantir que o alerta seja exibido após qualquer re-renderização
      // Isso evita que o alerta desapareça rapidamente devido a re-renderizações do componente
      // Aumentar o timeout para garantir que todas as atualizações de estado sejam concluídas
      setTimeout(() => {
        showError(userFriendlyMessage, 'Erro no login');
      }, 200);
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async (emailToResend: string) => {
    try {
      await resendConfirmationEmail(emailToResend);
      showSuccess('Email de confirmação reenviado! Verifique sua caixa de entrada.');
    } catch (error: any) {
      showError('Erro ao reenviar email: ' + (error.message || 'Tente novamente.'));
      throw error;
    }
  };

  return (
    <>
      <HomeHeader />
      <div className="clinic-signup-container">
        <div className="clinic-signup-content">
          <div className="signup-form-section">
            <h1 className="text-display text-3xl font-bold mb-2 text-neutral-800">
              Bem-vindo de volta
            </h1>
            <p className="text-neutral-600 mb-8">
              Acesse sua conta PetiVet
            </p>

            <form onSubmit={handleLogin} className="space-y-6">
              {/* Campo de email */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mail size={18} color={colors.primary} />
                    <span>Email</span>
                  </div>
                </label>
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  required
                />
              </div>

              {/* Campo de senha */}
              <div style={{ marginTop: '32px' }}>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Lock size={18} color={colors.primary} />
                    <span>Senha</span>
                  </div>
                </label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  placeholder="Digite sua senha"
                  showStrength={false}
                  showRequirements={false}
                />
              </div>

              {/* Botão de entrar */}
              <div style={{ marginTop: '32px' }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px 24px',
                    backgroundColor: loading ? colors.primaryLight : colors.primary,
                    color: colors.surface,
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s',
                    opacity: loading ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!loading)
                      e.currentTarget.style.backgroundColor = colors.primaryDark;
                  }}
                  onMouseLeave={(e) => {
                    if (!loading)
                      e.currentTarget.style.backgroundColor = colors.primary;
                  }}
                >
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </div>
            </form>

            <div className="text-center" style={{ marginTop: '24px' }}>
              <Link
                to="/forgot-password"
                className="text-primary-600 hover:text-primary-700 text-sm transition-colors"
              >
                Esqueci minha senha
              </Link>
            </div>
          </div>

          {/* Lado direito - imagens */}
          <div className="signup-images-section">
            <h2 className="text-display">
              Conectando quem cuida, quem ama e quem precisa.
            </h2>
            <p>
              Acesse sua conta PetiVet para gerenciar suas demandas, visualizar candidaturas e
              encontrar as melhores oportunidades na área veterinária. Conecte-se com profissionais
              qualificados e clínicas de confiança.
            </p>
            <div className="hero-images-right">
              <div style={{ position: 'relative', width: '100%', maxWidth: '320px', height: '320px' }}>
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
                  <img src="/img1.png" alt="Veterinário cuidando de pet" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                    animationDelay: '0.3s',
                  }}
                >
                  <img src="/img2.jpg" alt="Pet feliz" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                    animationDelay: '0.15s',
                  }}
                >
                  <img src="/im3.jpg" alt="Clínica veterinária" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                    animationDelay: '0.5s',
                  }}
                >
                  <img src="/img4.jpg" alt="Profissional veterinário" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                    animationDelay: '0.7s',
                  }}
                >
                  <img src="/img5.jpg" alt="Cuidado animal" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <EmailNotConfirmedModal
        isOpen={showEmailNotConfirmedModal}
        onClose={() => setShowEmailNotConfirmedModal(false)}
        email={emailForResend}
        onResendEmail={handleResendEmail}
      />
    </>
  );
};

export default LoginPage;
