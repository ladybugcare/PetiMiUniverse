/**
 * Preserva o destino pós-login (`?redirect=`) ao ir para /login
 * (logout, sessão expirada, deep link sem sessão).
 */

const AUTH_SHELL_PATHS = new Set([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/invite-signup',
  '/email-confirmed',
]);

/** Aceita só path interno relativo (evita open redirect). */
export function safeInternalReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return path;
}

function pathnameOf(path: string): string {
  return path.split(/[?#]/)[0] || '';
}

/** Páginas de auth/públicas onde não faz sentido “voltar” após login. */
export function isAuthShellReturnPath(path: string): boolean {
  const pathname = pathnameOf(path);
  if (AUTH_SHELL_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/accept-invitation')) return true;
  return false;
}

/**
 * Monta `/login` ou `/login?redirect=...` a partir de um path interno
 * (ou da URL atual do browser se `returnPath` for omitido).
 */
export function buildLoginHref(returnPath?: string | null): string {
  const candidate =
    returnPath !== undefined && returnPath !== null
      ? returnPath
      : typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : '';

  const safe = safeInternalReturnPath(candidate);
  if (!safe || isAuthShellReturnPath(safe)) {
    return '/login';
  }

  return `/login?redirect=${encodeURIComponent(safe)}`;
}
