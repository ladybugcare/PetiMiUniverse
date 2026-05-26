import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { getSupabase } from './supabase';
import { getUserRole } from './authHelpers';
import type { AppRole } from './types';
import { CLINIC_STORAGE_UPDATED_EVENT } from './constants/appEvents';

export type AuthContextType = {
  user: unknown | null;
  session: unknown | null;
  role: AppRole;
  loading: boolean;
  setAuthFromLogin: (result: unknown) => Promise<void>;
  logout: () => Promise<void>;
  isLoggingOut: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: 'UNKNOWN',
  loading: true,
  setAuthFromLogin: async () => {},
  logout: async () => {},
  isLoggingOut: false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const supabase = getSupabase();
  const [user, setUser] = useState<unknown | null>(null);
  const [session, setSession] = useState<unknown | null>(null);
  const [role, setRole] = useState<AppRole>('UNKNOWN');
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();

        if (data.session) {
          setSession(data.session);
          setUser(data.session.user);
          setRole(getUserRole(data.session.user));
        } else {
          setSession(null);
          setUser(null);
          setRole('UNKNOWN');
        }
      } catch (err) {
        console.error('[web-core AuthContext] Erro ao carregar sessão:', err);
        setSession(null);
        setUser(null);
        setRole('UNKNOWN');
      } finally {
        setLoading(false);
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) {
        setSession(nextSession);
        setUser(nextSession.user);
        setRole(getUserRole(nextSession.user));
      } else {
        setSession(null);
        setUser(null);
        setRole('UNKNOWN');
      }
    });

    void initAuth();

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const setAuthFromLogin = async (result: unknown) => {
    try {
      const r = result as Record<string, unknown>;
      const nextUser = (r?.user as unknown) || null;
      const nextSession = (r?.session as unknown) || null;
      const onboardingInfo = (r?.onboarding as Record<string, unknown>) || null;
      const clinicUserInfo = r?.clinicUser || null;

      if (nextUser) localStorage.setItem('user', JSON.stringify(nextUser));
      else localStorage.removeItem('user');

      if (onboardingInfo) {
        localStorage.setItem('clinicOnboarding', JSON.stringify(onboardingInfo));
        onboardingInfo.isFirstLogin
          ? localStorage.setItem('isFirstAccess', 'true')
          : localStorage.removeItem('isFirstAccess');
      } else {
        localStorage.removeItem('clinicOnboarding');
        localStorage.removeItem('isFirstAccess');
      }

      if (clinicUserInfo)
        localStorage.setItem('clinic_user', JSON.stringify(clinicUserInfo));
      else localStorage.removeItem('clinic_user');

      if (nextSession) {
        await supabase.auth.setSession(nextSession as { access_token: string; refresh_token: string });
      }

      if (nextSession) localStorage.setItem('session', JSON.stringify(nextSession));
      else localStorage.removeItem('session');

      const vetOnboardingInfo = r?.vetOnboarding || null;
      if (vetOnboardingInfo) {
        localStorage.setItem('vetOnboarding', JSON.stringify(vetOnboardingInfo));
      } else {
        localStorage.removeItem('vetOnboarding');
      }

      const freelancerOnboardingInfo = r?.freelancerOnboarding || null;
      if (freelancerOnboardingInfo) {
        localStorage.setItem('freelancerOnboarding', JSON.stringify(freelancerOnboardingInfo));
      } else {
        localStorage.removeItem('freelancerOnboarding');
      }

      setUser(nextUser);
      setSession(nextSession);
      setRole(getUserRole(nextUser));
      window.dispatchEvent(new Event(CLINIC_STORAGE_UPDATED_EVENT));
    } catch (err) {
      console.error('[web-core AuthContext] Erro ao definir sessão:', err);
    }
  };

  const redirectToLogin = () => {
    if (typeof window !== 'undefined') {
      window.location.replace('/login');
    }
  };

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });

      if (signOutError) {
        console.error('[web-core Logout] Erro ao fazer signOut do Supabase:', signOutError);
      }

      localStorage.removeItem('user');
      localStorage.removeItem('session');
      localStorage.removeItem('clinicOnboarding');
      localStorage.removeItem('clinic_user');
      localStorage.removeItem('isFirstAccess');
      localStorage.removeItem('pendingEmail');

      window.dispatchEvent(new Event(CLINIC_STORAGE_UPDATED_EVENT));

      setUser(null);
      setSession(null);
      setRole('UNKNOWN');

      try {
        const {
          data: { session: remainingSession },
        } = await supabase.auth.getSession();
        if (remainingSession) {
          console.warn('[web-core Logout] Ainda há sessão após signOut, tentando limpar novamente...');
          await supabase.auth.signOut({ scope: 'global' });
        }
      } catch (checkError) {
        console.warn('[web-core Logout] Erro ao verificar sessão restante:', checkError);
      }

      redirectToLogin();
    } catch (err) {
      console.error('[web-core Logout] Erro ao encerrar sessão:', err);
      setUser(null);
      setSession(null);
      setRole('UNKNOWN');
      redirectToLogin();
    } finally {
      setTimeout(() => setIsLoggingOut(false), 800);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        loading,
        setAuthFromLogin,
        logout,
        isLoggingOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
