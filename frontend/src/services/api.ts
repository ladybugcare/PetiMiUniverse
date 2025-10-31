const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

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
  
  // Buscar token de autenticação do localStorage
  const userStr = localStorage.getItem('user');
  const sessionStr = localStorage.getItem('session');
  let authToken = null;
  
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      authToken = user.access_token || user.token;
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  // Se não encontrou no user, tentar na session
  if (!authToken && sessionStr) {
    try {
      const session = JSON.parse(sessionStr);
      authToken = session.access_token || session?.access_token;
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  // Se ainda não encontrou, tentar buscar do Supabase client diretamente
  if (!authToken) {
    try {
      const { supabase } = await import('./supabase');
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
    const errorText = await response.text();
    // Tentar parsear como JSON primeiro
    try {
      const errorJson = JSON.parse(errorText);
      const errorMessage = errorJson.error || errorJson.message || errorText;
      const error = new Error(errorMessage);
      (error as any).response = errorJson;
      throw error;
    } catch (parseError) {
      // Se não for JSON, usar o texto diretamente
      throw new Error(errorText);
    }
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