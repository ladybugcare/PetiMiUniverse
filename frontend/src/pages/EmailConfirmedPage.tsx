import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { CheckCircle, XCircle, PartyPopper } from 'lucide-react';

const EmailConfirmedPage: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'form' | 'loading' | 'success' | 'error'>('form');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [resending, setResending] = useState<boolean>(false);
  const [showResend, setShowResend] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(0);

  useEffect(() => {
    // Pré-preencher o email a partir do localStorage, se existir
    const pendingEmail = localStorage.getItem('pendingEmail');
    if (pendingEmail) setEmail(pendingEmail);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleSuccess = (session: any) => {
    // Salvar dados do usuário e token no localStorage
    const userData = {
      id: session.user.id,
      email: session.user.email,
      user_metadata: session.user.user_metadata,
      access_token: session.access_token,
      token: session.access_token,
    };
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('isFirstAccess', 'true');
    // Limpar email pendente se existir
    localStorage.removeItem('pendingEmail');

    setStatus('success');
    setTimeout(() => navigate('/units/create-first'), 1500);
  };

  const handleError = (error?: any) => {
    const message = error?.message || error?.toString() || 'Não foi possível confirmar seu e-mail.';
    setErrorMessage(message);
    setStatus('error');
    // Em caso de erro, mostramos a opção de reenviar o código
    setShowResend(true);
  };

  const handleVerify = async () => {
    try {
      setStatus('loading');
      // Validação simples do formato
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Informe um e-mail válido.');
      }
      if (!/^\d{6}$/.test(code)) {
        throw new Error('Código inválido. Use 6 dígitos numéricos.');
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'signup'
      } as any);
      if (error) throw error;

      // O Supabase retorna session em data.session ao verificar com sucesso
      if (data?.session && data.session.user?.email_confirmed_at) {
        handleSuccess(data.session);
        return;
      }

      // Como fallback, tentar obter sessão atual
      const { data: sess } = await supabase.auth.getSession();
      if (sess?.session?.user?.email_confirmed_at) {
        handleSuccess(sess.session);
        return;
      }

      throw new Error('Não foi possível validar a sessão após o código.');
    } catch (err: any) {
      // Mensagens mais amigáveis para expiração/invalid
      if (err?.code === 'otp_expired' || /expired|invalid/i.test(err?.message || '')) {
        handleError(new Error('Código expirado ou inválido. Reenvie um novo código e tente novamente.'));
      } else {
        handleError(err);
      }
    }
  };

  const handleResend = async () => {
    try {
      setResending(true);
      if (!email) throw new Error('Informe seu e-mail para reenviar o código.');
      const { error } = await supabase.auth.resend({ type: 'signup', email } as any);
      if (error) throw error;
      // Ativar cooldown de 60s para evitar corrida de invalidação do código anterior
      setCooldown(60);
      setShowResend(false); // esconder enquanto aguarda novo código
      setErrorMessage('Enviamos um novo código. Aguarde 60 segundos e use o código mais recente.');
      setStatus('error');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Não foi possível reenviar o código.');
      setStatus('error');
    } finally {
      setResending(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {status === 'form' && (
          <>
            <h2 style={styles.title}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span>Confirmar e-mail</span>
              </div>
            </h2>
            <p style={styles.message}>Enviamos um código de 6 dígitos para seu e-mail. Cole abaixo para confirmar e continuar.</p>
            {/* Campo de e-mail oculto para o usuário: só mostramos se não houver pendingEmail */}
            {!email && (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Seu e-mail"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '12px' }}
              />
            )}

            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Código (6 dígitos)"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '16px', letterSpacing: '6px', textAlign: 'center' as const, fontWeight: 700 }}
            />

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleVerify} style={styles.button} disabled={cooldown > 0}>
                {cooldown > 0 ? `Aguarde ${cooldown}s` : 'Confirmar'}
              </button>
              {showResend && (
                <button onClick={handleResend} style={{ ...styles.button, backgroundColor: '#6b7280' }} disabled={resending}>
                  {resending ? 'Reenviando...' : 'Reenviar código'}
                </button>
              )}
            </div>
          </>
        )}

        {status === 'loading' && (
          <>
            <div style={styles.spinner}></div>
            <h2 style={styles.title}>Validando código...</h2>
            <p style={styles.message}>Aguarde um momento.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={styles.successIcon}>
              <CheckCircle size={36} strokeWidth={3} />
            </div>
            <h2 style={styles.title}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span>E-mail confirmado com sucesso!</span>
                <PartyPopper size={28} />
              </div>
            </h2>
            <p style={styles.message}>Redirecionando você para cadastrar sua primeira unidade...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={styles.errorIcon}>
              <XCircle size={36} strokeWidth={3} />
            </div>
            <h2 style={styles.title}>Erro ao confirmar e-mail</h2>
            <p style={styles.message}>{errorMessage}</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setStatus('form')} style={styles.button}>Tentar Novamente</button>
              <button onClick={() => navigate('/login')} style={{ ...styles.button, backgroundColor: '#6b7280' }}>Ir para Login</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    padding: '20px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '48px 32px',
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center' as const,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '16px',
  },
  message: {
    fontSize: '16px',
    color: '#6b7280',
    lineHeight: '1.6',
    marginBottom: '24px',
  },
  spinner: {
    width: '48px',
    height: '48px',
    margin: '0 auto 24px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #7c3aed',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  successIcon: {
    width: '64px',
    height: '64px',
    margin: '0 auto 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    color: '#ffffff',
    borderRadius: '50%',
    fontSize: '36px',
    fontWeight: '700',
  },
  errorIcon: {
    width: '64px',
    height: '64px',
    margin: '0 auto 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    borderRadius: '50%',
    fontSize: '36px',
    fontWeight: '700',
  },
  button: {
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

// Adicionar animação de spinner via CSS global (ou use styled-components)
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default EmailConfirmedPage;

