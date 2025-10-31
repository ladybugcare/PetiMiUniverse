import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login, API_BASE_URL } from '../services/api';
import HomeHeader from '../components/HomeHeader';
import PasswordInput from '../components/PasswordInput';
import { useAlert } from '../hooks/useAlert';
import colors from '../styles/colors';
import { Mail, Lock } from 'lucide-react';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning } = useAlert();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      showWarning('Por favor, preencha todos os campos.');
      return;
    }

    try {
      setLoading(true);
      const result = await login({ email, password });
      
      // Store the session/user data
      localStorage.setItem('user', JSON.stringify(result.user));
      localStorage.setItem('session', JSON.stringify(result.session));
      
      showSuccess('Login realizado com sucesso!');
      console.log('Login result:', result);
      
      // Navigate to role-specific dashboard after successful login
      const userRole = result.user?.user_metadata?.role || result.user?.role;
      if (userRole === 'admin') {
        navigate('/admin-dashboard');
      } else if (userRole === 'clinic') {
        // Check clinic status to redirect appropriately
        try {
          const response = await fetch(`${API_BASE_URL}/clinics/${result.user.id}`, {
            headers: {
              'Authorization': `Bearer ${result.session.access_token}`,
            },
          });
          
          if (response.ok) {
            const { clinic } = await response.json();
            
            if (clinic.status === 'pending_unit') {
              // Clinic needs to create first unit
              navigate('/units/create-first');
            } else {
              // Clinic can access dashboard (pending_approval or active)
              navigate('/clinic-dashboard');
            }
          } else {
            // Default to dashboard if can't fetch status
            navigate('/clinic-dashboard');
          }
        } catch (error) {
          console.error('Error checking clinic status:', error);
          navigate('/clinic-dashboard');
        }
      } else if (userRole === 'vet') {
        navigate('/vet-dashboard');
      } else {
        navigate('/demands'); // fallback
      }
      
    } catch (error: any) {
      // Show the actual error message from the backend
      console.error('Login error:', error);
      showError('Erro no login: ' + (error.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <HomeHeader />
      <div className="clinic-signup-container">
        <div className="clinic-signup-content">
          {/* Coluna Esquerda - Formulário */}
          <div className="signup-form-section">
            <h1 className="text-display text-3xl font-bold mb-2 text-neutral-800">
              Bem-vindo de volta
            </h1>
            <p className="text-neutral-600 mb-8">
              Acesse sua conta PetiVet
            </p>
            
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Email field */}
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
              
              {/* Password field usando PasswordInput */}
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
              
              {/* Botão Entrar */}
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
                    if (!loading) e.currentTarget.style.backgroundColor = colors.primaryDark;
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) e.currentTarget.style.backgroundColor = colors.primary;
                  }}
                >
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </div>
            </form>
            
            {/* Link Esqueci Minha Senha */}
            <div className="text-center" style={{ marginTop: '24px' }}>
              <Link 
                to="/forgot-password" 
                className="text-primary-600 hover:text-primary-700 text-sm transition-colors"
              >
                Esqueci minha senha
              </Link>
            </div>
          </div>
          
          {/* Coluna Direita - Imagens e Texto */}
          <div className="signup-images-section">
            <h2 className="text-display">
              Conectando quem cuida, quem ama e quem precisa.
            </h2>
            <p>
              Acesse sua conta PetiVet para gerenciar suas demandas, visualizar candidaturas e 
              encontrar as melhores oportunidades na área veterinária. Conecte-se com profissionais 
              qualificados e clínicas de confiança.
            </p>
            
            {/* Colagem de imagens */}
            <div className="hero-images-right">
              <div style={{position: 'relative', width: '100%', maxWidth: '320px', height: '320px'}}>
                {/* Imagem 1 - Top Left Large (Golden Retriever) */}
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

                {/* Imagem 2 - Top Right Medium (White puppy) */}
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

                {/* Imagem 3 - Center/Bottom Large (Dog close-up) */}
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

                {/* Imagem 4 - Bottom Left Medium (Vet with dog) */}
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

                {/* Imagem 5 - Bottom Right Small (Fluffy dog) */}
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
    </>
  );
};

export default LoginPage;
