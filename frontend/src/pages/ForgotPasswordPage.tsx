import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabase';
import HomeHeader from '../components/HomeHeader';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      alert('Por favor, preencha seu email.');
      return;
    }

    try {
      setLoading(true);
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        throw error;
      }

      setSuccess(true);
      alert('Email de recuperação enviado! Verifique sua caixa de entrada.');
      
    } catch (error: any) {
      console.error('Password reset error:', error);
      alert('Erro ao enviar email de recuperação: ' + (error.message || 'Tente novamente.'));
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
            {!success ? (
              <>
                <h1 className="text-display text-3xl font-bold mb-2 text-neutral-800">
                  Esqueceu sua senha?
                </h1>
                <p className="text-neutral-600 mb-8">
                  Digite seu email e enviaremos um link para redefinir sua senha
                </p>
                
                <form onSubmit={handleResetPassword} className="space-y-6">
                  {/* Email field */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Email
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
                  
                  {/* Botão Enviar */}
                  <button 
                    type="submit" 
                    disabled={loading}
                    className={`btn btn-primary w-full text-lg ${loading ? 'loading' : ''}`}
                  >
                    {loading ? 'Enviando...' : 'Enviar Link de Recuperação'}
                  </button>
                </form>
                
                {/* Link Voltar para Login */}
                <div className="text-center mt-4">
                  <Link 
                    to="/login" 
                    className="text-primary-600 hover:text-primary-700 text-sm transition-colors"
                  >
                    ← Voltar para Login
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="text-6xl mb-4">✉️</div>
                  <h1 className="text-display text-3xl font-bold mb-2 text-neutral-800">
                    Email Enviado!
                  </h1>
                  <p className="text-neutral-600 mb-8">
                    Enviamos um link de recuperação para <strong>{email}</strong>.
                    Verifique sua caixa de entrada e spam.
                  </p>
                  
                  <Link 
                    to="/login" 
                    className="btn btn-primary w-full text-lg"
                  >
                    Voltar para Login
                  </Link>
                </div>
              </>
            )}
          </div>
          
          {/* Coluna Direita - Imagens e Texto */}
          <div className="signup-images-section">
            <h2 className="text-display">
              Recupere o acesso à sua conta
            </h2>
            <p>
              Não se preocupe! Digite seu email cadastrado e enviaremos um link seguro para 
              redefinir sua senha. Você voltará a acessar sua conta em instantes e poderá 
              continuar gerenciando suas demandas e candidaturas.
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

export default ForgotPasswordPage;

