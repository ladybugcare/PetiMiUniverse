import { getSupabase } from './supabase';
import { handleInvalidToken } from './tokenInvalid';

/** Static `import.meta.env.*` keys so Vite can inject (see supabase.ts). */
export const getApiBaseUrl = (): string => {
  if (typeof process !== 'undefined' && process.env) {
    const p =
      process.env.VITE_API_URL ||
      process.env.REACT_APP_API_URL ||
      process.env.EXPO_PUBLIC_API_URL;
    if (p) return String(p);
  }
  try {
    const u =
      import.meta.env.VITE_API_URL ||
      import.meta.env.REACT_APP_API_URL ||
      import.meta.env.EXPO_PUBLIC_API_URL;
    if (u) return String(u);
  } catch {
    /* non-Vite */
  }
  return 'http://localhost:3000';
};

const getStorageItem = (key: string): string | null => {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
};

interface LoginData {
  email: string;
  password: string;
}

const requestCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 12000;
const max429Retries = 1;
const baseDelay = 1000;

export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<unknown> => {
  const API_BASE_URL = getApiBaseUrl();
  const url = `${API_BASE_URL}${endpoint}`;
  const supabase = getSupabase();

  if (options.method === 'GET' || !options.method) {
    const cacheKey = `${endpoint}_${JSON.stringify(options)}`;
    const cached = requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  let authToken: string | null = null;

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('[web-core] Erro ao obter sessão:', sessionError);
    }

    if (session) {
      authToken = session.access_token;
      const expiresAt = session.expires_at;
      if (expiresAt) {
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = expiresAt - now;
        if (expiresIn <= 300) {
          try {
            const {
              data: { session: refreshedSession },
              error: refreshError,
            } = await supabase.auth.refreshSession();
            if (!refreshError && refreshedSession) {
              authToken = refreshedSession.access_token;
            } else if (
              expiresIn <= 0 ||
              refreshError?.message?.includes('expired') ||
              refreshError?.message?.includes('invalid') ||
              refreshError?.message?.includes('JWT')
            ) {
              await supabase.auth.signOut();
            }
          } catch (refreshErr: unknown) {
            const msg = (refreshErr as Error)?.message || '';
            if (
              expiresIn <= 0 ||
              msg.includes('expired') ||
              msg.includes('invalid') ||
              msg.includes('JWT')
            ) {
              await supabase.auth.signOut();
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[web-core] Erro ao obter/renovar sessão:', error);
  }

  if (!authToken && typeof localStorage !== 'undefined') {
    const userStr = getStorageItem('user');
    const sessionStr = getStorageItem('session');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        authToken = user.access_token || user.token;
      } catch {
        /* ignore */
      }
    }
    if (!authToken && sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        authToken = session.access_token || session?.access_token;
      } catch {
        /* ignore */
      }
    }
  }

  const isFormData =
    typeof FormData !== 'undefined' && options.body != null && options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...((options.headers as Record<string, string>) || {}),
  };

  if (isFormData) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      headers,
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorText = '';
      let errorData: { error?: string; message?: string } | null = null;

      try {
        errorText = await response.text();
        errorData = errorText ? JSON.parse(errorText) : null;
      } catch {
        errorText = 'Erro desconhecido';
      }

      if (response.status === 429 && retryCount < max429Retries) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : baseDelay * 2;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return apiRequest(endpoint, options, retryCount + 1);
      }

      if (response.status === 401) {
        const errorMessage = errorData?.error || errorText;
        if (errorMessage?.includes('Supabase') || errorMessage?.includes('projeto')) {
          throw new Error(
            errorMessage + ' (Dica: verifique se frontend e backend usam o mesmo projeto Supabase)'
          );
        }
        const isLoginEndpoint = endpoint.includes('/auth/login');
        const isTokenError =
          errorMessage?.includes('expirado') ||
          errorMessage?.includes('Token inválido') ||
          errorMessage?.includes('JWT') ||
          errorMessage?.includes('expired') ||
          errorMessage?.includes('signature') ||
          /token.*expir|jwt.*invalid|signature.*invalid/i.test(String(errorText));

        if (isTokenError && !isLoginEndpoint) {
          console.warn('[web-core] Token inválido ou expirado. Limpando sessão...');
          await handleInvalidToken();
          if (typeof window !== 'undefined') {
            setTimeout(() => {
              window.location.href = '/login';
            }, 100);
          }
          throw new Error('Sessão expirada. Por favor, faça login novamente.');
        }
      }

      throw new Error(errorData?.error || errorData?.message || errorText || `Erro ${response.status}`);
    }

    const text = await response.text();
    if (!text) {
      return {};
    }
    let result: unknown;
    try {
      result = JSON.parse(text);
    } catch {
      console.warn('[web-core] Resposta não é JSON válido:', text);
      result = {};
    }

    if (options.method === 'GET' || !options.method) {
      const cacheKey = `${endpoint}_${JSON.stringify(options)}`;
      requestCache.set(cacheKey, { data: result, timestamp: Date.now() });
      if (requestCache.size > 100) {
        const oldestKey = requestCache.keys().next().value;
        if (oldestKey) requestCache.delete(oldestKey);
      }
    }

    return result;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw new Error('A requisição demorou muito para responder. Verifique sua conexão ou tente novamente.');
    }
    throw error;
  }
};

export const login = async (data: LoginData): Promise<unknown> => {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};
