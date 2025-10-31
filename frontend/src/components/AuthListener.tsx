import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';

/**
 * AuthListener - Detecta eventos de autenticação do Supabase e redireciona automaticamente
 * Resolve o problema de confirmação de email não redirecionar corretamente
 */
const AuthListener: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Não interferir se já estamos na página de confirmação de email
    // Deixar EmailConfirmedPage processar sozinha
    if (location.pathname === '/email-confirmed') {
      console.log('📍 Já estamos em /email-confirmed, deixando EmailConfirmedPage processar');
      return;
    }

    // Detectar confirmação de email via hash na URL (apenas se não estamos em /email-confirmed)
    const handleHashChange = () => {
      if (location.pathname === '/email-confirmed') return; // Não navegar se já está na página

      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get('type');
      const accessToken = hashParams.get('access_token');

      // Se é uma confirmação de email
      if (type === 'signup' && accessToken) {
        console.log('✅ Email confirmation detected via hash, redirecionando para /email-confirmed');
        navigate('/email-confirmed');
      }

      // Se é um recovery (reset de senha)
      if (type === 'recovery' && accessToken) {
        console.log('✅ Password recovery detected via hash');
        navigate('/reset-password'); // Você pode criar esta página se necessário
      }
    };

    // Executar ao montar (apenas se não estamos em /email-confirmed)
    handleHashChange();

    // Listener para mudanças no hash
    window.addEventListener('hashchange', handleHashChange);

    // Listener para mudanças de autenticação do Supabase
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔐 Auth event:', event);

      // Não navegar se já estamos em /email-confirmed
      if (location.pathname === '/email-confirmed') {
        return;
      }

      if (event === 'SIGNED_IN') {
        // Se acabou de logar e está na página de confirmação de email
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const type = hashParams.get('type');
        
        if (type === 'signup' && location.pathname !== '/email-confirmed') {
          console.log('✅ Redirecting to email-confirmed page');
          navigate('/email-confirmed');
        }
      }

      if (event === 'PASSWORD_RECOVERY') {
        console.log('✅ Password recovery - redirecting to reset password');
        navigate('/reset-password');
      }
    });

    // Cleanup
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      authListener?.subscription.unsubscribe();
    };
  }, [navigate, location]);

  return null; // Este componente não renderiza nada
};

export default AuthListener;

