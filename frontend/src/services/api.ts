import { Platform } from 'react-native';
import { supabase } from './supabase';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

// Helper para localStorage/AsyncStorage
const getStorageItem = (key: string): string | null => {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  // No mobile, retornar null - vamos usar apenas Supabase
  return null;
};

// Tipos base
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

// Função base para requests
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Buscar token de autenticação
  let authToken = null;
  
  // No web, tentar localStorage primeiro
  if (Platform.OS === 'web') {
    const userStr = getStorageItem('user');
    const sessionStr = getStorageItem('session');
    
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        authToken = user.access_token || user.token;
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    if (!authToken && sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        authToken = session.access_token || session?.access_token;
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
  
  // Sempre tentar buscar do Supabase (funciona tanto web quanto mobile)
  if (!authToken) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        authToken = session.access_token;
      }
    } catch (e) {
      // Ignore errors - pode não ter supabase disponível
    }
  }
  
  // Preparar headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  
  // Adicionar token de autenticação se disponível
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const response = await fetch(url, {
    headers,
    ...options,
  });

  if (!response.ok) {
    let errorText: string;
    let errorData: any;
    
    try {
      errorText = await response.text();
      errorData = errorText ? JSON.parse(errorText) : null;
    } catch {
      errorText = 'Erro desconhecido';
      errorData = null;
    }

    // Melhorar mensagem de erro para problemas de token
    if (response.status === 401) {
      const errorMessage = errorData?.error || errorText;
      
      // Se o erro menciona Supabase ou configuração, sugerir verificação
      if (errorMessage?.includes('Supabase') || errorMessage?.includes('projeto')) {
        throw new Error(errorMessage + ' (Dica: Verifique se frontend e backend usam o mesmo projeto Supabase)');
      }
      
      // Verificar se token pode estar expirado
      if (errorMessage?.includes('expirado') || errorMessage?.includes('inválido')) {
        // Tentar buscar novo token do Supabase
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            // Se tem novo token, pode ser que o problema seja no localStorage
            console.warn('Token pode estar desatualizado. Considere fazer logout e login novamente.');
          }
        } catch {}
        
        throw new Error(errorMessage);
      }
    }
    
    // Se inválido/expirado, limpar apenas chaves de auth para evitar JWT de outro ambiente
    if (response.status === 401 && /invalid|expirad|assinatura|signature/i.test(String(errorText))) {
      try {
        // Web: limpar localStorage
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
          localStorage.removeItem('user');
          localStorage.removeItem('session');
          localStorage.removeItem('clinic_user');
        }
        // Mobile: limpar sessão do Supabase (que usa AsyncStorage internamente)
        if (Platform.OS !== 'web') {
          await supabase.auth.signOut({ scope: 'local' });
        }
      } catch {}
    }

    // Para outros erros, usar mensagem padrão
    throw new Error(errorData?.error || errorData?.message || errorText || `Erro ${response.status}`);
  }

  return response.json();
};

// Auth services
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

// Export da função base para outros services
export { apiRequest, API_BASE_URL };