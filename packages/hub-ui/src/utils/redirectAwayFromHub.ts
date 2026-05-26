import { getDashboardPathForRole, type AppRole } from '@petimi/web-core';
import { getVetWebUrl } from '../config';

/** Redireciona usuários sem acesso Hub para o dashboard correto no app Vet (se configurado). */
export function redirectAwayFromHub(authRole: AppRole): void {
  const base = getVetWebUrl();
  if (base) {
    const path = getDashboardPathForRole(authRole);
    window.location.href = `${base.replace(/\/$/, '')}${path}`;
  } else if (typeof window !== 'undefined') {
    window.location.replace('/login');
  }
}
