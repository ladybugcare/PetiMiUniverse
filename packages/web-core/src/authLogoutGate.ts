/**
 * Gate de logout: marca sessão como encerrada *antes* do signOut de rede,
 * para polls/queries pararem sem disparar 401 no console.
 */

export const AUTH_LOGOUT_STARTED_EVENT = 'petimi:auth-logout-started';

let logoutInProgress = false;
let logoutGeneration = 0;

export function isAuthLogoutInProgress(): boolean {
  return logoutInProgress;
}

/** Geração monotônica — útil para ignorar respostas iniciadas antes do logout. */
export function getAuthLogoutGeneration(): number {
  return logoutGeneration;
}

/** Inicia logout: flag + evento (síncrono). Retorna a geração atual. */
export function beginAuthLogout(): number {
  logoutInProgress = true;
  logoutGeneration += 1;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_LOGOUT_STARTED_EVENT));
  }
  return logoutGeneration;
}

/** Libera o gate (login bem-sucedido ou fim do fluxo). */
export function endAuthLogout(): void {
  logoutInProgress = false;
}

/** Erro silencioso para abortar `apiRequest` durante logout (não é 401 de rede). */
export function createAuthLogoutAbortError(): Error & { code: string; status: number } {
  const err = new Error('Sessão encerrada') as Error & { code: string; status: number };
  err.name = 'AuthLogoutAbort';
  err.code = 'AUTH_LOGOUT';
  err.status = 0;
  return err;
}

export function isAuthLogoutAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string; code?: string }).name === 'AuthLogoutAbort' &&
    (error as { code?: string }).code === 'AUTH_LOGOUT'
  );
}
