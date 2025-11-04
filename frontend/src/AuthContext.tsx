import { useNavigate } from "react-router-dom";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { Role, getUserRole } from './utils/authHelpers';

type AuthContextType = {
  user: any | null;
  session: any | null;
  role: Role;
  loading: boolean;
  /** usado após login: salva em localStorage + atualiza estado */
  setAuthFromLogin: (result: any) => void;
  /** logout global: limpa localStorage + estado */
  logout: () => Promise<void>;
  /** estado que indica se logout está em andamento */
  isLoggingOut: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: 'UNKNOWN',
  loading: true,
  setAuthFromLogin: () => {},
  logout: async () => {},
  isLoggingOut: false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [role, setRole] = useState<Role>('UNKNOWN');
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();

  /** 🔹 Carrega dados do localStorage ao iniciar o app */
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      const storedSession = localStorage.getItem('session');

      const parsedUser = storedUser ? JSON.parse(storedUser) : null;
      const parsedSession = storedSession ? JSON.parse(storedSession) : null;

      setUser(parsedUser);
      setSession(parsedSession);
      setRole(getUserRole(parsedUser));
    } catch (err) {
      console.error('[AuthContext] Erro ao ler localStorage:', err);
      setUser(null);
      setSession(null);
      setRole('UNKNOWN');
    } finally {
      setLoading(false);
    }
  }, []);

  /** 🔹 Chamada pelo LoginPage após login bem sucedido */
  const setAuthFromLogin = (result: any) => {
    const nextUser = result?.user || null;
    const nextSession = result?.session || null;
    const onboardingInfo = result?.onboarding || null;
    const clinicUserInfo = result?.clinicUser || null;

    // Persistência no localStorage
    if (nextUser) localStorage.setItem('user', JSON.stringify(nextUser));
    else localStorage.removeItem('user');

    if (nextSession) localStorage.setItem('session', JSON.stringify(nextSession));
    else localStorage.removeItem('session');

    if (onboardingInfo) {
      localStorage.setItem('clinicOnboarding', JSON.stringify(onboardingInfo));
      onboardingInfo.isFirstLogin
        ? localStorage.setItem('isFirstAccess', 'true')
        : localStorage.removeItem('isFirstAccess');
    } else {
      localStorage.removeItem('clinicOnboarding');
      localStorage.removeItem('isFirstAccess');
    }

    if (clinicUserInfo) localStorage.setItem('clinic_user', JSON.stringify(clinicUserInfo));
    else localStorage.removeItem('clinic_user');

    // Atualiza estado global
    setUser(nextUser);
    setSession(nextSession);
    setRole(getUserRole(nextUser));
  };

  /** 🔹 Logout seguro: bloqueia múltiplos cliques e redireciona */
  const logout = async () => {
    if (isLoggingOut) return; // evita múltiplos cliques
    setIsLoggingOut(true);

    try {
      // (Opcional) Se usar Supabase: await supabase.auth.signOut();

      // Limpa localStorage
      localStorage.removeItem('user');
      localStorage.removeItem('session');
      localStorage.removeItem('clinicOnboarding');
      localStorage.removeItem('clinic_user');
      localStorage.removeItem('isFirstAccess');

      // Reseta estados globais
      setUser(null);
      setSession(null);
      setRole('UNKNOWN');

      // Redireciona após logout
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('[Logout] Erro ao encerrar sessão:', err);
    } finally {
      // Desbloqueia o botão após breve delay (previne flood)
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
