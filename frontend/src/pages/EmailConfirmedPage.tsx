import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { CheckCircle, XCircle, PartyPopper, Sparkles, LogIn, AlertCircle, Mail } from 'lucide-react';
import { getUserRole, getDashboardPathForRole } from '../utils/authHelpers';

const EmailConfirmedPage: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'form' | 'loading' | 'success' | 'error'>('form');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [resending, setResending] = useState<boolean>(false);
  const [showResend, setShowResend] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(0);
  const [emailFromUrl, setEmailFromUrl] = useState<boolean>(false); // Indica se email veio da URL

  // Capturar email da URL (?email=...) ou hash (&email=...) IMEDIATAMENTE
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
        setEmailFromUrl(true); // Email veio da URL, esconder campo
      }
    } catch (_) {}
  }, []);

  // Preencher email do localStorage se existir
  useEffect(() => {
    if (!email) {
      const pendingEmail = localStorage.getItem('pendingEmail');
      if (pendingEmail) {
        setEmail(pendingEmail);
      }
    }
  }, [email]);

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

      // Se temos uma sessão válida com usuário, redirecionar baseado na role
      if (session?.user) {
        const userRole = getUserRole(session.user);
        const dashboardPath = getDashboardPathForRole(userRole);
        
        console.log('[EmailConfirmedPage] Email confirmado, redirecionando para:', dashboardPath, 'role:', userRole);
        
        // Salvar sessão para manter usuário logado após confirmação
        localStorage.setItem('user', JSON.stringify(session.user));
        if (session) {
          localStorage.setItem('session', JSON.stringify(session));
        }
        
        // Redirecionar para dashboard apropriado baseado na role
        // VET vai para /vet-dashboard
        // CLINIC vai para /clinic-dashboard ou /units/create-first se necessário
        if (userRole === 'VET') {
          navigate('/vet-dashboard', { replace: true });
          return;
        }
        
        if (userRole === 'CADMIN' || userRole === 'CMANAGER') {
          // Para clínicas, verificar se precisa criar primeira unidade
          // Por enquanto, redirecionar para dashboard (a lógica de primeira unidade será verificada lá)
          navigate('/clinic-dashboard', { replace: true });
          return;
        }
        
        if (userRole === 'ADMIN') {
          navigate('/admin-dashboard', { replace: true });
          return;
        }
        
        // Fallback: redirecionar para dashboard baseado na role
        navigate(dashboardPath, { replace: true });
        return;
      }
      
      // Se não temos sessão válida, apenas mostrar sucesso e botão de login
      localStorage.removeItem('user');
      localStorage.removeItem('session');
      localStorage.removeItem('isFirstAccess');
      
      setStatus('success');
      // Não redirecionar automaticamente - mostrar botão para login
    };

    const handleError = (error?: any) => {
      setErrorMessage(error?.message || 'Não foi possível confirmar seu e-mail.');
      setShowResend(true);
      setStatus('error');
    };

    const processEmailConfirmation = async () => {
      const url = new URL(window.location.href);
      
      // Log completo da URL recebida
      console.log('🔍 URL completa recebida:', {
        fullUrl: window.location.href,
        search: window.location.search,
        hash: window.location.hash.substring(0, 100) + '...',
      });

      // FLUXO 1: Query string do link direto Supabase (PRIORIDADE MÁXIMA)
      // Link Supabase: ?token=...&type=signup&email=...
      const qsToken = url.searchParams.get('token');
      const qsType = url.searchParams.get('type');
      const qsEmail = url.searchParams.get('email');

      if (qsToken && qsType === 'signup' && qsEmail) {
        console.log('🚀 Processando link direto Supabase (query string)...', {
          hasToken: !!qsToken,
          type: qsType,
          email: qsEmail.substring(0, 20) + '...',
        });

        try {
          setStatus('loading');
          setEmail(qsEmail); // Auto-preencher email
          setEmailFromUrl(true); // Esconder campo

          const { data, error } = await supabase.auth.verifyOtp({
            email: qsEmail,
            type: 'signup',
            token_hash: qsToken, // O 'token' do link é o 'token_hash' para verifyOtp
          } as any);

          if (error) {
            console.error('❌ verifyOtp falhou:', error);
            throw error;
          }

          if (data?.session?.user) {
            console.log('✅ Confirmação via link direto Supabase: SUCESSO');
            handleSuccess(data.session);
            // Limpar query após processar
            window.history.replaceState({}, document.title, url.origin + url.pathname);
            return;
          }

          // Se não retornou sessão, tentar captar via getSession
          const { data: s } = await supabase.auth.getSession();
          if (s.session?.user) {
            console.log('✅ Sessão encontrada após verifyOtp via getSession');
            handleSuccess(s.session);
            window.history.replaceState({}, document.title, url.origin + url.pathname);
            return;
          }

          throw new Error('Não foi possível confirmar com o link. Tente com o código ou reenvie.');
        } catch (err: any) {
          console.error('❌ Erro no fluxo de link direto Supabase:', err);
          handleError(err);
          setStatus('form');
          return;
        }
      }

      // FLUXO 2: token_hash na query (fallback)
      const qsTokenHash = url.searchParams.get('token_hash');
      if (qsTokenHash && (qsType === 'signup' || qsType === 'magiclink' || qsType === 'email')) {
        console.log('🔄 Processando token_hash na query (fallback)...');
        try {
          setStatus('loading');
          const targetEmail = qsEmail || url.searchParams.get('email') || localStorage.getItem('pendingEmail') || email || '';
          if (!targetEmail) {
            throw new Error('E-mail não encontrado na URL. Abra o link mais recente ou use o código.');
          }
          setEmail(targetEmail);
          setEmailFromUrl(true);

          const verifyType = (qsType === 'signup' ? 'signup' : 'email') as any;
          const { data, error } = await supabase.auth.verifyOtp({
            email: targetEmail,
            type: verifyType,
            token_hash: qsTokenHash,
          } as any);

          if (error) throw error;
          if (data?.session?.user) {
            console.log('✅ Confirmação via token_hash: SUCESSO');
            handleSuccess(data.session);
            window.history.replaceState({}, document.title, url.origin + url.pathname);
            return;
          }

          const { data: s } = await supabase.auth.getSession();
          if (s.session?.user) {
            console.log('✅ Sessão encontrada após verifyOtp via getSession');
            handleSuccess(s.session);
            window.history.replaceState({}, document.title, url.origin + url.pathname);
            return;
          }

          throw new Error('Não foi possível confirmar com o link. Tente com o código ou reenvie.');
        } catch (err: any) {
          console.error('❌ verifyOtp via token_hash falhou:', err);
          handleError(err);
          setStatus('form');
          return;
        }
      }

      // FLUXO 3: Verificar hash na URL (access_token/refresh_token)
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');
      const errorParam = hashParams.get('error');
      const error_description = hashParams.get('error_description');

      console.log('🔍 Verificando hash na URL:', {
        hasHash: !!hash,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        type,
      });

      // Se link veio com erro (ex.: otp_expired), mostrar tela de erro
      if (errorParam) {
        console.error('❌ Erro no hash:', errorParam, error_description);
        
        // Capturar email do hash se disponível para permitir reenvio
        const emailFromHash = hashParams.get('email');
        if (emailFromHash && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFromHash)) {
          setEmail(emailFromHash);
          setEmailFromUrl(true);
          localStorage.setItem('pendingEmail', emailFromHash);
        }
        
        // Criar mensagem específica baseada no tipo de erro
        let errorMsg = error_description || errorParam;
        const errorCode = hashParams.get('error_code');
        
        if (errorCode === 'otp_expired' || errorParam === 'access_denied') {
          if (error_description?.includes('expired') || error_description?.includes('expirado')) {
            errorMsg = 'Este link de confirmação expirou ou já foi utilizado. Reenvie um novo link ou use o código de 6 dígitos.';
          } else if (error_description?.includes('invalid')) {
            errorMsg = 'Este link de confirmação é inválido ou já foi usado. Reenvie um novo link ou use o código.';
          } else {
            errorMsg = 'Não foi possível confirmar seu e-mail com este link. O link pode ter expirado ou já ter sido utilizado.';
          }
        }
        
        setErrorMessage(errorMsg);
        setShowResend(true); // Mostrar botão de reenviar
        setStatus('error');
        return;
      }

      // FLUXO 3: Processar tokens no hash (access_token/refresh_token)
      if (accessToken && refreshToken && type === 'signup') {
        console.log('🔐 Processando tokens no hash (access_token/refresh_token)...');
        
        try {
          setStatus('loading');
          
          // Tentar usar setSession para criar a sessão manualmente
          const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (!setSessionError && sessionData?.session?.user) {
            console.log('✅ Sessão criada via setSession do hash');
            handleSuccess(sessionData.session);
            return;
          } else if (setSessionError) {
            console.error('❌ Erro ao criar sessão via setSession:', setSessionError);
          }

          // Se setSession não funcionou, tentar aguardar e verificar se Supabase processou automaticamente
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Tentar obter a sessão várias vezes com delay
          for (let i = 0; i < 5; i++) {
            const { data: { session }, error } = await supabase.auth.getSession();
            
            console.log(`🔍 Tentativa ${i + 1}/5:`, { hasSession: !!session?.user, error: error?.message });
            
            if (!error && session?.user) {
              console.log('✅ Sessão encontrada via getSession após processar hash');
              handleSuccess(session);
              return;
            }
            
            // Se ainda não tem sessão, aguardar mais um pouco
            if (i < 4) {
              await new Promise(resolve => setTimeout(resolve, 800));
            }
          }

          console.warn('⚠️ Não foi possível criar sessão via hash após 5 tentativas');
        } catch (err) {
          console.error('❌ Erro ao processar hash:', err);
          handleError(err);
        }
      }

      // FLUXO 4: Verificar sessão existente
      console.log('🔍 Verificando sessão existente...');
      const { data: { session }, error: getErr } = await supabase.auth.getSession();
      
      if (!getErr && session?.user) {
        console.log('✅ Sessão existente encontrada');
        handleSuccess(session);
        return;
      } else {
        console.log('⚠️ Nenhuma sessão existente:', getErr?.message || 'Sem erro mas sem sessão');
      }

      // FLUXO 5: Usar listener de auth state change como último recurso
      // O listener vai capturar quando o Supabase processar automaticamente
      console.log('⏳ Configurando listener de auth state change (último recurso)...');
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('🔐 Auth event no EmailConfirmedPage:', event, session?.user?.email);
          
          if (event === 'SIGNED_IN' && session?.user) {
            console.log('✅ Evento SIGNED_IN detectado via listener');
            handleSuccess(session);
          } else if (event === 'TOKEN_REFRESHED' && session?.user) {
            console.log('✅ Evento TOKEN_REFRESHED detectado via listener');
            handleSuccess(session);
          }
        }
      );

      authListenerSubscription = subscription;

      // Timeout aumentado: se após 30 segundos não houve confirmação, mostrar formulário
      timeoutId = setTimeout(async () => {
        if (!successHandled) {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user) {
            console.warn('⏱️ Timeout: Nenhuma sessão após 30 segundos. Mostrando formulário manual.');
            setStatus('form');
            // Não chamar handleError aqui, apenas mostrar formulário
          }
        }
      }, 30000) as any; // Aumentado de 15s para 30s
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
            {email && emailFromUrl ? (
              <div style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '8px', 
                border: '1px solid #e5e7eb', 
                marginBottom: '12px',
                backgroundColor: '#f9fafb',
                color: '#6b7280',
                fontSize: '14px'
              }}>
                <strong>E-mail:</strong> {email}
              </div>
            ) : (
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
                    // Email confirmado - limpar sessão e mostrar botão de login
                    localStorage.removeItem('user');
                    localStorage.removeItem('session');
                    localStorage.removeItem('isFirstAccess');
                    localStorage.removeItem('pendingEmail');
                    setStatus('success');
                    return;
                  }
                  const { data: s } = await supabase.auth.getSession();
                  if (s.session?.user?.email_confirmed_at) {
                    // Email confirmado - limpar sessão e mostrar botão de login
                    localStorage.removeItem('user');
                    localStorage.removeItem('session');
                    localStorage.removeItem('isFirstAccess');
                    localStorage.removeItem('pendingEmail');
                    setStatus('success');
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
            {/* Logo PetiVet */}
            <div style={styles.logoContainer}>
              <img 
                src="/purple_logo.png" 
                alt="PetiVet" 
                style={styles.logo}
              />
            </div>

            {/* Ícone de sucesso com animação */}
            <div style={styles.successIcon}>
              <CheckCircle size={64} strokeWidth={3} />
              <div style={styles.sparkles}>
                <Sparkles size={24} style={{ position: 'absolute', top: '-10px', right: '-10px' }} />
                <Sparkles size={20} style={{ position: 'absolute', bottom: '-8px', left: '-8px' }} />
              </div>
            </div>

            <h2 style={styles.title}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span>E-mail confirmado com sucesso!</span>
                <PartyPopper size={32} style={{ color: '#7c3aed' }} />
              </div>
            </h2>

            <p style={styles.successMessage}>
              Seu e-mail foi confirmado com sucesso! 🎉<br />
              Faça login para acessar o ecossistema PetiVet e começar a gerenciar sua clínica ou perfil veterinário.
            </p>

            {/* Botão Fazer login estilizado */}
            <button 
              onClick={() => navigate('/login')} 
              style={styles.loginButton}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#6d28d9';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 24px rgba(124, 58, 237, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#7c3aed';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(124, 58, 237, 0.3)';
              }}
            >
              <LogIn size={20} style={{ marginRight: '8px' }} />
              Fazer login
            </button>
          </>
        )}
        
        {status === 'error' && (
          <>
            {/* Logo PetiVet */}
            <div style={styles.logoContainer}>
              <img 
                src="/purple_logo.png" 
                alt="PetiVet" 
                style={styles.logo}
              />
            </div>

            {/* Ícone de erro */}
            <div style={styles.errorIcon}>
              <AlertCircle size={64} strokeWidth={3} />
            </div>

            <h2 style={styles.title}>Não foi possível confirmar seu e-mail</h2>
            <p style={styles.errorMessage}>
              {errorMessage || 'O link de confirmação pode ter expirado ou já ter sido utilizado. Você pode reenviar um novo link ou usar o código de 6 dígitos que enviamos para seu e-mail.'}
            </p>

            {/* Email se disponível */}
            {email && (
              <div style={styles.emailInfo}>
                <Mail size={18} style={{ marginRight: '8px', color: '#6b7280' }} />
                <span style={{ color: '#6b7280', fontSize: '15px' }}>{email}</span>
              </div>
            )}

            {/* Botões de ação */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', width: '100%', marginTop: '24px' }}>
              {/* Reenviar link de confirmação */}
              {showResend && email && (
                <button 
                  onClick={async () => {
                    try {
                      setResending(true);
                      const { error } = await supabase.auth.resend({ type: 'signup', email } as any);
                      if (error) throw error;
                      setCooldown(60);
                      setErrorMessage('Enviamos um novo link de confirmação para seu e-mail! Verifique sua caixa de entrada e use o link mais recente.');
                    } catch (err: any) {
                      setErrorMessage(err?.message || 'Não foi possível reenviar o link. Verifique se o e-mail está correto.');
                    } finally { 
                      setResending(false); 
                    }
                  }} 
                  style={styles.resendButton}
                  disabled={resending || cooldown > 0}
                  onMouseEnter={(e) => {
                    if (!resending && cooldown === 0) {
                      e.currentTarget.style.backgroundColor = '#f59e0b';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!resending && cooldown === 0) {
                      e.currentTarget.style.backgroundColor = '#f97316';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <Mail size={18} style={{ marginRight: '8px' }} />
                  {cooldown > 0 ? `Aguarde ${cooldown}s` : resending ? 'Reenviando...' : 'Reenviar link de confirmação'}
                </button>
              )}

              {/* Tentar com código */}
              <button 
                onClick={() => setStatus('form')} 
                style={styles.secondaryButton}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#6b7280';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#4b5563';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Tentar com código de 6 dígitos
              </button>

              {/* Reenviar email */}
              <button 
                onClick={async () => {
                  try {
                    setResending(true);
                    // Tentar usar email do state, senão do localStorage
                    const emailToUse = email || localStorage.getItem('pendingEmail') || '';
                    if (!emailToUse) {
                      throw new Error('E-mail não encontrado. Por favor, tente com o código de 6 dígitos.');
                    }
                    const { error } = await supabase.auth.resend({ type: 'signup', email: emailToUse } as any);
                    if (error) throw error;
                    setCooldown(60);
                    setErrorMessage('✅ Enviamos um novo link de confirmação para seu e-mail! Após receber, clique no link do email para confirmar. Esta página não funcionará após o reenvio - use o link do email.');
                  } catch (err: any) {
                    setErrorMessage(err?.message || 'Não foi possível reenviar o email. Verifique se o e-mail está correto.');
                  } finally { 
                    setResending(false); 
                  }
                }} 
                style={styles.resendEmailButton}
                disabled={resending || cooldown > 0}
                title="Após receber o email, clique no link do email para confirmar sua conta. Esta página ficará inativa após o reenvio."
                onMouseEnter={(e) => {
                  if (!resending && cooldown === 0) {
                    e.currentTarget.style.backgroundColor = '#7c3aed';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!resending && cooldown === 0) {
                    e.currentTarget.style.backgroundColor = '#6b7280';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                <Mail size={18} style={{ marginRight: '8px' }} />
                {cooldown > 0 ? `Aguarde ${cooldown}s` : resending ? 'Reenviando...' : 'Reenviar email'}
              </button>
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
    maxWidth: '520px',
    width: '100%',
    textAlign: 'center' as const,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
  },
  logoContainer: {
    marginBottom: '32px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    height: '60px',
    width: 'auto',
    maxWidth: '100%',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '16px',
    lineHeight: '1.3',
  },
  message: {
    fontSize: '16px',
    color: '#6b7280',
    lineHeight: '1.6',
    marginBottom: '24px',
  },
  successMessage: {
    fontSize: '17px',
    color: '#4b5563',
    lineHeight: '1.7',
    marginBottom: '32px',
    fontWeight: '400',
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
    width: '80px',
    height: '80px',
    margin: '0 auto 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d1fae5',
    color: '#10b981',
    borderRadius: '50%',
    position: 'relative' as const,
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
  },
  sparkles: {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
    pointerEvents: 'none' as const,
  },
  loginButton: {
    padding: '16px 32px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease-in-out',
    boxShadow: '0 8px 16px rgba(124, 58, 237, 0.3)',
    minWidth: '200px',
    marginTop: '8px',
  },
  errorIcon: {
    width: '80px',
    height: '80px',
    margin: '0 auto 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    borderRadius: '50%',
    position: 'relative' as const,
    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.2)',
  },
  errorMessage: {
    fontSize: '16px',
    color: '#6b7280',
    lineHeight: '1.7',
    marginBottom: '24px',
    fontWeight: '400',
  },
  emailInfo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    marginBottom: '16px',
    width: '100%',
    maxWidth: '400px',
    margin: '0 auto 16px',
  },
  resendButton: {
    padding: '16px 32px',
    backgroundColor: '#f97316',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '17px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease-in-out',
    boxShadow: '0 8px 16px rgba(249, 115, 22, 0.3)',
    minWidth: '280px',
    width: '100%',
    maxWidth: '400px',
  },
  secondaryButton: {
    padding: '14px 28px',
    backgroundColor: '#4b5563',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease-in-out',
    minWidth: '280px',
    width: '100%',
    maxWidth: '400px',
  },
  resendEmailButton: {
    padding: '14px 28px',
    backgroundColor: '#6b7280',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease-in-out',
    minWidth: '280px',
    width: '100%',
    maxWidth: '400px',
    position: 'relative' as const,
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

