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

  // Capturar email da URL (?email=...) ou hash (&email=...)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      let emailFromUrl = url.searchParams.get('email');
      if (!emailFromUrl && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        emailFromUrl = hashParams.get('email');
      }
      if (emailFromUrl && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFromUrl)) {
        localStorage.setItem('pendingEmail', emailFromUrl);
        setEmail(emailFromUrl);
      }
    } catch (_) {}
  }, []);

  // Preencher email do localStorage se existir
  useEffect(() => {
    const pendingEmail = localStorage.getItem('pendingEmail');
    if (pendingEmail) setEmail(pendingEmail);
  }, []);

  // cooldown de reenvio
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let authListenerSubscription: { unsubscribe: () => void } | null = null;
    let successHandled = false;

    const handleSuccess = (session: any) => {
      // Evitar processar múltiplas vezes
      if (successHandled) return;
      successHandled = true;

      // Limpar timeout de erro se existir
      if (timeoutId) clearTimeout(timeoutId);
      
      // Desinscrever listener se existir
      if (authListenerSubscription) {
        authListenerSubscription.unsubscribe();
        authListenerSubscription = null;
      }

      // Salvar dados do usuário e token no localStorage
      const userData = {
        id: session.user.id,
        email: session.user.email,
        user_metadata: session.user.user_metadata,
        access_token: session.access_token,
        token: session.access_token,
      };
      localStorage.setItem('user', JSON.stringify(userData));
      
      // Marcar como primeiro acesso
      localStorage.setItem('isFirstAccess', 'true');
      
      setStatus('success');
      
      // Aguardar 2 segundos antes de redirecionar
      timeoutId = setTimeout(() => {
        navigate('/units/create-first');
      }, 2000);
    };

    const handleError = (error?: any) => {
      setErrorMessage(error?.message || 'Não foi possível confirmar seu e-mail.');
      setShowResend(true);
      setStatus('error');
    };

    const processEmailConfirmation = async () => {
      // Verificar se há hash na URL com tokens de confirmação
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');
      const errorParam = hashParams.get('error');
      const error_description = hashParams.get('error_description');

      console.log('🔍 Debug info:', {
        hasHash: !!hash,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        type,
        fullUrl: window.location.href,
        hashOnly: hash.substring(0, 100) + '...'
      });

      // Se link veio com erro (ex.: otp_expired), cair para formulário/OTP
      if (errorParam) {
        handleError(new Error(error_description || errorParam));
        setStatus('form');
        return;
      }

      // Se há tokens no hash, precisamos processá-los manualmente
      if (accessToken && refreshToken && type === 'signup') {
        console.log('🔐 Processing email confirmation hash manually...');
        
        try {
          // Tentar usar setSession para criar a sessão manualmente
          const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (!setSessionError && sessionData?.session?.user) {
            console.log('✅ Session created manually via setSession');
            handleSuccess(sessionData.session);
            return;
          } else if (setSessionError) {
            console.error('❌ Error setting session:', setSessionError);
          }

          // Se setSession não funcionou, tentar aguardar e verificar se Supabase processou automaticamente
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Tentar obter a sessão várias vezes com delay
          for (let i = 0; i < 5; i++) {
            const { data: { session }, error } = await supabase.auth.getSession();
            
            console.log(`🔍 Attempt ${i + 1}/5:`, { hasSession: !!session?.user, error: error?.message });
            
            if (!error && session?.user) {
              console.log('✅ Session found via getSession');
              handleSuccess(session);
              return;
            }
            
            // Se ainda não tem sessão, aguardar mais um pouco
            if (i < 4) {
              await new Promise(resolve => setTimeout(resolve, 800));
            }
          }
        } catch (err) {
          console.error('❌ Error processing hash:', err);
          handleError(err);
        }
      }

      // Se não há hash ou não funcionou, verificar sessão existente
      console.log('🔍 Checking existing session...');
      const { data: { session }, error: getErr } = await supabase.auth.getSession();
      
      if (!getErr && session?.user) {
        console.log('✅ Existing session found');
        handleSuccess(session);
        return;
        } else {
          console.log('⚠️ No existing session:', getErr?.message || 'No error but no session');
        }

      // Se ainda não tem sessão, usar listener de auth state change
      // O listener vai capturar quando o Supabase processar o hash
          console.log('⏳ Setting up auth state listener...');
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('🔐 Auth event on EmailConfirmedPage:', event, session?.user?.email);
          
          if (event === 'SIGNED_IN' && session?.user) {
            handleSuccess(session);
          } else if (event === 'TOKEN_REFRESHED' && session?.user) {
            handleSuccess(session);
          }
        }
      );

      authListenerSubscription = subscription;

      // Timeout de segurança: se após 15 segundos não houve confirmação, dar erro
      timeoutId = setTimeout(async () => {
        if (!successHandled) {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user) {
            console.error('⏱️ Timeout: No session after 15 seconds');
            handleError();
          }
        }
      }, 15000) as any;
    };

     // Processar confirmação de email automaticamente; se falhar, form/OTP
     processEmailConfirmation();

    // Cleanup
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (authListenerSubscription) authListenerSubscription.unsubscribe();
    };
  }, [navigate]);

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
              <button onClick={async () => {
                try {
                  setStatus('loading');
                  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
                  if (!/^\d{6}$/.test(code)) throw new Error('Código inválido. Use 6 dígitos.');
                  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' } as any);
                  if (error) throw error;
                  if (data?.session?.user?.email_confirmed_at) {
                    // salvar e redirecionar
                    const s = data.session;
                    const userData = { id: s.user.id, email: s.user.email, user_metadata: s.user.user_metadata, access_token: s.access_token, token: s.access_token };
                    localStorage.setItem('user', JSON.stringify(userData));
                    localStorage.setItem('isFirstAccess','true');
                    localStorage.removeItem('pendingEmail');
                    setStatus('success');
                    setTimeout(() => navigate('/units/create-first'), 1500);
                    return;
                  }
                  const { data: s } = await supabase.auth.getSession();
                  if (s.session?.user?.email_confirmed_at) {
                    const ss = s.session;
                    const userData = { id: ss.user.id, email: ss.user.email, user_metadata: ss.user.user_metadata, access_token: ss.access_token, token: ss.access_token };
                    localStorage.setItem('user', JSON.stringify(userData));
                    localStorage.setItem('isFirstAccess','true');
                    localStorage.removeItem('pendingEmail');
                    setStatus('success');
                    setTimeout(() => navigate('/units/create-first'), 1500);
                    return;
                  }
                  throw new Error('Não foi possível validar a sessão após o código.');
                } catch (err: any) {
                  if (err?.code === 'otp_expired' || /expired|invalid/i.test(err?.message || '')) {
                    setErrorMessage('Código expirado ou inválido. Reenvie um novo código.');
                  } else {
                    setErrorMessage(err?.message || 'Falha ao confirmar com o código.');
                  }
                  setShowResend(true);
                  setStatus('error');
                }
              }} style={styles.button} disabled={cooldown > 0}>
                {cooldown > 0 ? `Aguarde ${cooldown}s` : 'Confirmar'}
              </button>
              {showResend && (
                <button onClick={async () => {
                  try {
                    setResending(true);
                    if (!email) throw new Error('Informe seu e-mail para reenviar o código.');
                    const { error } = await supabase.auth.resend({ type: 'signup', email } as any);
                    if (error) throw error;
                    setCooldown(60);
                    setShowResend(false);
                    setErrorMessage('Enviamos um novo código. Aguarde 60s e use o mais recente.');
                    setStatus('error');
                  } catch (err: any) {
                    setErrorMessage(err?.message || 'Não foi possível reenviar o código.');
                    setStatus('error');
                  } finally { setResending(false); }
                }} style={{ ...styles.button, backgroundColor: '#6b7280' }} disabled={resending}>
                  {resending ? 'Reenviando...' : 'Reenviar código'}
                </button>
              )}
            </div>
          </>
        )}
        {status === 'loading' && (
          <>
            <div style={styles.spinner}></div>
            <h2 style={styles.title}>Confirmando seu e-mail...</h2>
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
            <p style={styles.message}>
              Redirecionando você para cadastrar sua primeira unidade...
            </p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div style={styles.errorIcon}>
              <XCircle size={36} strokeWidth={3} />
            </div>
            <h2 style={styles.title}>Erro ao confirmar e-mail</h2>
            <p style={styles.message}>{errorMessage || 'Não foi possível confirmar seu e-mail. Você pode tentar novamente ou reenviar o código.'}</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setStatus('form')} style={styles.button}>Tentar novamente</button>
              {showResend && (
                <button onClick={async () => {
                  try {
                    setResending(true);
                    if (!email) throw new Error('Informe seu e-mail para reenviar o código.');
                    const { error } = await supabase.auth.resend({ type: 'signup', email } as any);
                    if (error) throw error;
                    setCooldown(60);
                    setShowResend(false);
                    setErrorMessage('Enviamos um novo código. Aguarde 60s e use o mais recente.');
                  } catch (err: any) {
                    setErrorMessage(err?.message || 'Não foi possível reenviar o código.');
                  } finally { setResending(false); }
                }} style={{ ...styles.button, backgroundColor: '#6b7280' }} disabled={resending}>
                  {resending ? 'Reenviando...' : 'Reenviar código'}
                </button>
              )}
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

