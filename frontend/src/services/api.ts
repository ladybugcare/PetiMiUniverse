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
      
      // Verificar se o token está próximo de expirar (menos de 5 minutos)
      const expiresAt = session.expires_at;
      if (expiresAt) {
        const expiresIn = expiresAt - Math.floor(Date.now() / 1000);
        if (expiresIn < 300) { // Menos de 5 minutos
          console.log('Token próximo de expirar, renovando...');
          const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshedSession) {
            authToken = refreshedSession.access_token;
          }
        }
      }
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

        if (errorMessage?.includes('expirado') || errorMessage?.includes('inválido')) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              console.warn('Token pode estar desatualizado. Considere fazer logout e login novamente.');
            }
          } catch (error) {
            throw new Error(errorMessage);
          }
        }
      }

      if (response.status === 401 && /invalid|expirad|assinatura|signature/i.test(String(errorText))) {
        await handleInvalidToken();
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
