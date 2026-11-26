import { getSupabase } from './supabase';
import { handleInvalidToken } from './tokenInvalid';
import {
  createAuthLogoutAbortError,
  endAuthLogout,
  isAuthLogoutAbortError,
  isAuthLogoutInProgress,
} from './authLogoutGate';
import { buildLoginHref } from './loginReturnUrl';

function isPublicAuthEndpoint(endpoint: string): boolean {
  return (
    endpoint.includes('/auth/login') ||
    endpoint.includes('/auth/forgot') ||
    endpoint.includes('/auth/reset') ||
    endpoint.includes('/auth/signup')
  );
}

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
/** Evita rajadas de GET idênticos (StrictMode, vários mounts, polling). */
const inFlightGets = new Map<string, Promise<unknown>>();
const CACHE_TTL = 30_000;
/** Incrementado em mutações para descartar respostas GET iniciadas antes da invalidação. */
let cacheGeneration = 0;

/** Limpa cache/in-flight de GET para o próximo refetch pós-mutação ver dados frescos. */
export function invalidateApiRequestCache(): void {
  cacheGeneration += 1;
  requestCache.clear();
  inFlightGets.clear();
}

/** Opções de `apiRequest` — `timeoutMs` não é passado ao `fetch`. */
export type ApiRequestOptions = RequestInit & {
  /** Timeout do cliente. Default 30s. Use valores maiores em lotes longos (ex.: checkout-bulk). */
  timeoutMs?: number;
};

async function executeApiRequest(
  endpoint: string,
  options: ApiRequestOptions = {},
  generationAtStart = cacheGeneration,
): Promise<unknown> {
  // Logout já iniciou: não dispara fetch autenticado (evita 401 de polls ainda vivos).
  // Endpoints públicos de auth precisam passar (ex.: login na mesma SPA sem reload).
  if (isAuthLogoutInProgress() && !isPublicAuthEndpoint(endpoint)) {
    throw createAuthLogoutAbortError();
  }

  const API_BASE_URL = getApiBaseUrl();
  const url = `${API_BASE_URL}${endpoint}`;
  const supabase = getSupabase();
  const { timeoutMs = 30_000, ...fetchOptions } = options;

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
    typeof FormData !== 'undefined' && fetchOptions.body != null && fetchOptions.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  if (isFormData) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs));

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
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

      if (response.status === 401) {
        const errorMessage = errorData?.error || errorText;
        if (errorMessage?.includes('Supabase') || errorMessage?.includes('projeto')) {
          throw new Error(
            errorMessage + ' (Dica: verifique se frontend e backend usam o mesmo projeto Supabase)'
          );
        }
        const isLoginEndpoint = endpoint.includes('/auth/login');
        // Polling de badge não deve derrubar a sessão inteira se um 401 pontual falhar.
        const isBestEffortAuthProbe =
          endpoint.includes('/notifications/unread-count') ||
          /\/support\/tickets\/unread-count\b/.test(endpoint) ||
          /\/unread-count\?/.test(endpoint);
        // Não tratar falha de rede/upstream (503/502) como sessão inválida.
        const isUpstreamAuthBlip =
          response.status === 503 ||
          response.status === 502 ||
          errorMessage?.includes('temporariamente indisponível') ||
          errorMessage?.includes('fetch failed') ||
          /AUTH_UPSTREAM_UNAVAILABLE|EXTERNAL_SERVICE_ERROR/i.test(String(errorText));
        const isTokenError =
          !isUpstreamAuthBlip &&
          (errorMessage?.includes('expirado') ||
            errorMessage?.includes('Token inválido') ||
            errorMessage?.includes('JWT') ||
            errorMessage?.includes('expired') ||
            errorMessage?.includes('signature') ||
            /token.*expir|jwt.*invalid|signature.*invalid/i.test(String(errorText)));

        if (isTokenError && !isLoginEndpoint && !isBestEffortAuthProbe) {
          console.warn('[web-core] Token inválido ou expirado. Limpando sessão...');
          await handleInvalidToken();
          if (typeof window !== 'undefined') {
            const loginHref = buildLoginHref();
            setTimeout(() => {
              window.location.href = loginHref;
            }, 100);
          }
          throw new Error('Sessão expirada. Por favor, faça login novamente.');
        }
      }

      const message = errorData?.error || errorData?.message || errorText || `Erro ${response.status}`;
      const err = new Error(message) as Error & {
        status?: number;
        body?: unknown;
        code?: string;
      };
      err.status = response.status;
      err.body = errorData;
      err.code =
        errorData && typeof errorData === 'object' && 'code' in errorData
          ? String((errorData as { code?: unknown }).code ?? '')
          : undefined;
      throw err;
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

    if (
      (options.method === 'GET' || !options.method) &&
      generationAtStart === cacheGeneration
    ) {
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
    if (isAuthLogoutAbortError(error)) {
      throw error;
    }
    const err = error as Error;
    if (err.name === 'AbortError') {
      throw new Error('A requisição demorou muito para responder. Verifique sua conexão ou tente novamente.');
    }
    const msg = String(err.message || '');
    if (
      err.name === 'TypeError' &&
      (/Failed to fetch/i.test(msg) || /NetworkError/i.test(msg) || /Load failed/i.test(msg))
    ) {
      throw new Error(
        'Não foi possível conectar ao servidor. Verifique se a API está em execução e tente novamente.',
      );
    }
    throw error;
  }
}

export const apiRequest = async (
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<unknown> => {
  if (isAuthLogoutInProgress() && !isPublicAuthEndpoint(endpoint)) {
    throw createAuthLogoutAbortError();
  }

  const isGet = options.method === 'GET' || !options.method;
  // timeoutMs não faz parte da chave de cache (só afeta o cliente).
  const { timeoutMs: _timeoutMs, ...cacheable } = options;
  const cacheKey = isGet ? `${endpoint}_${JSON.stringify(cacheable)}` : null;

  if (cacheKey) {
    const cached = requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    const pending = inFlightGets.get(cacheKey);
    if (pending) return pending;
  }

  const generationAtStart = cacheGeneration;
  const run = executeApiRequest(endpoint, options, generationAtStart);

  if (cacheKey) {
    const shared = run.finally(() => {
      inFlightGets.delete(cacheKey);
    });
    inFlightGets.set(cacheKey, shared);
    return shared;
  }

  const result = await run;
  // POST/PATCH/PUT/DELETE bem-sucedidos: próximo GET (ex.: day-board) não pode reutilizar cache.
  invalidateApiRequestCache();
  return result;
};

export const login = async (data: LoginData): Promise<unknown> => {
  endAuthLogout();
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};
