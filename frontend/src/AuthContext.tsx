import { useNavigate } from "react-router-dom";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { Role, getUserRole } from "./utils/authHelpers";
import { supabase } from "./services/supabase";

type AuthContextType = {
  user: any | null;
  session: any | null;
  role: Role;
  loading: boolean;
  setAuthFromLogin: (result: any) => Promise<void>;
  logout: () => Promise<void>;
  isLoggingOut: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: "UNKNOWN",
  loading: true,
  setAuthFromLogin: async () => {},
  logout: async () => {},
  isLoggingOut: false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [role, setRole] = useState<Role>("UNKNOWN");
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();

  /**
   * 🔹 Inicializa listener de sessão e restaura sessão salva no Supabase
   */
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
          setRole("UNKNOWN");
        }
      } catch (err) {
        console.error("[AuthContext] Erro ao carregar sessão:", err);
        setSession(null);
        setUser(null);
        setRole("UNKNOWN");
      } finally {
        setLoading(false);
      }
    };

    // Listener para login/logout automáticos
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          setSession(session);
          setUser(session.user);
          setRole(getUserRole(session.user));
        } else {
          setSession(null);
          setUser(null);
          setRole("UNKNOWN");
        }
      }
    );

    initAuth();

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  /**
   * 🔹 Chamado após login bem-sucedido
   */
  const setAuthFromLogin = async (result: any) => {
    try {
      const nextUser = result?.user || null;
      const nextSession = result?.session || null;
      const onboardingInfo = result?.onboarding || null;
      const clinicUserInfo = result?.clinicUser || null;

      if (nextSession) {
        // 🔸 Define sessão no Supabase (garante persistência em staging/prod)
        await supabase.auth.setSession(nextSession);
      }

      // Persistência local (opcional, útil pra dados extras)
      if (nextUser) localStorage.setItem("user", JSON.stringify(nextUser));
      else localStorage.removeItem("user");

      if (nextSession)
        localStorage.setItem("session", JSON.stringify(nextSession));
      else localStorage.removeItem("session");

      if (onboardingInfo) {
        localStorage.setItem(
          "clinicOnboarding",
          JSON.stringify(onboardingInfo)
        );
        onboardingInfo.isFirstLogin
          ? localStorage.setItem("isFirstAccess", "true")
          : localStorage.removeItem("isFirstAccess");
      } else {
        localStorage.removeItem("clinicOnboarding");
        localStorage.removeItem("isFirstAccess");
      }

      if (clinicUserInfo)
        localStorage.setItem("clinic_user", JSON.stringify(clinicUserInfo));
      else localStorage.removeItem("clinic_user");

      // Atualiza estados globais
      setUser(nextUser);
      setSession(nextSession);
      setRole(getUserRole(nextUser));
    } catch (err) {
      console.error("[AuthContext] Erro ao definir sessão:", err);
    }
  };

  /**
   * 🔹 Logout global
   */
  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await supabase.auth.signOut();

      // Limpa tudo
      localStorage.removeItem("user");
      localStorage.removeItem("session");
      localStorage.removeItem("clinicOnboarding");
      localStorage.removeItem("clinic_user");
      localStorage.removeItem("isFirstAccess");

      setUser(null);
      setSession(null);
      setRole("UNKNOWN");

      navigate("/login", { replace: true });
    } catch (err) {
      console.error("[Logout] Erro ao encerrar sessão:", err);
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
