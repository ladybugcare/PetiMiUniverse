import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';

/**
 * AuthListener - Detecta eventos de autenticação do Supabase e redireciona automaticamente
 * Otimizado para reduzir requisições múltiplas com debounce e verificação de estado
 */
const AuthListener: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isProcessingRef = useRef(false);
  const hashProcessedRef = useRef(false);

  useEffect(() => {
    // Não interferir se já estamos na página de confirmação de email
    // Deixar EmailConfirmedPage processar sozinha
    if (location.pathname === '/email-confirmed') {
      console.log('📍 Já estamos em /email-confirmed, deixando EmailConfirmedPage processar');
      return;
    }

    // Detectar confirmação de email via hash na URL (apenas se não estamos em /email-confirmed)
    // Usar debounce para evitar múltiplas execuções
    let hashChangeTimeout: NodeJS.Timeout | null = null;
    
    const handleHashChange = () => {
      // Evitar processar múltiplas vezes
      if (isProcessingRef.current || hashProcessedRef.current) {
        return;
      }

      if (location.pathname === '/email-confirmed') return; // Não navegar se já está na página

      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get('type');
      const accessToken = hashParams.get('access_token');

      // Se é uma confirmação de email
      if (type === 'signup' && accessToken) {
        isProcessingRef.current = true;
        hashProcessedRef.current = true;
        console.log('✅ Email confirmation detected via hash, redirecionando para /email-confirmed');
        navigate('/email-confirmed', { replace: true });
        return;
      }

      // Se é um recovery (reset de senha)
      if (type === 'recovery' && accessToken) {
        isProcessingRef.current = true;
        hashProcessedRef.current = true;
        console.log('✅ Password recovery detected via hash');
        navigate('/reset-password', { replace: true });
        return;
      }
    };

    // Executar ao montar com debounce (apenas se não estamos em /email-confirmed)
    if (window.location.hash && !hashProcessedRef.current) {
      hashChangeTimeout = setTimeout(() => {
        handleHashChange();
      }, 100); // Debounce de 100ms
    }

    // Listener para mudanças no hash (com debounce)
    const debouncedHashChange = () => {
      if (hashChangeTimeout) {
        clearTimeout(hashChangeTimeout);
      }
      hashChangeTimeout = setTimeout(handleHashChange, 100);
    };

    window.addEventListener('hashchange', debouncedHashChange);

    // Listener para mudanças de autenticação do Supabase
    // Usar flag para evitar múltiplas execuções
    let authEventProcessed = false;
    
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      // Evitar processar múltiplas vezes o mesmo evento
      if (authEventProcessed && event === 'SIGNED_IN') {
        return;
      }

      console.log('🔐 Auth event:', event, 'Session:', session ? 'exists' : 'null');

      // Não navegar se já estamos em /email-confirmed
      if (location.pathname === '/email-confirmed') {
        return;
      }

      // Não processar eventos se estamos na página de login (evita interferir com erros de login)
      if (location.pathname === '/login') {
        // Só processar se realmente houver uma sessão válida (login bem-sucedido)
        if (event === 'SIGNED_IN' && session) {
          // Deixar o LoginPage lidar com a navegação após login bem-sucedido
          console.log('🔐 Login bem-sucedido detectado na página de login, deixando LoginPage processar');
          return;
        }
        // Ignorar outros eventos na página de login
        return;
      }

      if (event === 'SIGNED_IN') {
        // Marcar como processado para evitar múltiplas execuções
        authEventProcessed = true;
        
        // Se acabou de logar e está na página de confirmação de email
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const type = hashParams.get('type');
        
        if (type === 'signup' && location.pathname !== '/email-confirmed') {
          console.log('✅ Redirecting to email-confirmed page');
          navigate('/email-confirmed', { replace: true });
        }
        
        // Resetar flag após 2 segundos para permitir novos eventos
        setTimeout(() => {
          authEventProcessed = false;
        }, 2000);
      }

      if (event === 'PASSWORD_RECOVERY') {
        console.log('✅ Password recovery - redirecting to reset password');
        navigate('/reset-password', { replace: true });
      }
    });

    // Cleanup
    return () => {
      if (hashChangeTimeout) {
        clearTimeout(hashChangeTimeout);
      }
      window.removeEventListener('hashchange', debouncedHashChange);
      authListener?.subscription.unsubscribe();
      isProcessingRef.current = false;
      hashProcessedRef.current = false;
    };
  }, [navigate, location.pathname]); // Usar apenas location.pathname para evitar re-execuções desnecessárias

  return null; // Este componente não renderiza nada
};

export default AuthListener;

