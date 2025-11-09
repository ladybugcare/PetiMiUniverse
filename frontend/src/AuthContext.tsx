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

      // Salvar informações de onboarding do vet
      const vetOnboardingInfo = result?.vetOnboarding || null;
      if (vetOnboardingInfo) {
        localStorage.setItem("vetOnboarding", JSON.stringify(vetOnboardingInfo));
      } else {
        localStorage.removeItem("vetOnboarding");
      }

      // Salvar informações de onboarding do freelancer
      const freelancerOnboardingInfo = result?.freelancerOnboarding || null;
      if (freelancerOnboardingInfo) {
        localStorage.setItem("freelancerOnboarding", JSON.stringify(freelancerOnboardingInfo));
      } else {
        localStorage.removeItem("freelancerOnboarding");
      }

      // Atualiza estados globais
      setUser(nextUser);
      setSession(nextSession);
      setRole(getUserRole(nextUser));
    } catch (err) {
      console.error("[AuthContext] Erro ao definir sessão:", err);
    }
  };

  /**
   * 🔹 Logout global - limpa sessão em todos os dispositivos e redireciona para login
   */
  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      // Limpar sessão do Supabase em todos os dispositivos (scope: 'global')
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      
      if (signOutError) {
        console.error("[Logout] Erro ao fazer signOut do Supabase:", signOutError);
        // Continuar com limpeza local mesmo se houver erro
      }

      // Limpar todos os itens do localStorage relacionados a autenticação
      localStorage.removeItem("user");
      localStorage.removeItem("session");
      localStorage.removeItem("clinicOnboarding");
      localStorage.removeItem("clinic_user");
      localStorage.removeItem("isFirstAccess");
      localStorage.removeItem("pendingEmail");
      
      // Limpar cookies de sessão se existirem (alguns navegadores podem usar cookies)
      // Nota: Não podemos limpar cookies diretamente, mas o signOut do Supabase deve fazer isso

      // Atualizar estados locais
      setUser(null);
      setSession(null);
      setRole("UNKNOWN");

      // Verificar se a sessão foi realmente limpa antes de redirecionar
      try {
        const { data: { session: remainingSession } } = await supabase.auth.getSession();
        if (remainingSession) {
          console.warn("[Logout] Ainda há sessão após signOut, tentando limpar novamente...");
          // Tentar limpar novamente
          await supabase.auth.signOut({ scope: 'global' });
        }
      } catch (checkError) {
        console.warn("[Logout] Erro ao verificar sessão restante:", checkError);
        // Continuar mesmo se houver erro na verificação
      }

      // Redirecionar para login (usar replace: true para evitar voltar com botão voltar)
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("[Logout] Erro ao encerrar sessão:", err);
      // Mesmo com erro, limpar estados locais e redirecionar
      setUser(null);
      setSession(null);
      setRole("UNKNOWN");
      navigate("/login", { replace: true });
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
