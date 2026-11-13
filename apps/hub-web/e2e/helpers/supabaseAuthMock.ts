import type { Page, Route } from '@playwright/test';

/** Sessão fake só para e2e com mocks — não é um token real. */
export const MOCK_RECOVERY_USER = {
  id: '00000000-0000-4000-8000-000000000099',
  email: 'qa.reset.mock@petmi.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};

function supabaseAuthPattern(): RegExp {
  return /\/auth\/v1\//i;
}

function storageKeyFromSupabaseUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    const ref = host.split('.')[0] || 'local';
    return `sb-${ref}-auth-token`;
  } catch {
    return 'sb-local-auth-token';
  }
}

export function buildMockSession(expiresInSec = 3600) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'e2e-mock-access-token',
    refresh_token: 'e2e-mock-refresh-token',
    token_type: 'bearer',
    expires_in: expiresInSec,
    expires_at: now + expiresInSec,
    user: MOCK_RECOVERY_USER,
  };
}

/**
 * Injeta sessão no localStorage do Supabase antes do app carregar.
 * Semeia refs conhecidos (local/staging/prod) para o storage key bater com o VITE_SUPABASE_URL do Vite.
 */
export async function seedMockAuthSession(page: Page, supabaseUrl?: string) {
  const session = buildMockSession();
  const keys = new Set<string>([
    'sb-jmfvoabsjxjjrxuzhxzh-auth-token',
    'sb-afstcbhcbrkvbihtjbww-auth-token',
    'sb-local-auth-token',
  ]);
  if (supabaseUrl) keys.add(storageKeyFromSupabaseUrl(supabaseUrl));

  await page.addInitScript(
    ({ storageKeys, value }) => {
      for (const storageKey of storageKeys) {
        window.localStorage.setItem(storageKey, value);
      }
    },
    { storageKeys: [...keys], value: JSON.stringify(session) },
  );
}

export type RecoverMockMode = 'ok' | 'error';
export type UserUpdateMockMode = 'ok' | 'same_password';

/**
 * Intercepta Auth do Supabase para testes de forgot/reset (sem Auth real).
 * Retorna um coletor do último recover (redirect_to / email).
 */
export async function installSupabaseAuthMocks(
  page: Page,
  options: { recover?: RecoverMockMode; updateUser?: UserUpdateMockMode } = {},
) {
  const recoverMode = options.recover ?? 'ok';
  const updateUserMode = options.updateUser ?? 'ok';
  const recoverCalls: Array<{ email: string | null; redirectTo: string | null }> = [];

  await page.route(supabaseAuthPattern(), async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method().toUpperCase();

    if (path.endsWith('/recover') && method === 'POST') {
      let email: string | null = null;
      let redirectTo: string | null = url.searchParams.get('redirect_to');
      try {
        const body = req.postDataJSON() as { email?: string; redirect_to?: string } | null;
        email = body?.email ?? null;
        if (body?.redirect_to) redirectTo = body.redirect_to;
      } catch {
        /* ignore */
      }
      recoverCalls.push({ email, redirectTo });

      if (recoverMode === 'error') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'server_error',
            error_description: 'Erro simulado de recuperação',
            message: 'Erro simulado de recuperação',
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
      return;
    }

    if (path.endsWith('/user') && method === 'PUT') {
      if (updateUserMode === 'same_password') {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          headers: { 'X-Supabase-Api-Version': '2024-01-01' },
          body: JSON.stringify({
            code: 'same_password',
            error_code: 'same_password',
            msg: 'New password should be different from the old password.',
            message: 'New password should be different from the old password.',
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: MOCK_RECOVERY_USER }),
      });
      return;
    }

    if (path.endsWith('/user') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_RECOVERY_USER),
      });
      return;
    }

    if (path.endsWith('/logout') && method === 'POST') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (path.includes('/token') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildMockSession()),
      });
      return;
    }

    await route.continue();
  });

  return {
    recoverCalls,
    lastRecover: () => recoverCalls[recoverCalls.length - 1] ?? null,
  };
}

export function e2eSupabaseUrl(): string {
  return (process.env.VITE_SUPABASE_URL || process.env.E2E_SUPABASE_URL || '').trim();
}
