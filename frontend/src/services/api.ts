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

  // 🔍 Buscar token local (web)
  if (Platform.OS === 'web') {
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

  // 🪄 Buscar token do Supabase (mobile/web)
  if (!authToken) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      authToken = session?.access_token || null;
    } catch {
      /* ignora */
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

  // 🌐 Fazer requisição
  const response = await fetch(url, { headers, ...options });

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
        } catch throw new Error(errorMessage);
      }
    }

    if (response.status === 401 && /invalid|expirad|assinatura|signature/i.test(String(errorText))) {
      await handleInvalidToken();
    }

    throw new Error(errorData?.error || errorData?.message || errorText || `Erro ${response.status}`);
  }

  // ✅ Retornar JSON de sucesso
  return response.json();
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

// ====================================================// 📦 Exportações
// ====================================================
export { apiRequest, API_BASE_URL };
