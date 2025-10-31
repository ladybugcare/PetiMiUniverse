import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { CheckCircle, XCircle, PartyPopper } from 'lucide-react';

const EmailConfirmedPage: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

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
      console.error('Error confirming email:', error);
      const message = error?.message || error?.toString() || 'Não foi possível confirmar seu e-mail.';
      setErrorMessage(message);
      setStatus('error');
    };

    const processEmailConfirmation = async () => {
      // Verificar se há hash na URL com tokens de confirmação
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');
      const error_description = hashParams.get('error_description');
      const error = hashParams.get('error');

      console.log('🔍 Debug info:', {
        hasHash: !!hash,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        type,
        error,
        error_description,
        fullUrl: window.location.href,
        hashOnly: hash.substring(0, 100) + '...'
      });

      // Se há erro no hash, tratar como erro
      if (error) {
        console.error('❌ Error in hash:', error, error_description);
        handleError(new Error(error_description || error));
        return;
      }

      // Configurar listener PRIMEIRO, antes de qualquer processamento
      // O Supabase processa o hash automaticamente quando chamamos getSession()
      // e dispara eventos de auth state change
      console.log('⏳ Setting up auth state listener first...');
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('🔐 Auth event on EmailConfirmedPage:', event, {
            hasSession: !!session,
            userEmail: session?.user?.email,
            emailConfirmed: session?.user?.email_confirmed_at ? 'yes' : 'no'
          });
          
          if (event === 'SIGNED_IN' && session?.user) {
            // Verificar se o email foi confirmado
            if (session.user.email_confirmed_at) {
              console.log('✅ Email confirmed and user signed in');
              handleSuccess(session);
            } else {
              console.log('⚠️ User signed in but email not confirmed yet');
              // Aguardar um pouco mais - pode estar processando
            }
          } else if (event === 'TOKEN_REFRESHED' && session?.user) {
            if (session.user.email_confirmed_at) {
              console.log('✅ Token refreshed and email confirmed');
              handleSuccess(session);
            }
          } else if (event === 'USER_UPDATED' && session?.user?.email_confirmed_at) {
            console.log('✅ User updated with confirmed email');
            handleSuccess(session);
          }
        }
      );

      authListenerSubscription = subscription;

      // Se há tokens no hash, o Supabase deve processar automaticamente
      // ao chamar getSession(), mas vamos tentar setSession também como fallback
      if (accessToken && refreshToken && type === 'signup') {
        console.log('🔐 Processing email confirmation hash...');
        
        try {
          // PRIMEIRA TENTATIVA: Deixar o Supabase processar automaticamente
          // getSession() internamente chama _getSessionFromURL que processa o hash
          await new Promise(resolve => setTimeout(resolve, 500)); // Pequeno delay para o listener se registrar
          
          const { data: { session: autoSession }, error: autoError } = await supabase.auth.getSession();
          
          if (!autoError && autoSession?.user?.email_confirmed_at) {
            console.log('✅ Session created automatically by Supabase');
            handleSuccess(autoSession);
            return;
          }

          // SEGUNDA TENTATIVA: Usar setSession manualmente
          console.log('🔄 Trying setSession manually...');
          const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (!setSessionError && sessionData?.session?.user) {
            console.log('✅ Session created manually via setSession');
            
            // Verificar se o email foi confirmado
            if (sessionData.session.user.email_confirmed_at) {
              handleSuccess(sessionData.session);
              return;
            } else {
              console.log('⚠️ Session created but email not confirmed yet, waiting...');
            }
          } else if (setSessionError) {
            console.error('❌ Error setting session:', setSessionError);
            
            // Se o erro é de token expirado ou inválido, dar erro imediato
            if (setSessionError.message?.includes('expired') || 
                setSessionError.message?.includes('invalid') ||
                setSessionError.message?.includes('token')) {
              handleError(new Error('Link de confirmação expirado ou inválido. Por favor, solicite um novo email de confirmação.'));
              return;
            }
          }

          // TERCEIRA TENTATIVA: Aguardar eventos de auth state change
          // Já configurado acima, apenas aguardar
          console.log('⏳ Waiting for auth state change events...');
          
        } catch (err: any) {
          console.error('❌ Error processing hash:', err);
          handleError(err);
          return;
        }
      } else {
        // Se não há hash, verificar se já existe sessão
        console.log('🔍 No hash found, checking existing session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!error && session?.user?.email_confirmed_at) {
          console.log('✅ Existing session found with confirmed email');
          handleSuccess(session);
          return;
        } else {
          console.log('⚠️ No existing session or email not confirmed:', {
            hasSession: !!session,
            hasUser: !!session?.user,
            emailConfirmed: session?.user?.email_confirmed_at ? 'yes' : 'no',
            error: error?.message || 'No error but no session'
          });
        }
      }

      // Timeout de segurança: se após 20 segundos não houve confirmação, dar erro
      timeoutId = setTimeout(async () => {
        if (!successHandled) {
          const { data: { session: finalSession } } = await supabase.auth.getSession();
          if (!finalSession?.user?.email_confirmed_at) {
            console.error('⏱️ Timeout: No confirmed session after 20 seconds');
            console.error('Final check:', {
              hasSession: !!finalSession,
              hasUser: !!finalSession?.user,
              emailConfirmed: finalSession?.user?.email_confirmed_at ? 'yes' : 'no',
              hash: window.location.hash.substring(0, 100)
            });
            handleError(new Error('O link de confirmação pode ter expirado. Por favor, faça login ou solicite um novo email de confirmação.'));
          }
        }
      }, 20000) as any;
    };

    // Processar confirmação de email
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
            <p style={styles.message}>
              {errorMessage || 'Não foi possível confirmar seu e-mail. Por favor, tente fazer login.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button 
                onClick={() => navigate('/login')} 
                style={styles.button}
              >
                Ir para Login
              </button>
              <button 
                onClick={() => {
                  // Limpar hash e recarregar a página
                  window.location.hash = '';
                  window.location.reload();
                }}
                style={{ ...styles.button, backgroundColor: '#6b7280' }}
              >
                Tentar Novamente
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

