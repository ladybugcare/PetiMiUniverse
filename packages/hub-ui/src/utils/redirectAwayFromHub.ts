import { getDashboardPathForRole, type AppRole } from '@petimi/web-core';
import { getVetWebUrl } from '../config';

/**
 * Destino no próprio Hub quando não podemos mandar o utilizador para o Vet.
 * Usado se VITE_VET_WEB_URL apontar por engano para o mesmo host do Hub (ex.: 3002),
 * ou se clinic_user.role ainda não estiver em localStorage — evita loop
 * /hub/clientes → /clinic-dashboard → /hub/clientes.
 */
const HUB_INTERNAL_LANDING: Partial<Record<AppRole, string>> = {
  CADMIN: '/hub/dashboard',
  CMANAGER: '/hub/dashboard',
  CASSISTANT: '/hub/appointments',
  CVET_INTERNAL: '/hub/clinica/atendimentos',
  CGROOMER: '/hub/banho-tosa',
  CFINANCE: '/hub/financeiro',
};

function hubInternalLandingPath(role: AppRole): string {
  return HUB_INTERNAL_LANDING[role] ?? '/login';
}

/** Redireciona usuários sem acesso Hub para o dashboard correto no app Vet (se configurado). */
export function redirectAwayFromHub(authRole: AppRole): void {
  const base = getVetWebUrl();
  if (base) {
    const path = getDashboardPathForRole(authRole);
    const baseTrim = base.replace(/\/$/, '');
    try {
      const target = new URL(path, baseTrim.endsWith('/') ? baseTrim : `${baseTrim}/`);
      if (typeof window !== 'undefined' && target.origin === window.location.origin) {
        console.warn(
          '[hub-ui] VITE_VET_WEB_URL coincide com o host do Hub ou URL inválida; a usar rota interna do Hub em vez de /clinic-dashboard no mesmo origin.',
        );
        window.location.replace(hubInternalLandingPath(authRole));
        return;
      }
    } catch {
      /* URL inválida — segue para href manual */
    }
    window.location.href = `${baseTrim}${path}`;
  } else if (typeof window !== 'undefined') {
    window.location.replace('/login');
  }
}
