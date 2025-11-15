import { Platform } from 'react-native';
import { supabase } from './supabase';
import { handleInvalidToken } from '../utils/envGuard';

// 🌎 Detecta o ambiente automaticamente
const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://localhost:3000';

console.log('🌎 API_BASE_URL em uso:', API_BASE_URL);

// ====================================================// 🧠 Funções utilitárias
// ====================================================
const getStorageItem = (key: string): string | null => {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
};

// ====================================================// 🔐 Tipos base de autenticação
// ====================================================
interface SignUpData {
  role: 'vet' | 'clinic';
  name: string;
  email: string;
  password: string;
}

interface LoginData {
  email: string;
  password: string;
}

// ====================================================// 🚀 Função base de requisições HTTP
// ====================================================
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  let authToken: string | null = null;

  // 🪄 Sempre buscar token fresco do Supabase (renova automaticamente se necessário)
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Erro ao obter sessão do Supabase:', sessionError);
    }
    
    // Se a sessão existe mas o token pode estar expirado, tentar renovar
    if (session) {
      authToken = session.access_token;
      
      // Verificar se o token está expirado ou próximo de expirar
      const expiresAt = session.expires_at;
      if (expiresAt) {
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = expiresAt - now;
        // Renovar se expirado ou se faltar menos de 5 minutos
        if (expiresIn <= 300) {
          console.log('Token expirado ou próximo de expirar, renovando...', { expiresIn, expired: expiresIn <= 0 });
          try {
            const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshedSession) {
              authToken = refreshedSession.access_token;
              console.log('Token renovado com sucesso');
            } else {
              console.warn('Erro ao renovar token:', refreshError);
              // Se não conseguir renovar e o token estiver expirado, limpar sessão
              if (expiresIn <= 0 || refreshError?.message?.includes('expired') || refreshError?.message?.includes('invalid') || refreshError?.message?.includes('JWT')) {
                console.warn('Token expirado e não foi possível renovar. Limpando sessão.');
                await supabase.auth.signOut();
                // Não lançar erro aqui, deixar a requisição falhar normalmente
                // O erro será tratado pelo backend e o frontend pode redirecionar
              }
            }
          } catch (refreshErr: any) {
            console.error('Erro ao tentar renovar sessão:', refreshErr);
            // Se o token estiver expirado e não conseguir renovar, limpar sessão
            if (expiresIn <= 0 || refreshErr?.message?.includes('expired') || refreshErr?.message?.includes('invalid') || refreshErr?.message?.includes('JWT')) {
              console.warn('Token expirado e erro ao renovar. Limpando sessão.');
              await supabase.auth.signOut();
            }
          }
        }
      }
      // Removed automatic refresh when expires_at is missing to avoid unnecessary calls
    }
  } catch (error) {
    console.error('Erro ao obter/renovar sessão:', error);
  }

  // Fallback: buscar token do localStorage se Supabase não retornar
  if (!authToken && Platform.OS === 'web') {
    const userStr = getStorageItem('user');
    const sessionStr = getStorageItem('session');

    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        authToken = user.access_token || user.token;
      } catch {
        /* ignora */
      }
    }

    if (!authToken && sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        authToken = session.access_token || session?.access_token;
      } catch {
        /* ignora */
      }
    }
  }

  // 🧾 Montar headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  // ⏱️ Configurar timeout (30 segundos)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    // 🌐 Fazer requisição com timeout
    const response = await fetch(url, { 
      headers, 
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // ⚠️ Tratar erros
    if (!response.ok) {
      let errorText = '';
      let errorData: any = null;

      try {
        errorText = await response.text();
        errorData = errorText ? JSON.parse(errorText) : null;
      } catch {
        errorText = 'Erro desconhecido';
      }

      if (response.status === 401) {
        const errorMessage = errorData?.error || errorText;

        if (errorMessage?.includes('Supabase') || errorMessage?.includes('projeto')) {
          throw new Error(errorMessage + ' (Dica: verifique se frontend e backend usam o mesmo projeto Supabase)');
        }

        // NÃO redirecionar se for erro de login (credenciais inválidas)
        // O endpoint /auth/login deve apenas lançar o erro, sem redirecionar
        const isLoginEndpoint = endpoint.includes('/auth/login');
        
        // Se o erro for de token expirado ou inválido (e NÃO for endpoint de login), limpar sessão e redirecionar
        // Verificar especificamente por erros de token, não credenciais inválidas
        const isTokenError = errorMessage?.includes('expirado') || 
                            errorMessage?.includes('Token inválido') || 
                            errorMessage?.includes('JWT') ||
                            errorMessage?.includes('expired') ||
                            errorMessage?.includes('signature') ||
                            errorMessage?.includes('assinatura') ||
                            /token.*expir|jwt.*invalid|signature.*invalid/i.test(String(errorText));
        
        if (isTokenError && !isLoginEndpoint) {
          console.warn('Token expirado ou inválido detectado. Limpando sessão...');
          await handleInvalidToken();
          
          // Redirecionar para login apenas no web
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            // Usar setTimeout para evitar problemas de navegação durante o tratamento de erro
            setTimeout(() => {
              window.location.href = '/login';
            }, 100);
          }
          
          throw new Error('Sessão expirada. Por favor, faça login novamente.');
        }
        
        // Se for endpoint de login ou erro de credenciais, apenas lançar o erro sem redirecionar
      }

      throw new Error(errorData?.error || errorData?.message || errorText || `Erro ${response.status}`);
    }

    // ✅ Retornar JSON de sucesso
    const text = await response.text();
    if (!text) {
      // Resposta vazia, retornar objeto vazio
      return {};
    }
    
    try {
      return JSON.parse(text);
    } catch (parseError) {
      // Se não for JSON válido, retornar objeto vazio
      console.warn('Resposta não é JSON válido:', text);
      return {};
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // Tratar erro de timeout/abort
    if (error.name === 'AbortError') {
      throw new Error('A requisição demorou muito para responder. Verifique sua conexão ou tente novamente.');
    }
    
    // Re-throw outros erros
    throw error;
  }
};

// ====================================================// 🔑 Serviços de autenticação
// ====================================================
export const signUp = async (data: SignUpData) => {
  return apiRequest('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const login = async (data: LoginData) => {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const resendConfirmationEmail = async (email: string) => {
  return apiRequest('/auth/resend-confirmation', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

// ====================================================// 📦 Exportações
// ====================================================
export { apiRequest, API_BASE_URL };
