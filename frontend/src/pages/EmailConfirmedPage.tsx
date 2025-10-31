import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { CheckCircle, XCircle, PartyPopper } from 'lucide-react';

const EmailConfirmedPage: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

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
      setStatus('error');
    };

    const processEmailConfirmation = async () => {
      // Verificar se há hash na URL com tokens de confirmação
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');

      console.log('🔍 Debug info:', {
        hasHash: !!hash,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        type,
        fullUrl: window.location.href,
        hashOnly: hash.substring(0, 100) + '...'
      });

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
        }
      }

      // Se não há hash ou não funcionou, verificar sessão existente
      console.log('🔍 Checking existing session...');
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (!error && session?.user) {
        console.log('✅ Existing session found');
        handleSuccess(session);
        return;
      } else {
        console.log('⚠️ No existing session:', error?.message || 'No error but no session');
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
              Não foi possível confirmar seu e-mail. Por favor, tente fazer login.
            </p>
            <button 
              onClick={() => navigate('/login')} 
              style={styles.button}
            >
              Ir para Login
            </button>
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

