import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSupabase } from '@petimi/web-core';

/**
 * Redireciona recovery do Supabase Auth para /reset-password quando o hash
 * (ou evento PASSWORD_RECOVERY) chega em outra rota (ex.: Site URL fallback).
 */
const HubAuthListener: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const hashProcessedRef = useRef(false);

  useEffect(() => {
    if (location.pathname === '/reset-password') {
      return;
    }

    const goToReset = () => {
      if (hashProcessedRef.current) return;
      hashProcessedRef.current = true;
      const h = window.location.hash;
      navigate({ pathname: '/reset-password', hash: h || undefined }, { replace: true });
    };

    const tryHashRecovery = () => {
      if (!window.location.hash || hashProcessedRef.current) return;
      const params = new URLSearchParams(window.location.hash.slice(1));
      if (params.get('type') === 'recovery' && params.get('access_token')) {
        goToReset();
      }
    };

    let hashTimeout: ReturnType<typeof setTimeout> | null = null;
    if (window.location.hash) {
      hashTimeout = setTimeout(tryHashRecovery, 100);
    }

    const onHashChange = () => {
      if (hashTimeout) clearTimeout(hashTimeout);
      hashTimeout = setTimeout(tryHashRecovery, 100);
    };
    window.addEventListener('hashchange', onHashChange);

    const supabase = getSupabase();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && location.pathname !== '/reset-password') {
        goToReset();
      }
    });

    return () => {
      if (hashTimeout) clearTimeout(hashTimeout);
      window.removeEventListener('hashchange', onHashChange);
      sub.subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  return null;
};

export default HubAuthListener;
